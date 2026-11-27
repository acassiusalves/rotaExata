import { randomUUID } from 'node:crypto';
import { FieldValue,type Firestore } from 'firebase-admin/firestore';
import { factsHash } from '../../../../functions/src/earnings-source-adapter.ts';
import { staffEditorCommandSchema,type StaffEditorCommand } from '../../staff/editor-contract.ts';
import { routeDocumentId } from '../../staff/route-contract.ts';
import { availableRouteStops,getStopIdentityKey,poolStopKeys } from '../../route-stop-utils.ts';
import type { PlaceValue } from '../../types';
import { EarningsError } from '../earnings/transport.ts';
import { staffRouteRevision } from './route-commands.ts';
import { servicePoolState,type PoolVisibility } from './pool-state.ts';

type EditorActor={userId:string;sourceUid?:string;name:string};
export const staffManualStopPrefix='staff-manual-';
export const staffManualStopId=/^staff-manual-[a-f0-9-]{36}$/;

export function normalizedStaffStopId(stop:Partial<PlaceValue> | null | undefined) {
  return stop?.id==null ? '':String(stop.id).trim().toLowerCase();
}

export function assertDistinctStaffArrangedStops(routes:{stops:Partial<PlaceValue>[]}[]) {
  const identities=new Set<string>();
  const ids=new Set<string>();
  for (const route of routes) {
    if (!Array.isArray(route?.stops)) throw new EarningsError(409,'staff_route_conflict');
    for (const stop of route.stops) {
      const key=getStopIdentityKey(stop);
      const id=normalizedStaffStopId(stop);
      if ((key && identities.has(key)) || (id && ids.has(id))) throw new EarningsError(409,'staff_route_conflict');
      if (key) identities.add(key);
      if (id) ids.add(id);
    }
  }
}

const activeStatuses=['draft','pending','dispatched','in_progress'];

export async function applyStaffEditorCommand(db:Firestore,actor:EditorActor,value:unknown,visibility?:PoolVisibility) {
  const command:StaffEditorCommand=staffEditorCommandSchema.parse(value);
  const collection='routes';
  const entityId=command.routeId;
  const target=db.collection(collection).doc(entityId);
  const receipt=db.collection('rotaStaffCommands').doc(command.commandId);
  const fingerprint=factsHash({actor:actor.userId,command});
  const stamp=FieldValue.serverTimestamp;
  return db.runTransaction(async tx=>{
    const [previous,snapshot]=await tx.getAll(receipt,target);
    if (previous.exists) {
      if (previous.get('fingerprint')!==fingerprint) throw new EarningsError(409,'staff_command_conflict');
      const stopId=previous.get('manualStopId');
      return {ok:true,replayed:true,...(command.kind==='add-manual-stop' && typeof stopId==='string' ?
        {stop:{...command.stop,id:stopId}}:{})};
    }
    if (!snapshot.exists) throw new EarningsError(404,'staff_resource_not_found');
    if (staffRouteRevision(snapshot.updateTime)!==command.revision) throw new EarningsError(409,'staff_route_conflict');
    const data=snapshot.data()!;
    if (collection==='routes' && !activeStatuses.includes(data.status)) throw new EarningsError(409,'staff_route_closed');

    let manualStop;
    switch (command.kind) {
      case 'arrange': {
        if (data.status!=='draft') throw new EarningsError(409,'staff_route_conflict');
        const saved=(Array.isArray(data.organizedRoutes) ? data.organizedRoutes:[]).filter(route=>route?.dispatched===true);
        const alreadyDispatched=new Set(saved.map(route=>route.key));
        const keys=new Set(command.routes.map(route=>route.key));
        if (keys.size!==command.routes.length || command.routes.some(route=>alreadyDispatched.has(route.key))) {
          throw new EarningsError(409,'staff_route_conflict');
        }
        const pending=command.routes.map(route=>({...route,dispatched:false}));
        const organizedRoutes=[...saved,...pending];
        assertDistinctStaffArrangedStops([
          ...organizedRoutes,...(command.unassignedStops ? [{stops:command.unassignedStops}]:[]),
        ]);
        tx.update(target,{organizedRoutes,
          ...(command.unassignedStops ? {unassignedStops:command.unassignedStops}:{}),
          routeNames:Object.fromEntries(organizedRoutes.map(route=>[route.key,route.name])),updatedAt:stamp()});
        break;
      }
      case 'add-manual-stop': {
        if (data.status!=='draft' || data.serviceId) throw new EarningsError(409,'staff_route_conflict');
        manualStop={...command.stop,id:staffManualStopPrefix+randomUUID()};
        tx.create(db.collection('rotaStaffCommands').doc(manualStop.id),{
          kind:command.kind,entityId,draftCreation:staffRouteRevision(snapshot.createTime),
          createdAt:stamp(),
        });
        break;
      }
      case 'edit-pool-stop': {
        const serviceId=typeof data.serviceId==='string' ? data.serviceId:undefined;
        const service=serviceId ? await tx.get(db.collection('services').doc(serviceId)):undefined;
        if (service && (!service.exists || service.get('status')==='completed')) {
          throw new EarningsError(409,'staff_service_closed');
        }
        const siblings=serviceId ? (await tx.get(db.collection('routes').where('serviceId','==',serviceId))).docs:[snapshot];
        const {targetPool,members,candidates,mirrors,excluded}=servicePoolState(snapshot,siblings,service,visibility);
        const existing=availableRouteStops(candidates,mirrors.map(row=>row.stops),excluded)
          .find(stop=>getStopIdentityKey(stop)===command.stopKey);
        if (!existing) throw new EarningsError(409,'staff_route_conflict');
        if (serviceId && existing.orderNumber) {
          const orders=await tx.get(db.collection('orders').where('number','==',existing.orderNumber));
          if (orders.docs.filter(order=>order.get('rotaExataServiceId')===serviceId).length!==1) {
            throw new EarningsError(409,'staff_order_service_conflict');
          }
        }
        const {id:_id,pointCode:_pointCode,orderNumber:_orderNumber,...fields}=command.stop;
        const edited={...existing,...fields};
        if (getStopIdentityKey(edited)!==command.stopKey || !edited.lat || !edited.lng) {
          throw new EarningsError(409,'staff_route_conflict');
        }
        const keys=new Set(poolStopKeys(edited));
        const updateCopies=(copies:PlaceValue[])=>{
          const index=copies.findIndex(stop=>poolStopKeys(stop).some(key=>keys.has(key)));
          return index<0 ? [...copies,edited]:copies.map((stop,i)=>index===i ? edited:stop);
        };
        tx.update(target,{unassignedStops:updateCopies(targetPool),updatedAt:stamp()});
        if (service) {
          const allStops=updateCopies(members);
          tx.update(service.ref,{allStops,'stats.totalDeliveries':allStops.filter(stop=>!stop.unlinkedAt).length,updatedAt:stamp()});
        }
        break;
      }
      case 'route-pool': {
        const assigned=new Set((Array.isArray(data.stops) ? data.stops:[]).map(stop=>String(stop?.id ?? stop?.placeId)));
        if (command.stops.some(stop=>assigned.has(stop.id))) throw new EarningsError(409,'staff_route_conflict');
        tx.update(target,{unassignedStops:command.stops,updatedAt:stamp()});
        break;
      }
      case 'delete-draft': {
        if (data.status!=='draft') throw new EarningsError(409,'staff_route_conflict');
        const serviceId=routeDocumentId.safeParse(data.serviceId);
        if (serviceId.success) {
          const service=await tx.get(db.collection('services').doc(serviceId.data));
          const link=service.get('routeIds');
          if (service.exists && Array.isArray(link)) {
            const routeIds=link.filter(id=>id!==entityId);
            tx.update(service.ref,{routeIds,'stats.totalRoutes':routeIds.length,updatedAt:stamp()});
          }
        }
        tx.delete(target);
        break;
      }
    }
    tx.create(receipt,{fingerprint,actorId:actor.userId,entityId,kind:command.kind,createdAt:stamp(),
      ...(manualStop ? {manualStopId:manualStop.id}:{})});
    tx.create(db.collection('activity_log').doc('staff-'+command.commandId),{
      timestamp:stamp(),userId:actor.sourceUid ?? actor.userId,canonicalUserId:actor.userId,userName:actor.name,
      eventType:command.kind==='delete-draft' ? 'route_deleted':'route_updated',
      entityType:'route',entityId,
      action:command.kind,
    });
    return {ok:true,replayed:false,...(manualStop ? {stop:manualStop}:{})};
  });
}
