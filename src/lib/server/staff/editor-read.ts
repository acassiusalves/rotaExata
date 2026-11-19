import { Timestamp,type DocumentSnapshot,type Firestore } from 'firebase-admin/firestore';
import { projectDispatchChoice,projectStaffPlace,projectStaffRoute,projectStaffService } from './route-projection.ts';
import { staffRouteRevision } from './route-commands.ts';
import type { StaffEditorRead } from '../../staff/editor-contract.ts';

function route(document:DocumentSnapshot) {
  return document.exists ? projectStaffRoute(document.id,document.data()!,staffRouteRevision(document.updateTime)):null;
}
function service(document:DocumentSnapshot) {
  return document.exists ? projectStaffService(document.id,document.data()!,true,staffRouteRevision(document.updateTime)):null;
}

export async function readStaffEditor(db:Firestore,read:StaffEditorRead) {
  switch (read.kind) {
    case 'route': return {record:route(await db.collection('routes').doc(read.id).get())};
    case 'service': return {record:service(await db.collection('services').doc(read.id).get())};
    case 'service-routes': {
      const result=await db.collection('routes').where('serviceId','==',read.id).get();
      return {records:result.docs.map(route)};
    }
    case 'scheduled': {
      const start=Date.parse(read.date+'T00:00:00-03:00');
      const result=await db.collection('routes').where('plannedDate','>=',Timestamp.fromMillis(start))
        .where('plannedDate','<',Timestamp.fromMillis(start+24*3_600_000)).get();
      return {records:result.docs.map(route)};
    }
    case 'active': {
      const result=await db.collection('routes').where('status','in',['dispatched','in_progress']).get();
      return {records:result.docs.map(route)};
    }
    case 'drivers': {
      const result=await db.collection('users').where('role','==','driver').get();
      return {records:result.docs.flatMap(doc=>{
        const driver=projectDispatchChoice(doc.id,doc.data());
        return driver ? [{...driver,displayName:driver.name,role:'driver'}]:[];
      })};
    }
    case 'orders': {
      const result=await db.collection('orders').where('number','in',[...new Set(read.numbers)]).get();
      return {records:result.docs.map(order=>({
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
