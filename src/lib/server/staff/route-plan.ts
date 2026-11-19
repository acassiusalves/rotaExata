import { FieldValue,Timestamp,type DocumentReference,type Firestore,type Transaction } from 'firebase-admin/firestore';
import { factsHash } from '../../../../functions/src/earnings-source-adapter.ts';
import { InvalidDispatchDriverError,resolveDispatchDriver } from '../../dispatch-driver.ts';
import {
  createRouteStopMutationGateway,type NewRoutePlan,type ExistingRoutePlan,type RoutePlanBatchInput,type SavedRoutePlanBatch,
} from '../../route-stop-mutations.ts';
import { RouteStructureConflictError } from '../../route-stop-reconciliation.ts';
import { staffPlanBatchSchema,type StaffPlanBatch } from '../../staff/route-plan-contract.ts';
import { staffRouteRevision } from './route-commands.ts';
import { getStopIdentityKey } from '../../route-stop-utils.ts';
import { EarningsError } from '../earnings/transport.ts';

type Operator={userId:string;name:string;sourceUid?:string};
type Receipt={
  fingerprint:string;
  existingRoutes: Omit<SavedRoutePlanBatch['existingRoutes'][number],'stops'|'removedStops'|'changes'>[];
  createdRoutes:string[];
};

function transactionGateway(db:Firestore,tx:Transaction,writes:Array<()=>void>) {
  return createRouteStopMutationGateway({
    db,
    doc:(_db,collection,id)=>db.collection(collection).doc(id),
    runTransaction:(_db,work)=>work({
      get:async document=>{
        const snapshot=await tx.get(document as DocumentReference);
        return {exists:()=>snapshot.exists,data:()=>snapshot.data() ?? {}};
      },
      update:(document,data)=>{writes.push(()=>tx.update(document as DocumentReference,data));},
      set:(document,data)=>{writes.push(()=>tx.create(document as DocumentReference,data));},
    }),
    serverTimestamp:FieldValue.serverTimestamp,
    now:()=>Timestamp.now(),
    increment:FieldValue.increment,
  });
}

async function canonicalPlan(db:Firestore,tx:Transaction,batch:StaffPlanBatch,by:string,writes:Array<()=>void>):Promise<RoutePlanBatchInput> {
  const routeIds=batch.existingPlans.map(plan=>plan.routeId);
  const serviceId=batch.serviceLink?.serviceId;
  const routeDocs=routeIds.length ? await tx.getAll(...routeIds.map(id=>db.collection('routes').doc(id))):[];
  const service=serviceId ? await tx.get(db.collection('services').doc(serviceId)):null;
  if (service && !service.exists) throw new EarningsError(404,'staff_service_not_found');
  if (routeDocs.some(route=>!route.exists)) throw new EarningsError(404,'staff_route_not_found');
  if (routeDocs.some(route=>!['draft','pending','in_progress','dispatched'].includes(route.get('status')))) {
    throw new EarningsError(409,'staff_route_closed');
  }
  if (batch.serviceLink && routeDocs.some(route=>route.get('serviceId')!==serviceId)) {
    throw new EarningsError(409,'staff_route_service_conflict');
  }

  const driverIds=new Set([
    ...batch.existingPlans.flatMap(plan=>plan.metadata?.driverId ? [plan.metadata.driverId]:[]),
    ...(batch.newRoutes ?? []).flatMap(plan=>plan.data.driverId ? [plan.data.driverId]:[]),
  ]);
  const driverData=new Map<string,Awaited<ReturnType<typeof resolveDispatchDriver>>>();
  for (const id of driverIds) {
    const driver=await resolveDispatchDriver(id,async uid=>{
      const data=(await tx.get(db.collection('users').doc(uid))).data();
      return data && data.disabled!==true && data.active!==false ? data:null;
    });
    driverData.set(id,driver);
  }

  function fields(plan:NonNullable<StaffPlanBatch['existingPlans'][number]['metadata']>) {
    const {plannedDate,driverId,...metadata}=plan;
    const driver=driverId ? driverData.get(driverId):undefined;
    return {...metadata,...(plannedDate ? {plannedDate:Timestamp.fromDate(new Date(plannedDate))}:{}),
      ...(driver ? {driverId:driver.id,driverInfo:{name:driver.name,vehicle:driver.vehicle}}:{})};
  }

  const serviceStops=Array.isArray(service?.get('allStops')) ? service!.get('allStops'):[];
  const hasConsistentServiceStops=(stops: Array<{orderNumber?:string}>)=>
    stops.every(stop=>!stop.orderNumber || serviceStops.some((found:{orderNumber?:string})=>found.orderNumber===stop.orderNumber));
  const draft=await (batch.draftDispatch ? tx.get(db.collection('routes').doc(batch.draftDispatch.routeId)):null);
  if (draft && batch.draftDispatch) {
    if (!draft.exists || draft.get('status')!=='draft' || draft.get('serviceId') ||
        staffRouteRevision(draft.updateTime)!==batch.draftDispatch.revision) throw new EarningsError(409,'staff_route_conflict');
    const arranged=draft.get('organizedRoutes') ?? [];
    const selected=arranged.find((route:{key:string;dispatched:boolean})=>route.key===batch.draftDispatch!.key && !route.dispatched);
    const target=batch.newRoutes![0];
    if (!selected || !Array.isArray(selected.stops) ||
        selected.stops.map(getStopIdentityKey).join('\0')!==target.plannedStops.map(getStopIdentityKey).join('\0')) {
      throw new EarningsError(409,'staff_route_conflict');
    }
    const updated=arranged.map((route:{key:string})=>route.key===selected.key ? {...route,dispatched:true}:route);
    writes.push(()=>{
      if (updated.every((route:{dispatched:boolean})=>route.dispatched)) tx.delete(draft.ref);
      else tx.update(draft.ref,{organizedRoutes:updated,updatedAt:FieldValue.serverTimestamp()});
    });
  }

  const existingPlans=batch.existingPlans.map(plan=>({
    ...plan,metadata:{...fields(plan.metadata ?? {}),
      ...(plan.unassignedStops ? {unassignedStops:plan.unassignedStops}:{}),
      ...(plan.metadata?.status==='dispatched' ? {dispatchedAt:FieldValue.serverTimestamp()}:{}),
    },
  })) as unknown as ExistingRoutePlan[];
  const newInput=batch.newRoutes ?? [];
  const standaloneCount=service ? 0:newInput.length;
  const counter=db.doc('counters/routeCode');
  const currentCount=standaloneCount ? (await tx.get(counter)).get('count') ?? 0:0;
  if (!Number.isSafeInteger(currentCount) || currentCount<0) throw new EarningsError(503,'staff_route_counter_invalid');
  if (standaloneCount) writes.push(()=>tx.set(counter,{count:currentCount+standaloneCount},{merge:true}));
  const existingChildren=service && newInput.length ?
    await tx.get(db.collection('routes').where('serviceId','==',service.id)):null;
  if (batch.serviceLink?.requireUnplanned && !existingChildren?.empty) throw new EarningsError(409,'staff_route_conflict');
  const childCodes=new Set(existingChildren?.docs.map(doc=>doc.get('code')));
  const newRoutes=newInput.map(({routeId,data,plannedStops},index)=>{
    const {status,routeKey,...other}=data;
    if (service && !hasConsistentServiceStops(plannedStops)) throw new EarningsError(409,'staff_order_service_conflict');
    const serviceCode=service?.get('code') ?? '';
    let code='RT-'+String(currentCount+index+1).padStart(4,'0');
    if (service) {
      const base=serviceCode+'-'+(routeKey ?? String(index+1));
      code=base;
      let suffix=1;
      while (childCodes.has(code)) code=base+'-'+String(++suffix);
      childCodes.add(code);
    }
    return {routeId,plannedStops,data:{...fields(other),status,code,createdAt:FieldValue.serverTimestamp(),createdBy:by,
      ...(status==='dispatched' ? {dispatchedAt:FieldValue.serverTimestamp()}:{}),
      ...(service ? {serviceId:service.id,serviceCode,source:'lunna'}:{source:'rota-exata'}),
    }};
  }) as unknown as NewRoutePlan[];
  return {existingPlans,newRoutes,transferIntents:batch.transferIntents,serviceLink:batch.serviceLink};
}

async function applyDispatchLinks(
  db:Firestore,tx:Transaction,batch:StaffPlanBatch,result:SavedRoutePlanBatch,plans:RoutePlanBatchInput,writes:Array<()=>void>,
) {
  const dispatches=[
    ...result.createdRoutes.map((route,index)=>({route,newRoute:plans.newRoutes![index].data,
      dispatch:plans.newRoutes![index].data.status==='dispatched'})),
    ...result.existingRoutes.map((route,index)=>({route,newRoute:null,dispatch:batch.existingPlans[index].metadata?.status==='dispatched'})),
  ];
  const serviceLinks=new Map<string,{dispatched:boolean;created:number}>();
  const assignedNumbers=new Set<string>();
  for (const {route,newRoute,dispatch} of dispatches) {
    if (!dispatch && !newRoute) continue;
    const target=db.collection('routes').doc(route.routeId);
    const data=newRoute ?? (await tx.get(target)).data()!;
    const code=typeof data.code==='string' ? data.code:undefined;
    const ids=route.stops.flatMap(stop=>stop.orderNumber ? [stop.orderNumber]:[]);
    if (newRoute && code) {
      route.stops=route.stops.map((stop,index)=>({...stop,pointCode:code+'-'+String(index+1).padStart(3,'0')}));
      writes.push(()=>tx.update(target,{stops:route.stops}));
    }
    if (typeof data.serviceId!=='string') continue;
    const serviceId=data.serviceId;
    const state=serviceLinks.get(serviceId) ?? {dispatched:false,created:0};
    state.dispatched ||= dispatch;
    state.created+=newRoute ? 1:0;
    serviceLinks.set(serviceId,state);
    if (!dispatch) continue;
    const routeNumbers=[...new Set(ids)];
    writes.push(()=>tx.update(target,{lunnaOrderIds:routeNumbers}));
    for (let index=0;index<routeNumbers.length;index+=30) {
      const numbers=routeNumbers.slice(index,index+30);
      if (numbers.some(number=>assignedNumbers.has(number))) throw new EarningsError(409,'staff_order_service_conflict');
      numbers.forEach(number=>assignedNumbers.add(number));
      const orders=await tx.get(db.collection('orders').where('number','in',numbers));
      const linked=orders.docs.filter(order=>order.get('rotaExataServiceId')===serviceId);
      if (linked.length!==numbers.length || new Set(linked.map(order=>order.get('number'))).size!==numbers.length ||
          linked.some(order=>order.get('rotaExataRouteId') && order.get('rotaExataRouteId')!==route.routeId)) {
        throw new EarningsError(409,'staff_order_service_conflict');
      }
      for (const order of linked) {
        writes.push(()=>tx.update(order.ref,{logisticsStatus:'em_rota',rotaExataRouteId:route.routeId,
          rotaExataRouteCode:code ?? null,updatedAt:FieldValue.serverTimestamp()}));
      }
    }
  }
  for (const [serviceId,summary] of serviceLinks) {
    const target=db.collection('services').doc(serviceId);
    const service=await tx.get(target);
    if (!service.exists || service.get('status')==='completed') throw new EarningsError(409,'staff_service_closed');
    const value=service.get('routeIds');
    const count=(Array.isArray(value) ? new Set(value).size:0)+summary.created;
    writes.push(()=>tx.update(target,{
      'stats.totalRoutes':count,...(summary.dispatched && ['organizing','dispatched'].includes(service.get('status')) ?
        {status:'dispatched'}:{}),updatedAt:FieldValue.serverTimestamp(),
    }));
  }
}

async function replayPlan(db:Firestore,tx:Transaction,prior:Receipt) {
  const ids=[...prior.existingRoutes.map(route=>route.routeId),...prior.createdRoutes];
  const docs=await tx.getAll(...ids.map(id=>db.collection('routes').doc(id)));
  const stopsById=new Map(docs.map(doc=>[doc.id,doc.get('stops') ?? []]));
  return {
    existingRoutes:prior.existingRoutes.map(route=>({...route,stops:stopsById.get(route.routeId),removedStops:[],changes:[]})),
    createdRoutes:prior.createdRoutes.map(routeId=>({routeId,stops:stopsById.get(routeId)})),
    replayed:true,
  };
}

export async function applyStaffPlanBatch(db:Firestore,actor:Operator,value:unknown):Promise<SavedRoutePlanBatch & {replayed:boolean}> {
  const batch=staffPlanBatchSchema.parse(value);
  const fingerprint=factsHash({actor:actor.userId,batch});
  const receipt=db.collection('rotaStaffCommands').doc(batch.commandId);
  try {
    return await db.runTransaction(async tx=>{
      const previous=await tx.get(receipt);
      if (previous.exists) {
        const row=previous.data() as Receipt;
        if (row.fingerprint!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
        return await replayPlan(db,tx,row);
      }
      const by=actor.sourceUid ?? actor.userId;
      const writes:Array<()=>void>=[];
      const plans=await canonicalPlan(db,tx,batch,by,writes);
      const result=await transactionGateway(db,tx,writes).saveRoutePlanBatchAtomically(plans);
      await applyDispatchLinks(db,tx,batch,result,plans,writes);
      for (const write of writes) write();
      for (const route of result.existingRoutes) {
        if (!route.driverId || !route.changes.length || !['dispatched','in_progress'].includes(route.status)) continue;
        const noticeId=factsHash({commandId:batch.commandId,routeId:route.routeId});
        route.noticeId=noticeId;
        tx.set(db.collection('routeChangeNotifications').doc(route.routeId),{
          routeId:route.routeId,driverId:route.driverId,changes:JSON.parse(JSON.stringify(route.changes)),
          staffNoticeId:noticeId,createdAt:FieldValue.serverTimestamp(),acknowledged:false,
        });
        tx.create(db.collection('rotaStaffRouteNotices').doc(noticeId),{
          routeId:route.routeId,driverId:route.driverId,changeCount:route.changes.length,
          state:'pending',createdAt:FieldValue.serverTimestamp(),
        });
        tx.update(db.collection('routes').doc(route.routeId),{
          pendingChanges:true,lastModifiedAt:FieldValue.serverTimestamp(),lastModifiedBy:by,
        });
      }
      const existingRoutes=result.existingRoutes.map(({routeId,previousStatus,previousDriverId,status,driverId,noticeId})=>({
        routeId,previousStatus,status,...(previousDriverId ? {previousDriverId}:{}),...(driverId ? {driverId}:{}),...(noticeId ? {noticeId}:{}),
      }));
      const createdRoutes=result.createdRoutes.map(route=>route.routeId);
      tx.create(receipt,{fingerprint,actorId:actor.userId,existingRoutes,createdRoutes,createdAt:FieldValue.serverTimestamp()});
      tx.create(db.collection('activity_log').doc('staff-'+batch.commandId),{
        timestamp:FieldValue.serverTimestamp(),eventType:'route_updated',entityType:'route',entityId:batch.commandId,
        userId:by,canonicalUserId:actor.userId,userName:actor.name,action:'Plano de rotas atualizado',
        metadata:{routeIds:existingRoutes.map(route=>route.routeId),createdRoutes},
      });
      return {...result,replayed:false};
    });
  } catch(error) {
    if (error instanceof RouteStructureConflictError) throw new EarningsError(409,'staff_route_conflict');
    if (error instanceof InvalidDispatchDriverError) throw new EarningsError(409,'staff_driver_unavailable');
    throw error;
  }
}
