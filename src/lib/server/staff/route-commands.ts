import { FieldValue,Timestamp,type DocumentData,type Firestore,type Transaction } from 'firebase-admin/firestore';
import { factsHash,firestoreRevision,protectCompletion } from '../../../../functions/src/earnings-source-adapter.ts';
import { InvalidDispatchDriverError,resolveDispatchDriver } from '../../dispatch-driver.ts';
import { routeDocumentId,staffRouteCommandSchema,staffServiceCloseSchema,type StaffRouteCommand } from '../../staff/route-contract.ts';
import { EarningsError } from '../earnings/transport.ts';

type RouteOperator={userId:string;name:string;sourceUid?:string};
type Outcome={ok:true;routeId:string;replayed:boolean};
const final=(status:unknown)=>status==='completed' || status==='completed_auto';

export function staffRouteRevision(updateTime:{seconds:number;nanoseconds:number}|undefined) {
  return updateTime ? firestoreRevision(updateTime) : undefined;
}

async function assignableDriver(db:Firestore,tx:Transaction,id:string) {
  try {
    return await resolveDispatchDriver(id,async uid=>{
      const doc=(await tx.get(db.collection('users').doc(uid))).data();
      return doc && doc.active!==false && doc.disabled!==true ? doc : null;
    });
  } catch(error) {
    if (error instanceof InvalidDispatchDriverError) throw new EarningsError(409,'staff_driver_unavailable');
    throw error;
  }
}

function copyStops(stops:unknown) {
  if (!Array.isArray(stops)) return [];
  return stops.filter(stop=>stop && typeof stop==='object' && !stop.unlinkedAt).map(stop=>{
    const {pointCode,arrivedAt,completedAt,deliveryStatus,failedAt,photoUrl,attemptPhotoUrl,signatureUrl,
      wentToLocation,failureReason,payments,reconciled,reconciledAt,reconciledBy,reconciledMethod,aiExtractedValue,
      deliveredItemIds,routeId,previousRouteId,previousRouteCode,movedAt,movedBy,movedByName,movedFromPointCode,...plan}=stop;
    return plan;
  });
}

function serviceProgress(routes:DocumentData[],before:DocumentData) {
  const completed=routes.filter(route=>final(route.status));
  const finished=routes.length>0 && completed.length===routes.length;
  const status=finished ? 'completed' : routes.some(route=>route.status==='in_progress') ? 'in_progress' :
    completed.length ? 'partial' : routes.length ? 'dispatched' : before.status;
  return {
    'stats.completedRoutes':completed.length,
    'stats.completedDeliveries':completed.reduce((sum,route)=>sum+(Array.isArray(route.stops) ?
      route.stops.filter(stop=>!stop?.unlinkedAt && stop?.deliveryStatus==='completed').length : 0),0),
    status,
    completedAt:finished ? before.completedAt ?? FieldValue.serverTimestamp() : FieldValue.delete(),
    updatedAt:FieldValue.serverTimestamp(),
  };
}

async function completeRoute(db:Firestore,tx:Transaction,routeId:string,route:DocumentData,actor:RouteOperator) {
  if (final(route.status)) return;
  const routeRef=db.collection('routes').doc(routeId);
  const evidenceRef=db.collection('rotaEarningRouteEvidence').doc(routeId);
  const evidence=await tx.get(evidenceRef);
  const serviceId=routeDocumentId.safeParse(route.serviceId);
  const service=serviceId.success ? await tx.get(db.collection('services').doc(serviceId.data)) : null;
  const siblings=service?.exists ? await tx.get(db.collection('routes').where('serviceId','==',service.id)) : null;
  const closed={status:'completed',completedAt:Timestamp.now(),completedBy:actor.sourceUid ?? actor.userId};
  const proof=protectCompletion({...route,...closed,earningsSourceStart:evidence.data()?.start},'admin-server-v1');
  tx.update(routeRef,closed);
  tx.set(evidenceRef,{completion:proof ?? null},{merge:true});
  if (service && siblings) {
    const rows=siblings.docs.map(snapshot=>snapshot.id===routeId ? {...snapshot.data(),...closed} : snapshot.data());
    tx.update(service.ref,serviceProgress(rows,service.data() ?? {}));
  }
}

const events:Record<StaffRouteCommand['kind'],{type:string;label:string}>={
  rename:{type:'route_edited',label:'Nome atualizado'},
  assign:{type:'route_dispatched',label:'Motorista atribuído'},
  duplicate:{type:'route_created',label:'Rota duplicada'},
  delete:{type:'route_deleted',label:'Rota excluída'},
  complete:{type:'route_completed',label:'Rota concluída'},
};

export async function applyStaffRouteCommand(db:Firestore,actor:RouteOperator,inputRouteId:string,value:unknown):Promise<Outcome> {
  const routeId=routeDocumentId.parse(inputRouteId);
  const command=staffRouteCommandSchema.parse(value);
  const fingerprint=factsHash({ actor:actor.userId,routeId,command });
  const receipt=db.collection('rotaStaffCommands').doc(command.commandId);
  const route=db.collection('routes').doc(routeId);
  const copy=db.collection('routes').doc();
  return db.runTransaction(async tx=>{
    const [prior,current]=await tx.getAll(receipt,route);
    if (prior.exists) {
      if (prior.get('fingerprint')!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
      return {ok:true,routeId:prior.get('resultRouteId') as string,replayed:true};
    }
    if (!current.exists) throw new EarningsError(404,'staff_route_not_found');
    if (staffRouteRevision(current.updateTime)!==command.revision) throw new EarningsError(409,'staff_route_conflict');

    const data=current.data()!;
    let target=route;
    let code=data.code as string|undefined;
    if (command.kind==='rename') tx.update(route,{name:command.name});
    else if (command.kind==='assign') {
      if (final(data.status)) throw new EarningsError(409,'staff_route_closed');
      const driver=await assignableDriver(db,tx,command.driverId);
      tx.update(route,{driverId:driver.id,driverInfo:{name:driver.name,vehicle:driver.vehicle},
        ...(data.status==='draft' || data.status==='pending' ? {status:'dispatched'}:{})});
    } else if (command.kind==='delete') {
      if (data.serviceId) throw new EarningsError(409,'staff_route_linked_to_service');
      tx.delete(route);
    } else if (command.kind==='duplicate') {
      const originalDriver=routeDocumentId.safeParse(data.driverId);
      const driver=originalDriver.success ? await assignableDriver(db,tx,originalDriver.data):null;
      const counter=db.doc('counters/routeCode');
      const currentCount=(await tx.get(counter)).get('count') ?? 0;
      if (!Number.isSafeInteger(currentCount) || currentCount<0) throw new EarningsError(503,'staff_route_counter_invalid');
      const count=Number(currentCount)+1;
      code='RT-'+String(count).padStart(4,'0');
      const stops=copyStops(data.stops).map((stop,index)=>({...stop,pointCode:code+'-'+String(index+1).padStart(3,'0')}));
      tx.set(counter,{count},{merge:true});
      tx.create(copy,{
        code,name:String(data.name || 'Rota')+' (Cópia)',stops,
        ...(data.origin ? {origin:data.origin}:{}),encodedPolyline:data.encodedPolyline ?? '',
        distanceMeters:data.distanceMeters ?? 0,duration:data.duration ?? '0s',
        plannedDate:data.plannedDate ?? FieldValue.serverTimestamp(),visible:data.visible!==false,
        status:driver?'dispatched':'draft',source:'rota-exata',
        ...(driver ? {driverId:driver.id,driverInfo:{name:driver.name,vehicle:driver.vehicle}}:{}),
        createdBy:actor.sourceUid ?? actor.userId,createdAt:FieldValue.serverTimestamp(),
      });
      target=copy;
    } else await completeRoute(db,tx,routeId,data,actor);

    const event=events[command.kind];
    tx.create(db.collection('activity_log').doc('staff-'+command.commandId),{
      timestamp:FieldValue.serverTimestamp(),eventType:event.type,entityType:'route',entityId:target.id,routeId:target.id,
      userId:actor.sourceUid ?? actor.userId,canonicalUserId:actor.userId,userName:actor.name,
      ...(code ? {routeCode:code,entityCode:code}:{}),
      action:event.label,
    });
    tx.create(receipt,{fingerprint,routeId,resultRouteId:target.id,actorId:actor.userId,createdAt:FieldValue.serverTimestamp()});
    return {ok:true,routeId:target.id,replayed:false};
  });
}

export async function applyStaffServiceClose(db:Firestore,actor:RouteOperator,inputServiceId:string,value:unknown) {
  const serviceId=routeDocumentId.parse(inputServiceId);
  const command=staffServiceCloseSchema.parse(value);
  const fingerprint=factsHash({actor:actor.userId,serviceId,command});
  const receipt=db.collection('rotaStaffCommands').doc(command.commandId);
  const service=db.collection('services').doc(serviceId);
  return db.runTransaction(async tx=>{
    const [prior,current]=await tx.getAll(receipt,service);
    if (prior.exists) {
      if (prior.get('fingerprint')!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
      return {ok:true,completedRoutes:prior.get('completedRoutes') as number,replayed:true};
    }
    if (!current.exists) throw new EarningsError(404,'staff_service_not_found');
    if (staffRouteRevision(current.updateTime)!==command.revision) throw new EarningsError(409,'staff_route_conflict');

    const source=current.data()!;
    const createdAt=source.createdAt;
    if (!(createdAt instanceof Timestamp) || Date.now()-createdAt.toMillis()<48*3_600_000) {
      throw new EarningsError(409,'staff_service_not_old_enough');
    }
    const routes=await tx.get(db.collection('routes').where('serviceId','==',serviceId));
    const toClose=routes.docs.filter(route=>!final(route.get('status')));
    const by=actor.sourceUid ?? actor.userId;
    for (const route of toClose) tx.update(route.ref,{
      status:'completed_auto',autoCompletedAt:FieldValue.serverTimestamp(),forceCompletedBy:by,
    });
    tx.update(service,{
      status:'completed',completedAt:source.completedAt ?? FieldValue.serverTimestamp(),forceCompletedBy:by,
      'stats.completedRoutes':routes.size,'stats.completedDeliveries':source.stats?.totalDeliveries ?? 0,
    });
    tx.create(db.collection('activity_log').doc('staff-'+command.commandId),{
      timestamp:FieldValue.serverTimestamp(),eventType:'service_force_completed',entityType:'service',entityId:serviceId,
      userId:by,canonicalUserId:actor.userId,userName:actor.name,serviceId,serviceCode:source.code ?? serviceId,
      action:'Serviço concluído pelo administrador',
      changes:[{field:'status',fieldLabel:'Status',oldValue:source.status ?? null,newValue:'completed'}],
      metadata:{totalRoutes:routes.size,completedRoutes:toClose.length},
    });
    tx.create(receipt,{fingerprint,serviceId,actorId:actor.userId,completedRoutes:toClose.length,createdAt:FieldValue.serverTimestamp()});
    return {ok:true,completedRoutes:toClose.length,replayed:false};
  });
}
