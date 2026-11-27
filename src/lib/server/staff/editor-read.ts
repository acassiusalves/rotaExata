import { Timestamp,type DocumentSnapshot,type Firestore } from 'firebase-admin/firestore';
import { projectDispatchChoice,projectStaffPlace,projectStaffRoute,projectStaffService } from './route-projection.ts';
import { staffQueryPage } from './query-page.ts';
import { staffRouteRevision } from './route-commands.ts';
import { availableRouteStops } from '../../route-stop-utils.ts';
import type { PlaceValue } from '../../types';
import type { StaffEditorRead } from '../../staff/editor-contract.ts';

import { servicePoolState,storedPlaces as places,type PoolVisibility } from './pool-state.ts';

function route(document:DocumentSnapshot,assigned?:PlaceValue[][],excluded:string[]=[],pool?:PlaceValue[]) {
  if (!document.exists) return null;
  const projected=projectStaffRoute(document.id,document.data()!,staffRouteRevision(document.updateTime));
  const arranged=document.get('organizedRoutes');
  const draftAssignments = projected.status==='draft' && Array.isArray(arranged)
    ? arranged.map(row=>Array.isArray(row?.stops) ? row.stops as PlaceValue[]:[])
    : undefined;
  const candidates=pool ?? (projected.unassignedStops ? places(document,'unassignedStops'):undefined);
  const available=candidates ?
    availableRouteStops(candidates,assigned ?? draftAssignments ?? [places(document,'stops')],excluded):undefined;
  return {...projected,stops:projected.stops.filter(stop=>!stop.unlinkedAt),
    ...(available ? {unassignedStops:available.map(projectStaffPlace)}:{})};
}
function service(document:DocumentSnapshot) {
  if (!document.exists) return null;
  const projected=projectStaffService(document.id,document.data()!,true,staffRouteRevision(document.updateTime));
  return {...projected,allStops:projected.allStops?.filter(stop=>!stop.unlinkedAt)};
}

export async function readStaffEditor(db:Firestore,read:StaffEditorRead,cursor?:string,visibility?:PoolVisibility) {
  switch (read.kind) {
    case 'route': {
      const document=await db.collection('routes').doc(read.id).get();
      const serviceId=document.get('serviceId');
      if (typeof serviceId!=='string') return {record:route(document)};
      const [siblings,serviceDocument]=await Promise.all([
        db.collection('routes').where('serviceId','==',serviceId).select('stops','unassignedStops','status','serviceId').get(),
        db.collection('services').doc(serviceId).get(),
      ]);
      const pool=servicePoolState(document,siblings.docs,serviceDocument,visibility);
      return {record:route(document,pool.mirrors.map(row=>row.stops),pool.excluded,pool.candidates)};
    }
    case 'service': return {record:service(await db.collection('services').doc(read.id).get())};
    case 'service-routes': {
      const query=db.collection('routes').where('serviceId','==',read.id);
      const page=await staffQueryPage(query,cursor);
      if (!page.docs.some(doc=>places(doc,'unassignedStops').length)) {
        return {records:page.docs.map(doc=>route(doc)),cursor:page.cursor};
      }
      const [siblings,serviceDocument]=await Promise.all([
        cursor || page.cursor ? query.select('stops','unassignedStops').get().then(result=>result.docs):page.docs,
        db.collection('services').doc(read.id).get(),
      ]);
      const pool=servicePoolState(page.docs[0],siblings,serviceDocument);
      const assigned=pool.mirrors.map(row=>row.stops);
      return {records:page.docs.map(doc=>route(doc,assigned,pool.excluded)),cursor:page.cursor};
    }
    case 'scheduled': {
      const start=Date.parse(read.date+'T00:00:00-03:00');
      const page=await staffQueryPage(db.collection('routes').where('plannedDate','>=',Timestamp.fromMillis(start))
        .where('plannedDate','<',Timestamp.fromMillis(start+24*3_600_000)),cursor,{field:'plannedDate'});
      return {records:page.docs.map(doc=>route(doc)),cursor:page.cursor};
    }
    case 'active': {
      const query=db.collection('routes').where('status','in',['dispatched','in_progress'])
        .select('driverId','driverInfo','status','currentLocation','currentStopIndex','serviceId','plannedDate');
      const page=await staffQueryPage(query,cursor);
      return {records:page.docs.map(doc=>route(doc)),cursor:page.cursor};
    }
    case 'drivers': {
      const page=await staffQueryPage(db.collection('users').where('role','==','driver')
        .select('displayName','name','role','email','phone','vehicle','status','lastSeenAt','photoURL','active','disabled',
          'nativeDriverProvisioningId','nativeDriverReady','nativeDriverDispatchEnabled','totalDeliveries','rating'),cursor);
      return {cursor:page.cursor,records:page.docs.flatMap(doc=>{
        const driver=projectDispatchChoice(doc.id,doc.data());
        return driver ? [{...driver,displayName:driver.name,role:'driver'}]:[];
      })};
    }
    case 'orders': {
      const page=await staffQueryPage(db.collection('orders').where('number','in',[...new Set(read.numbers)])
        .select('number','rotaExataServiceId','rotaExataRouteId'),cursor);
      return {cursor:page.cursor,records:page.docs.map(order=>({
        id:order.id,number:order.get('number'),
        revision:staffRouteRevision(order.updateTime),

        rotaExataServiceId:order.get('rotaExataServiceId') ?? null,
        rotaExataRouteId:order.get('rotaExataRouteId') ?? null,
      }))};
    }
    case 'origin': {
      const origin=(await db.doc('settings/defaultOrigin').get()).get('origin');
      return {record:origin ? projectStaffPlace(origin) : null};
    }
  }
}
