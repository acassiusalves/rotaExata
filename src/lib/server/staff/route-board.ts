import type { Firestore } from 'firebase-admin/firestore';
import { projectDispatchChoice,projectStaffRoute,projectStaffService } from './route-projection';
import { staffRouteRevision } from './route-commands';
import { staffQueryPage } from './query-page';
import { EarningsError } from '../earnings/transport';

const activeRouteStatuses=['draft','pending','dispatched','in_progress'];
const activeServiceStatuses=['organizing','dispatched','in_progress','partial'];
export async function readStaffRouteBoard(db:Firestore,cursor?:string) {
  const query=db.collection('routes').where('status','in',activeRouteStatuses);
  const {docs,cursor:next}=await staffQueryPage(query,cursor,{field:'plannedDate'});
  const routes=docs.map(doc=>projectStaffRoute(doc.id,doc.data(),staffRouteRevision(doc.updateTime)));
  const notices=docs.length ? await db.getAll(...docs.map(doc=>db.collection('routeChangeNotifications').doc(doc.id))):[];
  return {
    routes,
    pendingNotifications:notices.filter(notice=>notice.exists && !notice.get('acknowledged')).map(notice=>notice.id),
    cursor:next,
  };
}

export async function readStaffRouteBoardOptions(db:Firestore,view:'services'|'drivers',cursor?:string) {
  if (view==='services') {
    const rows=await staffQueryPage(db.collection('services').where('status','in',activeServiceStatuses),
      cursor,{field:'createdAt',direction:'desc'});
    return {cursor:rows.cursor,services:rows.docs.map(doc=>projectStaffService(doc.id,doc.data(),false,staffRouteRevision(doc.updateTime)))};
  }
  const rows=await staffQueryPage(db.collection('users').where('role','==','driver'),cursor);
  return {cursor:rows.cursor,drivers:rows.docs.map(doc=>projectDispatchChoice(doc.id,doc.data())).filter(choice=>choice!==null)};
}

export async function readStaffService(db:Firestore,serviceId:string,cursor?:string) {
  const service=await db.collection('services').doc(serviceId).get();
  if (!service.exists) throw new EarningsError(404,'staff_service_not_found');
  const related=await staffQueryPage(db.collection('routes').where('serviceId','==',serviceId),cursor);
  return {
    cursor:related.cursor,
    service:projectStaffService(serviceId,service.data()!,true,staffRouteRevision(service.updateTime)),
    routes:related.docs.map(route=>projectStaffRoute(route.id,route.data(),staffRouteRevision(route.updateTime))),
  };
}
