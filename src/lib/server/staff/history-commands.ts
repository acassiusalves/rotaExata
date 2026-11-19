import { FieldPath, FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { factsHash } from '../../../../functions/src/earnings-source-adapter.ts';
import type { PushOutcome } from '../../../../functions/src/push-outcome';
import type { HistoryRepairSelection, HistoryResendSelection } from '../../staff/history-contract.ts';
import { routeDocumentId } from '../../staff/route-contract.ts';
import { isSourceDriverAssignable } from '../../dispatch-driver.ts';
import { EarningsError } from '../earnings/transport.ts';
import { staffRouteRevision } from './route-commands.ts';

type Operator={userId:string;name:string;sourceUid?:string;role:string};
type ResendDelivery={routeId:string;driverId:string;profile:DocumentData};
const finalStatuses=['completed','completed_auto'];

export async function resendStaffHistoryRoute(db:Firestore,actor:Operator,command:HistoryResendSelection,
  send:(input:ResendDelivery)=>Promise<PushOutcome>) {
  const routeRef=db.collection('routes').doc(command.routeId);
  const commandRef=db.collection('rotaStaffHistoryResends').doc(command.commandId);
  const fingerprint=factsHash({actorId:actor.userId,command});
  const replayed=await db.runTransaction(async tx=>{
    const [prior,route]=await tx.getAll(commandRef,routeRef);
    if (prior.exists) {
      if (prior.get('fingerprint')!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
      return true;
    }
    if (!route.exists) throw new EarningsError(404,'staff_route_not_found');
    if (staffRouteRevision(route.updateTime)!==command.revision || route.get('status')!=='completed_auto') {
      throw new EarningsError(409,'staff_route_conflict');
    }
    const driverId=routeDocumentId.safeParse(route.get('driverId'));
    if (!driverId.success) throw new EarningsError(409,'staff_driver_unavailable');
    const driver=await tx.get(db.collection('users').doc(driverId.data));
    const profile=driver.data();
    if (!profile || profile.active===false || profile.disabled===true || !isSourceDriverAssignable(profile)) {
      throw new EarningsError(409,'staff_driver_unavailable');
    }
    const serviceId=routeDocumentId.safeParse(route.get('serviceId'));
    const service=serviceId.success ? await tx.get(db.collection('services').doc(serviceId.data)):null;
    const siblings=service?.exists ? await tx.get(db.collection('routes').where('serviceId','==',service.id)):null;
    const when=FieldValue.serverTimestamp();
    const who=actor.sourceUid ?? actor.userId;
    tx.update(routeRef,{status:'dispatched',resentAt:when,resentBy:who,staffHistoryResendId:command.commandId});
    if (service && siblings) {
      const remainder=siblings.docs.filter(snapshot=>snapshot.id!==route.id);
      const finished=remainder.filter(snapshot=>finalStatuses.includes(snapshot.get('status')));
      tx.update(service.ref,{
        status:remainder.some(snapshot=>snapshot.get('status')==='in_progress') ? 'in_progress':finished.length ? 'partial':'dispatched',
        'stats.completedRoutes':finished.length,
        'stats.completedDeliveries':finished.reduce((count,snapshot)=>{
          const stops=snapshot.get('stops');
          return count+(Array.isArray(stops) ? stops.filter(stop=>stop && !stop.unlinkedAt && stop.deliveryStatus==='completed').length:0);
        },0),
        completedAt:FieldValue.delete(),updatedAt:when,
      });
    }
    const code=route.get('code') ?? route.id;
    const driverName=route.get('driverInfo.name') ?? profile.displayName ?? profile.name ?? 'Motorista';
    tx.create(db.collection('activity_log').doc('staff-resend-'+command.commandId),{
      eventType:'route_resent',category:'LOGISTICS',entityType:'route',entityId:route.id,entityCode:code,
      serviceId:serviceId.success ? serviceId.data:null,serviceCode:route.get('serviceCode') ?? null,routeId:route.id,routeCode:code,
      userId:who,canonicalUserId:actor.userId,userName:actor.name,userRole:actor.role,timestamp:when,
      action:`Rota ${code} reenviada ao motorista ${driverName}`,
      metadata:{driverId:driverId.data,driverName},
      changes:[{field:'status',oldValue:'completed_auto',newValue:'dispatched',fieldLabel:'Status'}],
    });
    tx.create(commandRef,{fingerprint,actorId:actor.userId,routeId:route.id,driverId:driverId.data,state:'ready',createdAt:when});
    return false;
  });

  const claim=await db.runTransaction(async tx=>{
    const [log,route]=await tx.getAll(commandRef,routeRef);
    if (log.get('outcome')) return {outcome:log.get('outcome') as PushOutcome};
    if (log.get('state')==='dispatching') return {outcome:{outcome:'failed',errorCode:'staff_resend_dispatch_uncertain'} as PushOutcome};
    const driverId=log.get('driverId') as string;
    const driver=(await tx.get(db.collection('users').doc(driverId))).data();
    if (route.get('staffHistoryResendId')!==command.commandId || route.get('driverId')!==driverId ||
      !['dispatched','in_progress'].includes(route.get('status')) || !driver || driver.active===false || driver.disabled===true ||
      !isSourceDriverAssignable(driver)) {
      const outcome={outcome:'skipped_no_token'} as const;
      tx.update(commandRef,{state:'settled',outcome});
      return {outcome};
    }
    tx.update(commandRef,{state:'dispatching',startedAt:FieldValue.serverTimestamp()});
    return {delivery:{routeId:route.id,driverId,profile:driver}};
  });

  if (claim.outcome) return {ok:true,replayed,push:claim.outcome.outcome};
  let outcome:PushOutcome;
  try {
    outcome=await send(claim.delivery);
  } catch {
    outcome={outcome:'failed',errorCode:'staff_resend_dispatch_failed'};
  }
  await commandRef.update({state:'settled',outcome,settledAt:FieldValue.serverTimestamp()});
  return {ok:true,replayed,push:outcome.outcome};
}

const codePageSize=50;
export async function previewStaffRouteCodes(db:Firestore,cursor?:string) {
  let query=db.collection('routes').select('name','code').orderBy(FieldPath.documentId());
  if (cursor) query=query.startAfter(cursor);
  const page=await query.limit(codePageSize+1).get();
  const docs=page.docs.slice(0,codePageSize);
  return {
    routes:docs.filter(route=>!route.get('code')).map(route=>({
      id:route.id,name:typeof route.get('name')==='string' ? route.get('name') as string : 'Rota sem nome',
      revision:staffRouteRevision(route.updateTime)!,
    })),
    checked:docs.length,
    cursor:page.size>codePageSize ? docs.at(-1)!.id:null,
  };
}

export async function repairStaffRouteCodes(db:Firestore,actor:Operator,command:HistoryRepairSelection) {
  const counter=db.doc('counters/routeCode');
  const receiptRef=db.collection('rotaStaffHistoryCodeRepairs').doc(command.commandId);
  const fingerprint=factsHash({actorId:actor.userId,command});
  return db.runTransaction(async tx=>{
    const [receipt,current,...routes]=await tx.getAll(receiptRef,counter,...command.routes.map(({id})=>db.collection('routes').doc(id)));
    if (receipt.exists) {
      if (receipt.get('fingerprint')!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
      return {routes:receipt.get('routes') as {id:string;code:string}[],replayed:true};
    }
    for (const [index,route] of routes.entries()) {
      if (!route.exists || route.get('code') || staffRouteRevision(route.updateTime)!==command.routes[index].revision) {
        throw new EarningsError(409,'staff_route_code_conflict');
      }
    }
    const count=current.get('count') ?? 0;
    if (!Number.isSafeInteger(count) || count<0 || count>Number.MAX_SAFE_INTEGER-routes.length) {
      throw new EarningsError(503,'staff_route_counter_invalid');
    }
    const codes=routes.map((_,index)=>'RT-'+String(count+index+1).padStart(4,'0'));
    for (let start=0;start<codes.length;start+=30) {
      const used=await tx.get(db.collection('routes').where('code','in',codes.slice(start,start+30)).limit(1));
      if (!used.empty) throw new EarningsError(409,'staff_route_counter_conflict');
    }
    const when=FieldValue.serverTimestamp();
    const who=actor.sourceUid ?? actor.userId;
    const result=routes.map((route,index)=>{
      const code=codes[index];
      tx.update(route.ref,{code});
      tx.create(db.collection('activity_log').doc('staff-code-'+command.commandId+'-'+index),{
        eventType:'route_edited',category:'LOGISTICS',entityType:'route',entityId:route.id,entityCode:code,
        routeId:route.id,routeCode:code,userId:who,canonicalUserId:actor.userId,userName:actor.name,userRole:actor.role,
        timestamp:when,action:'Código da rota preenchido',
        changes:[{field:'code',fieldLabel:'Código',oldValue:null,newValue:code}],
      });
      return {id:route.id,code};
    });
    tx.set(counter,{count:count+routes.length},{merge:true});
    tx.create(receiptRef,{fingerprint,actorId:actor.userId,routes:result,createdAt:when});
    return {routes:result,replayed:false};
  });
}
