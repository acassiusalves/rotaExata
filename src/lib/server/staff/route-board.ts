import type { Firestore } from 'firebase-admin/firestore';
import { projectDispatchChoice,projectStaffRoute,projectStaffService } from './route-projection';
import { staffRouteRevision } from './route-commands';
import { EarningsError } from '../earnings/transport';

const activeRouteStatuses=['draft','pending','dispatched','in_progress'];
const activeServiceStatuses=['organizing','dispatched','in_progress','partial'];
const pageSize=100;

export async function readStaffRouteBoard(db:Firestore,cursor?:string) {
  let query=db.collection('routes').where('status','in',activeRouteStatuses).orderBy('plannedDate','asc');
  if (cursor) {
    const after=await db.collection('routes').doc(cursor).get();
    if (!after.exists || !activeRouteStatuses.includes(after.get('status'))) throw new EarningsError(409,'staff_route_cursor_conflict');
    query=query.startAfter(after);
  }
  const page=await query.limit(pageSize+1).get();
  const docs=page.docs.slice(0,pageSize);
  const routes=docs.map(doc=>projectStaffRoute(doc.id,doc.data(),staffRouteRevision(doc.updateTime)));
  const notices=docs.length ? await db.getAll(...docs.map(doc=>db.collection('routeChangeNotifications').doc(doc.id))):[];
  return {
    routes,
    pendingNotifications:notices.filter(notice=>notice.exists && !notice.get('acknowledged')).map(notice=>notice.id),
    cursor:page.size>pageSize ? docs.at(-1)?.id ?? null:null,
  };
}

export async function readStaffRouteBoardOptions(db:Firestore) {
  const [services,drivers]=await Promise.all([
    db.collection('services').where('status','in',activeServiceStatuses).orderBy('createdAt','desc').get(),
    db.collection('users').where('role','==','driver').get(),
  ]);
  return {
    services:services.docs.map(doc=>projectStaffService(doc.id,doc.data(),true,staffRouteRevision(doc.updateTime))),
    drivers:drivers.docs.map(doc=>projectDispatchChoice(doc.id,doc.data())).filter(choice=>choice!==null),
  };
}

export async function readStaffService(db:Firestore,serviceId:string) {
  const service=await db.collection('services').doc(serviceId).get();
  if (!service.exists) throw new EarningsError(404,'staff_service_not_found');
  const related=await db.collection('routes').where('serviceId','==',serviceId).get();
  return {
    service:projectStaffService(serviceId,service.data()!,true,staffRouteRevision(service.updateTime)),
    routes:related.docs.map(route=>projectStaffRoute(route.id,route.data(),staffRouteRevision(route.updateTime))),
  };
}
