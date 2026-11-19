import { FieldValue,Timestamp,type Firestore } from 'firebase-admin/firestore';
import { EarningsError } from '../earnings/transport';
import { projectStaffRoute } from './route-projection';
import { staffRouteRevision } from './route-commands';

import { currentRouteDay } from '../../staff/operational-day';

const monitorStatuses=['dispatched','in_progress'];
const dashboardStatuses=['draft',...monitorStatuses,'completed','completed_auto'];

export async function listMonitoredRoutes(db:Firestore,view:'dashboard'|'monitor') {
  const routes=db.collection('routes');
  let query=routes.where('status','in',view==='dashboard' ? dashboardStatuses : monitorStatuses);
  if (view==='dashboard') {
    const [start,end]=currentRouteDay();
    query=query.where('plannedDate','>=',Timestamp.fromMillis(start)).where('plannedDate','<',Timestamp.fromMillis(end));
  }
  const page=await query.get();
  return {routes:page.docs.map(route=>projectStaffRoute(route.id,route.data(),staffRouteRevision(route.updateTime)))};
}

export async function requestStaffLocation(db:Firestore,routeId:string,driverId:string,requestedBy:string) {
  const route=db.collection('routes').doc(routeId);
  const location=db.collection('locationUpdateRequests').doc(driverId);
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(route);
    if (!snapshot.exists || snapshot.get('driverId')!==driverId || snapshot.get('status')!=='in_progress') {
      throw new EarningsError(404,'staff_route_not_found');
    }
    tx.set(location,{driverId,requestedBy,requestedAt:FieldValue.serverTimestamp(),status:'pending'});
  });
}

export async function staffRouteMap(db:Firestore,routeId:string,view:'monitor'|'history') {
  const routes=db.collection('routes');
  const target=await routes.doc(routeId).get();
  const permitted=view==='monitor' ? monitorStatuses : ['completed','completed_auto'];
  if (!target.exists || !permitted.includes(target.get('status'))) throw new EarningsError(404,'staff_route_not_found');
  const planned=target.get('plannedDate');
  const selected=projectStaffRoute(target.id,target.data()!,staffRouteRevision(target.updateTime));
  if (!(planned instanceof Timestamp)) return {selected,routes:[selected]};
  const [start,end]=currentRouteDay(planned.toDate());
  const sameDay=await routes.where('plannedDate','>=',Timestamp.fromMillis(start)).where('plannedDate','<',Timestamp.fromMillis(end)).get();
  const overlays=sameDay.docs.filter(route=>permitted.includes(route.get('status')))
    .map(route=>projectStaffRoute(route.id,route.data(),staffRouteRevision(route.updateTime)));
  return {selected,routes:overlays};
}
