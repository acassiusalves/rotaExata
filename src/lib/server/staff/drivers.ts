import { FieldValue,Timestamp,type DocumentData,type Firestore } from 'firebase-admin/firestore';
import { driverTimestamp } from '../../driver/runtime-contract';
import { factsHash } from '../../../../functions/src/earnings-source-adapter';
import { EarningsError } from '../earnings/transport';
import type { StaffActor } from './actor';

const activeStatuses=['draft','pending','organizing','dispatched','in_progress','partial'];
type Summary={serviceIds:Set<string>;serviceCodes:Set<string>;standaloneCodes:Set<string>;standaloneCount:number;routeCount:number};
const empty=():Summary=>({serviceIds:new Set(),serviceCodes:new Set(),standaloneCodes:new Set(),standaloneCount:0,routeCount:0});
const text=(value:unknown)=>typeof value==='string' ? value:undefined;
const number=(value:unknown)=>typeof value==='number' && Number.isFinite(value) ? value:0;

function driverProfileRevision(data:DocumentData) {
  return factsHash({name:data.displayName ?? data.name ?? null,phone:data.phone ?? null,vehicle:data.vehicle ?? null});
}

function projectDevice(value:DocumentData|undefined) {
  if (!value) return undefined;
  const fields=['brand','model','manufacturer','device','deviceType','os','osVersion','browser','browserVersion','platform',
    'screenSize','language','userAgent','appVersion','isPWA','isMobile','isStandalone','connectionType'];
  return Object.fromEntries(fields.filter(key=>['string','boolean','number'].includes(typeof value[key])).map(key=>[key,value[key]]));
}

export async function readStaffDrivers(db:Firestore) {
  const [roster,routes]=await Promise.all([
    db.collection('users').where('role','==','driver').get(),
    db.collection('routes').where('status','in',activeStatuses).select('driverId','serviceId','serviceCode','code').get(),
  ]);
  const pending=new Map<string,Summary>();
  for (const route of routes.docs) {
    const driverId=text(route.get('driverId'));
    if (!driverId) continue;
    const summary=pending.get(driverId) ?? empty();
    const serviceId=text(route.get('serviceId'));
    const serviceCode=text(route.get('serviceCode'));
    const standaloneCode=text(route.get('code'));
    summary.routeCount++;
    if (serviceId) {
      summary.serviceIds.add(serviceId);
      if (serviceCode) summary.serviceCodes.add(serviceCode);
    } else {
      summary.standaloneCount++;
      if (standaloneCode) summary.standaloneCodes.add(standaloneCode);
    }
    pending.set(driverId,summary);
  }
  return {drivers:roster.docs.map(doc=>{
    const data=doc.data();
    const summary=pending.get(doc.id) ?? empty();
    const heartbeat=driverTimestamp(data.lastSeenAt);
    const rawStatus=text(data.status) ?? 'offline';
    const assignments=summary.serviceIds.size+summary.standaloneCount;
    const status=rawStatus==='offline' || !heartbeat || Date.now()-Date.parse(heartbeat)>120_000 ? 'offline':
      assignments ? 'busy' : rawStatus==='available' ? 'available' : 'online';
    return {
      id:doc.id,revision:driverProfileRevision(data),
      name:text(data.displayName) ?? text(data.name) ?? 'Motorista sem nome',
      email:text(data.email),phone:text(data.phone) ?? 'N/A',avatarUrl:text(data.photoURL),
      vehicle:{type:text(data.vehicle?.type) ?? 'N/A',plate:text(data.vehicle?.plate) ?? 'N/A'},
      lastSeenAt:heartbeat,rawStatus,status,totalDeliveries:number(data.totalDeliveries),rating:number(data.rating),
      deviceInfo:projectDevice(data.deviceInfo),
      pendingAssignmentsCount:assignments,pendingServicesCount:summary.serviceIds.size,pendingRoutesCount:summary.routeCount,
      pendingStandaloneRoutesCount:summary.standaloneCount,pendingServiceCodes:[...summary.serviceCodes].sort(),
      pendingStandaloneRouteCodes:[...summary.standaloneCodes].sort(),
    };
  })};
}

export async function patchStaffDriver(db:Firestore,actor:StaffActor,driverId:string,
  input:{revision:string;displayName:string;phone:string;vehicle:{type:string;plate:string}}) {
  const target=db.collection('users').doc(driverId);
  return db.runTransaction(async tx=>{
    const profile=await tx.get(target);
    if (!profile.exists || profile.get('role')!=='driver') throw new EarningsError(404,'staff_driver_not_found');
    if (driverProfileRevision(profile.data()!)!==input.revision) throw new EarningsError(409,'staff_driver_conflict');
    const current=await tx.get(db.collection('routes').where('driverId','==',driverId).where('status','in',['dispatched','in_progress']));
    tx.update(target,{
      displayName:input.displayName,name:input.displayName,phone:input.phone,vehicle:input.vehicle,updatedAt:FieldValue.serverTimestamp(),
    });
    for (const route of current.docs) tx.update(route.ref,{
      'driverInfo.name':input.displayName,'driverInfo.vehicle':input.vehicle,'driverInfo.phone':input.phone,
    });
    tx.create(db.collection('activity_log').doc(),{
      timestamp:FieldValue.serverTimestamp(),eventType:'driver_updated',entityType:'driver',entityId:driverId,
      canonicalUserId:actor.userId,userId:actor.sourceUid ?? actor.userId,userName:actor.name,
      action:'Dados operacionais do motorista atualizados',metadata:{updatedRoutes:current.size},
    });
    return {updatedRoutes:current.size};
  });
}

export async function cleanupStaffDriverPresence(db:Firestore) {
  const cutoff=Timestamp.fromMillis(Date.now()-120_000);
  return db.runTransaction(async tx=>{
    const stale=await tx.get(db.collection('users').where('role','==','driver').where('status','in',['online','available'])
      .where('lastSeenAt','<',cutoff));
    for (const driver of stale.docs) tx.update(driver.ref,{status:'offline'});
    return {updated:stale.size};
  });
}
