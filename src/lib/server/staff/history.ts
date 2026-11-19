import { FieldPath,type DocumentSnapshot,type Firestore } from 'firebase-admin/firestore';
import { EarningsError } from '../earnings/transport.ts';
import { projectStaffRoute } from './route-projection.ts';
import { staffRouteRevision } from './route-commands.ts';
import { driverTimestamp } from '../../driver/runtime-contract.ts';

const pageSize=100;
const completeStatuses=['completed','completed_auto'];
export async function readStaffRouteHistory(db:Firestore,driverId?:string,cursor?:string) {
  let query=db.collection('routes').where('status','in',completeStatuses);
  if (driverId) query=query.where('driverId','==',driverId);
  query=query.orderBy(FieldPath.documentId());
  if (cursor) query=query.startAfter(cursor);
  const page=await query.limit(pageSize+1).get();
  const docs=page.docs.slice(0,pageSize);
  return {routes:docs.map(doc=>projectStaffRoute(doc.id,doc.data(),staffRouteRevision(doc.updateTime))),
    cursor:page.size>pageSize ? docs.at(-1)?.id ?? null:null};
}

export async function readStaffHistoricalDrivers(db:Firestore,cursor?:string) {
  let query=db.collection('users').where('role','==','driver').select('displayName','name','photoURL').orderBy(FieldPath.documentId());
  if (cursor) query=query.startAfter(cursor);
  const page=await query.limit(pageSize+1).get();
  const docs=page.docs.slice(0,pageSize);
  return {drivers:docs.map(doc=>({
    id:doc.id,
    name:[doc.get('displayName'),doc.get('name')].find(value=>typeof value==='string' && value.trim()) ?? 'Motorista',
    avatarUrl:typeof doc.get('photoURL')==='string' ? doc.get('photoURL') : '',
  })),cursor:page.size>pageSize ? docs.at(-1)?.id ?? null:null};
}

const auditSecret=/(password|api.?key|token|secret|credential|session.?id|photo.?url|signature.?url)/i;

function safeAuditValue(value:unknown,depth=0):unknown {
  if (typeof value==='string') return value.slice(0,4000);
  if (value===null || typeof value==='boolean' || typeof value==='number') return value;
  if (!value || typeof value!=='object' || depth>=6) return null;
  if (value instanceof Date || ('toDate' in value && typeof value.toDate==='function')) return driverTimestamp(value);
  if (Array.isArray(value)) return value.slice(0,100).map(item=>safeAuditValue(item,depth+1));
  if (![Object.prototype,null].includes(Object.getPrototypeOf(value))) return null;
  return Object.fromEntries(Object.entries(value).filter(([key])=>!auditSecret.test(key)).slice(0,100)
    .map(([key,item])=>[key,safeAuditValue(item,depth+1)]));
}

export function projectActivity(doc:DocumentSnapshot) {
  const source=doc.data() ?? {};
  const fields=['category','userId','userName','userRole','origin','entityType','entityId','entityCode',
    'serviceId','serviceCode','routeId','routeCode','pointId','pointCode','paymentId','stockItemId','customerId','orderId',
    'orderNumber','isSystemGenerated'];
  const changes=Array.isArray(source.changes) ? source.changes.filter(change=>change && typeof change.field==='string' &&
    !auditSecret.test(change.field)).map(change=>safeAuditValue(change)):undefined;
  return {
    ...Object.fromEntries(fields.filter(key=>['string','boolean','number'].includes(typeof source[key]))
      .map(key=>[key,safeAuditValue(source[key])])),
    id:doc.id,actorProvenance:source.staffAuditVersion===1 && doc.id.startsWith('staff-') &&
      typeof source.staffScopeId==='string' && typeof source.canonicalUserId==='string' ? 'rota-native':'source-reported',
    eventType:typeof source.eventType==='string' ? source.eventType:'unknown',
    action:typeof source.action==='string' ? source.action.slice(0,4000):'',timestamp:driverTimestamp(source.timestamp),
    changes,metadata:safeAuditValue(source.metadata),
  };
}

export async function readStaffActivities(db:Firestore) {
  const result=await db.collection('activity_log').orderBy('timestamp','desc').limit(200).get();
  return {activities:result.docs.map(projectActivity),cursor:null};
}

export async function readStaffRouteRemovals(db:Firestore,routeId:string) {
  const route=await db.collection('routes').doc(routeId).get();
  if (!route.exists || !completeStatuses.includes(route.get('status'))) throw new EarningsError(404,'staff_route_not_found');
  const entries=await db.collection('activity_log').where('routeId','==',routeId)
    .orderBy('timestamp','desc').limit(200).get();
  const stops=route.get('stops');
  const activeStopIds=new Set((Array.isArray(stops) ? stops:[]).filter(stop=>stop && !stop.unlinkedAt).map(stop=>stop.id));
  const removals=entries.docs.filter(entry=>entry.get('eventType')==='point_removed_from_route' &&
    !activeStopIds.has(entry.get('pointId') ?? entry.get('entityId'))).slice(0,50);
  const removed=await Promise.all(removals.map(async entry=>{
    const project=projectActivity(entry);
    const pointId=entry.get('pointId') ?? entry.get('entityId');
    if (typeof pointId!=='string') return project;
    const [moves,adds]=await Promise.all(['point_transferred','point_added_to_route'].map(eventType=>
      db.collection('activity_log').where('eventType','==',eventType).where('pointId','==',pointId).limit(50).get()));
    const operation=entry.get('staffAuditOperationId');
    const transfer=moves.docs.filter(doc=>(operation ? doc.get('staffAuditOperationId')===operation : newest(doc,entry)<=0) && (doc.get('routeId')===routeId ||
      doc.get('metadata.sourceRouteId')===routeId)).sort(newest)[0];
    if (transfer && (transfer.get('metadata.targetRouteName') || transfer.get('metadata.targetRouteId'))) {
      return {...project,related:{eventType:transfer.get('eventType'),routeId:transfer.get('routeId'),
        metadata:{targetRouteName:safeAuditValue(transfer.get('metadata.targetRouteName')),
          targetRouteId:safeAuditValue(transfer.get('metadata.targetRouteId'))}}};
    }
    const latest=adds.docs.filter(doc=>newest(doc,entry)<=0 && doc.get('routeId') && doc.get('routeId')!==routeId).sort(newest)[0];
    return latest ? {...project,related:{eventType:latest.get('eventType'),routeId:latest.get('routeId'),routeCode:safeAuditValue(latest.get('routeCode'))}}:project;
  }));
  return {removed};
}

function newest(a:DocumentSnapshot,b:DocumentSnapshot) {
  return (driverTimestamp(b.get('timestamp')) ?? '').localeCompare(driverTimestamp(a.get('timestamp')) ?? '');
}
