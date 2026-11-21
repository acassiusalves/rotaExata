import { FieldValue,Timestamp,type DocumentSnapshot,type DocumentReference,type Firestore,type Transaction } from 'firebase-admin/firestore';
import { factsHash } from '../../../../functions/src/earnings-source-adapter.ts';
import { InvalidDispatchDriverError,resolveDispatchDriver } from '../../dispatch-driver.ts';
import {
  createRouteStopMutationGateway,type NewRoutePlan,type ExistingRoutePlan,type RoutePlanBatchInput,type SavedRoutePlanBatch,
} from '../../route-stop-mutations.ts';
import { RouteStructureConflictError } from '../../route-stop-reconciliation.ts';
import { staffPlanBatchSchema,type StaffPlanBatch } from '../../staff/route-plan-contract.ts';
import { staffManualStopDigest,staffManualStopId } from './editor-commands.ts';
import { staffRouteRevision } from './route-commands.ts';
import type { PlaceValue } from '../../types';
import { getStopIdentityKey } from '../../route-stop-utils.ts';
import { EarningsError } from '../earnings/transport.ts';

type Operator={userId:string;name:string;sourceUid?:string;scopeId?:string};
type Receipt={
  fingerprint:string;
  existingRoutes: Omit<SavedRoutePlanBatch['existingRoutes'][number],'stops'|'removedStops'|'changes'>[];
  createdRoutes:string[];
};

function transactionGateway(db:Firestore,tx:Transaction,writes:Array<()=>void>) {
  const archived=new Map<string,PlaceValue[]>();
  return createRouteStopMutationGateway({
    db,
    doc:(_db,collection,id)=>db.collection(collection).doc(id),
    runTransaction:(_db,work)=>work({
      get:async document=>{
        const ref=document as DocumentReference;
        const snapshot=await tx.get(ref);
        const data=snapshot.data() ?? {};
        if (ref.parent.id==='routes' && Array.isArray(data.stops)) {
          archived.set(ref.path,data.stops.filter(stop=>stop?.unlinkedAt));
          data.stops=data.stops.filter(stop=>!stop?.unlinkedAt);
        }
        return {exists:()=>snapshot.exists,data:()=>data};
      },
      update:(document,data)=>{
        const ref=document as DocumentReference;
        const history=archived.get(ref.path);
        const next=history?.length && Array.isArray(data.stops) ? {...data,stops:[...data.stops,...history]}:data;
        writes.push(()=>tx.update(ref,next));
      },
      set:(document,data)=>{writes.push(()=>tx.create(document as DocumentReference,data));},
    }),
    serverTimestamp:FieldValue.serverTimestamp,
    now:()=>Timestamp.now(),
    increment:FieldValue.increment,
  });
}

const serviceStopFields=['expectedValue','items','hasExchangeItems','operationType','lunnaClientCode'] as const;

async function wasCreatedByStaffDraft(db:Firestore,tx:Transaction,draft:DocumentSnapshot) {
  const createdAt=draft.createTime;
  if (!createdAt) return false;
  const receipts=await tx.get(db.collection('rotaStaffCommands')
    .where('resultRouteId','==',draft.id).select('routeId','fingerprint'));
  // Draft creation writes the private receipt in the same commit. Other route commands carry routeId.
  return receipts.docs.some(receipt=>receipt.createTime?.isEqual(createdAt)===true &&
    receipt.get('routeId')===undefined && /^[a-f0-9]{64}$/.test(receipt.get('fingerprint')));
}

function staysStandalone(stop:PlaceValue & Record<string,unknown>) {
  return !stop.orderNumber && !stop.lunnaClientCode && !Array.isArray(stop.items) && stop.isLunnaOrder!==true &&
    !stop.previousRouteId && !stop.fromRouteId && !stop.isRedelivery && !stop.operationType && !stop.hasExchangeItems;
}

async function standaloneDraftStopKeys(
  db:Firestore,tx:Transaction,draft:DocumentSnapshot,selected:PlaceValue[],planned:unknown[],
) {
  const identities=new Map<string,boolean>();
  const original=draft.get('stops');
  for (const stop of Array.isArray(original) ? original:[]) {
    const key=getStopIdentityKey(stop);
    if (key) identities.set(key,!identities.has(key) && staysStandalone(stop));
  }
  const keys=new Set<string>();
  const candidates=new Map<string,{key:string;digest:string}>();
  selected.forEach((stop,index)=>{
    const key=getStopIdentityKey(stop);
    if (!key || !staysStandalone(stop as PlaceValue & Record<string,unknown>)) return;
    if (typeof stop.id!=='string' || !staffManualStopId.test(stop.id)) {
      if (identities.get(key)) keys.add(key);
      return;
    }
    const digest=staffManualStopDigest(stop);
    if (digest && digest===staffManualStopDigest(planned[index])) candidates.set(stop.id,{key,digest});
  });
  if (candidates.size) {
    const receipts=await tx.getAll(...Array.from(candidates.keys(),id=>db.collection('rotaStaffCommands').doc(id)));
    const draftCreation=staffRouteRevision(draft.createTime);
    for (const receipt of receipts) {
      const candidate=candidates.get(receipt.id)!;
      if (receipt.get('kind')==='add-manual-stop' && receipt.get('entityId')===draft.id &&
          receipt.get('draftCreation')===draftCreation && receipt.get('stopDigest')===candidate.digest) {
        keys.add(candidate.key);
      }
    }
  }
  return keys;
}

function canonicalServiceStops<T extends {orderNumber?:string}>(stops:T[],service:DocumentSnapshot) {
  const all=service.get('allStops');
  const byNumber=new Map<string,Record<string,unknown>[]>();
  for (const stop of Array.isArray(all) ? all : []) {
    if (typeof stop?.orderNumber==='string') {
      const rows=byNumber.get(stop.orderNumber) ?? [];
      rows.push(stop);
      byNumber.set(stop.orderNumber,rows);
    }
  }
  return stops.map(stop=>{
    if (!stop.orderNumber) return stop;
    const found=byNumber.get(stop.orderNumber);
    if (found?.length!==1) throw new EarningsError(409,'staff_order_service_conflict');
    const facts=Object.fromEntries(serviceStopFields.filter(field=>Object.hasOwn(found[0],field))
      .map(field=>[field,found[0][field]]));
    return {...stop,...facts};
  });
}

const executed=(stop:PlaceValue)=>stop.deliveryStatus==='completed' || stop.deliveryStatus==='failed' ||
  !!(stop.arrivedAt || stop.completedAt || stop.photoUrl || stop.attemptPhotoUrl || stop.signatureUrl || stop.wentToLocation ||
    stop.payments?.length || stop.deliveredItemIds?.length);

function preserveRemovedExecution(result:SavedRoutePlanBatch) {
  for (const route of result.existingRoutes) {
    if (route.removedStops.some(executed)) {
      throw new EarningsError(409,'staff_stop_execution_exists');
    }
  }
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

  const services=new Map<string,DocumentSnapshot>();
  if (service) services.set(service.id,service);
  const linkedIds=[...new Set(routeDocs.map(route=>route.get('serviceId')).filter(value=>typeof value==='string' && value && !services.has(value)))];
  if (linkedIds.length) {
    const linked=await tx.getAll(...linkedIds.map(id=>db.collection('services').doc(id)));
    for (const doc of linked) {
      if (!doc.exists) throw new EarningsError(409,'staff_route_service_conflict');
      services.set(doc.id,doc);
    }
  }
  const draft=await (batch.draftDispatch ? tx.get(db.collection('routes').doc(batch.draftDispatch.routeId)):null);
  let provedStandaloneDraft:Set<string>|undefined;
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
    const orderIds=draft.get('lunnaOrderIds');
    const source=draft.get('source');
    const proved=(source==null || source==='rota-exata') && (orderIds==null || (Array.isArray(orderIds) && !orderIds.length)) &&
      await wasCreatedByStaffDraft(db,tx,draft);
    provedStandaloneDraft=proved ? await standaloneDraftStopKeys(db,tx,draft,selected.stops,target.plannedStops):new Set();
    const updated=arranged.map((route:{key:string})=>route.key===selected.key ? {...route,dispatched:true}:route);
    writes.push(()=>{
      if (updated.every((route:{dispatched:boolean})=>route.dispatched)) tx.delete(draft.ref);
      else tx.update(draft.ref,{organizedRoutes:updated,updatedAt:FieldValue.serverTimestamp()});
    });
  }

  const existingPlans=batch.existingPlans.map((plan,index)=>{
    const linked=services.get(routeDocs[index].get('serviceId'));
    const latest=routeDocs[index].get('stops') ?? [];
    const knownNumbers=new Set(Array.isArray(latest) ? latest.map(stop=>stop?.orderNumber):[]);
    const plannedStops=linked ? plan.plannedStops.map(stop=>{
      if (!stop.orderNumber || knownNumbers.has(stop.orderNumber)) return stop;
      return canonicalServiceStops([stop],linked)[0];
    }):plan.plannedStops;
    return {...plan,plannedStops,metadata:{...fields(plan.metadata ?? {}),
      ...(plan.unassignedStops ? {unassignedStops:plan.unassignedStops}:{}),
      ...(plan.metadata?.status==='dispatched' ? {dispatchedAt:FieldValue.serverTimestamp()}:{}),
    }};
  }) as unknown as ExistingRoutePlan[];
  const previousKeys=new Set<string>();
  const previousIds=new Set<string>();
  for (const doc of routeDocs) {
    const stops=doc.get('stops');
    for (const stop of Array.isArray(stops) ? stops:[]) {
      const key=getStopIdentityKey(stop);
      if (key) previousKeys.add(key);
      if (stop?.id!=null) previousIds.add(String(stop.id).trim().toLowerCase());
    }
  }
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
    const moved=new Set(batch.transferIntents?.filter(intent=>intent.targetRouteId===routeId).map(intent=>intent.stopKey));
    const canonicalStops=service ? canonicalServiceStops(plannedStops,service):plannedStops.map(stop=>{
      const key=getStopIdentityKey(stop);
      const sourceKey=stop._originalStopKey?.trim() || key;
      return key && sourceKey && !stop.orderNumber && !moved.has(sourceKey) &&
        !previousKeys.has(sourceKey) && !previousKeys.has(key) &&
        (stop.id==null || !previousIds.has(String(stop.id).trim().toLowerCase())) &&
        (!provedStandaloneDraft || provedStandaloneDraft.has(key)) ? {...stop,isLunnaOrder:false}:stop;
    });
    const serviceCode=service?.get('code') ?? '';
    let code='RT-'+String(currentCount+index+1).padStart(4,'0');
    if (service) {
      const base=serviceCode+'-'+(routeKey ?? String(index+1));
      code=base;
      let suffix=1;
      while (childCodes.has(code)) code=base+'-'+String(++suffix);
      childCodes.add(code);
    }
    return {routeId,plannedStops:canonicalStops,data:{...fields(other),status,code,createdAt:FieldValue.serverTimestamp(),createdBy:by,
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

async function applyUnlink(
  db:Firestore,tx:Transaction,unlink:NonNullable<StaffPlanBatch['unlink']>,result:SavedRoutePlanBatch,writes:Array<()=>void>,
) {
  const route=unlink.routeId ? await tx.get(db.collection('routes').doc(unlink.routeId)):null;
  const service=unlink.serviceId ? await tx.get(db.collection('services').doc(unlink.serviceId)):null;
  if ((route && (staffRouteRevision(route.updateTime)!==unlink.routeRevision ||
      (route.get('serviceId') ?? undefined)!==service?.id)) ||
      (service && (staffRouteRevision(service.updateTime)!==unlink.serviceRevision || service.get('status')==='completed'))) {
    throw new EarningsError(409,'staff_route_conflict');
  }
  const all=Array.isArray(service?.get('allStops')) ? service!.get('allStops') as PlaceValue[]:[];
  const fromService=all.filter(stop=>!stop.unlinkedAt && getStopIdentityKey(stop)===unlink.stopKey);
  const removed=route ? result.existingRoutes[0].removedStops:fromService;
  if (removed.length!==1 || fromService.length>1 || getStopIdentityKey(removed[0])!==unlink.stopKey || executed(removed[0])) {
    throw new EarningsError(409,'staff_route_conflict');
  }
  const stop=removed[0];
  if (service) {
    const siblings=await tx.get(db.collection('routes').where('serviceId','==',service.id));
    if (siblings.docs.some(doc=>doc.id!==route?.id && (doc.get('stops') ?? []).some((item:PlaceValue)=>
        !item.unlinkedAt && getStopIdentityKey(item)===unlink.stopKey))) throw new EarningsError(409,'staff_order_still_on_route');
    const next=all.filter(item=>item.unlinkedAt || getStopIdentityKey(item)!==unlink.stopKey);
    const orderIds=service.get('lunnaOrderIds');
    writes.push(()=>tx.update(service.ref,{
      allStops:next,'stats.totalDeliveries':next.filter(item=>!item.unlinkedAt).length,
      ...(Array.isArray(orderIds) ? {lunnaOrderIds:orderIds.filter(id=>id!==stop.orderNumber)}:{}),
      updatedAt:FieldValue.serverTimestamp(),
    }));
  }
  if (route) {
    const orderIds=route.get('lunnaOrderIds');
    const available=route.get('unassignedStops');
    writes.push(()=>tx.update(route.ref,{
      ...(Array.isArray(orderIds) ? {lunnaOrderIds:orderIds.filter(id=>id!==stop.orderNumber)}:{}),
      ...(Array.isArray(available) ? {unassignedStops:available.filter(item=>getStopIdentityKey(item)!==unlink.stopKey)}:{}),
      updatedAt:FieldValue.serverTimestamp(),
    }));
  }
  if (!stop.orderNumber) return;
  const sameNumber=db.collection('orders').where('number','==',stop.orderNumber);
  const linked=service ? sameNumber.where('rotaExataServiceId','==',service.id)
    : sameNumber.where('rotaExataRouteId','==',route!.id);
  const docs=await tx.get(linked.select('rotaExataServiceId','rotaExataRouteId'));
  const matches=docs.docs.filter(doc=>(doc.get('rotaExataServiceId') || undefined)===service?.id &&
    (!doc.get('rotaExataRouteId') || doc.get('rotaExataRouteId')===route?.id)).slice(0,2);
  if (!matches.length) {
    // The Source writer may have cleared the link already. Check all matching link fields before accepting that case.
    const remaining=docs.empty ? await tx.get(sameNumber.select('rotaExataServiceId','rotaExataRouteId')):docs;
    if (remaining.docs.some(doc=>doc.get('rotaExataServiceId') || doc.get('rotaExataRouteId'))) {
      throw new EarningsError(409,'staff_order_service_conflict');
    }
  }
  if (matches.length>1) {
    throw new EarningsError(409,'staff_order_service_conflict');
  }
  const order=matches[0];
  if (order && (order.get('rotaExataServiceId') || order.get('rotaExataRouteId'))) {
    writes.push(()=>tx.update(order.ref,{logisticsStatus:null,rotaExataServiceId:null,rotaExataServiceCode:null,
      rotaExataRouteId:null,rotaExataRouteCode:null,updatedAt:FieldValue.serverTimestamp()}));
  }
}

function auditStopChanges(db:Firestore,tx:Transaction,actor:Operator,batch:StaffPlanBatch,result:SavedRoutePlanBatch) {
  const writes=new Map<string,{eventType:string;routeId:string;stop:PlaceValue;identity:string;targetRouteId?:string}>();
  const put=(eventType:string,routeId:string,stop:PlaceValue,targetRouteId?:string)=>{
    const identity=getStopIdentityKey(stop);
    if (identity) writes.set(factsHash({eventType,routeId,identity,targetRouteId:targetRouteId ?? null}),
      {eventType,routeId,stop,identity,targetRouteId});
  };
  for (const route of result.existingRoutes) {
    for (const stop of route.removedStops) {
      put('point_removed_from_route',route.routeId,stop);
      const move=batch.transferIntents?.find(item=>item.sourceRouteId===route.routeId && item.stopKey===getStopIdentityKey(stop));
      if (move) put('point_transferred',route.routeId,stop,move.targetRouteId);
    }
    const additions=new Set(route.changes.filter(change=>change.changeType==='added').map(change=>change.stopKey));
    for (const stop of route.stops) if (additions.has(getStopIdentityKey(stop) ?? '')) {
      put('point_added_to_route',route.routeId,stop);
    }
  }
  for (const route of result.createdRoutes) for (const stop of route.stops) put('point_added_to_route',route.routeId,stop);
  for (const [key,{eventType,routeId,stop,identity,targetRouteId}] of writes) {
    const pointId=stop.id || stop.pointCode || stop.orderNumber || stop.placeId || identity;
    tx.create(db.collection('activity_log').doc('staff-'+batch.commandId+'-'+key),{
      timestamp:FieldValue.serverTimestamp(),staffAuditVersion:1,staffAuditOperationId:batch.commandId,
      staffScopeId:actor.scopeId ?? null,canonicalUserId:actor.userId,
      userId:actor.sourceUid ?? actor.userId,userName:actor.name,
      eventType,category:'LOGISTICS',entityType:'point',entityId:pointId,pointId,routeId,
      action:eventType==='point_removed_from_route' ? 'Ponto removido da rota':
        eventType==='point_transferred' ? 'Ponto transferido entre rotas':'Ponto adicionado à rota',
      metadata:{address:stop.address ?? '',orderNumber:stop.orderNumber ?? null,deliveryStatus:stop.deliveryStatus ?? null,
        ...(targetRouteId ? {sourceRouteId:routeId,targetRouteId}:{})},
    });
  }
}

async function replayPlan(db:Firestore,tx:Transaction,prior:Receipt) {
  const ids=[...prior.existingRoutes.map(route=>route.routeId),...prior.createdRoutes];
  const docs=ids.length ? await tx.getAll(...ids.map(id=>db.collection('routes').doc(id))):[];
  const stopsById=new Map(docs.map(doc=>[doc.id,(doc.get('stops') ?? []).filter((stop:PlaceValue)=>!stop.unlinkedAt)]));
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
      preserveRemovedExecution(result);
      if (batch.unlink) await applyUnlink(db,tx,batch.unlink,result,writes);
      await applyDispatchLinks(db,tx,batch,result,plans,writes);
      for (const write of writes) write();
      auditStopChanges(db,tx,actor,batch,result);
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
        userId:by,canonicalUserId:actor.userId,userName:actor.name,staffAuditVersion:1,staffScopeId:actor.scopeId ?? null,action:'Plano de rotas atualizado',
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

export async function isStaffPlanReplay(db:Firestore,actor:Operator,batch:StaffPlanBatch) {
  const receipt=await db.collection('rotaStaffCommands').doc(batch.commandId).get();
  return receipt.get('fingerprint')===factsHash({actor:actor.userId,batch});
}
