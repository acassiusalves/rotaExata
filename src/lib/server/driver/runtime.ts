import { createHash,randomUUID } from 'node:crypto';
import { FieldPath,FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { z } from 'zod';
import { adminApp,adminDb } from '@/lib/firebase/admin';
import { driverMediaObject,driverOwnsRoute,driverTimestamp,serializeDriverRoute } from '@/lib/driver/runtime-contract';
import { getRouteChangeNotificationFingerprint } from '@/lib/route-change-fingerprint';
import { getStopIdentityKey } from '@/lib/route-stop-utils';
import type { PlaceValue,RouteChangeNotification } from '@/lib/types';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { performDriverRouteAction } from '@/lib/server/earnings/firestore-route-actions';
import { driverAuthority,type DriverAuthority } from './authority';

const docId=z.string().min(1).max(150).regex(/^[^/]+$/);
const token=z.string().min(20).max(4096).regex(/^[\w:-]+$/);
const selection=z.object({resource:z.enum(['routes','profile','preferences','inbox','location-request']),id:docId.optional(),
  view:z.enum(['active','history']).optional(),after:docId.optional()}).strict();
const identity=z.object({id:z.string().max(150).optional(),pointCode:z.string().max(150).optional(),placeId:z.string().max(150).optional(),
  orderNumber:z.string().max(150).optional()}).strict();
const location=z.object({
  lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180),accuracy:z.number().min(0).max(1000000),
  heading:z.number().min(0).max(360).nullable(),speed:z.number().min(0).max(1000).nullable(),
}).strict();
const device=z.object({
  userAgent:z.string().max(1024),platform:z.string().max(120),deviceModel:z.string().max(120),osName:z.string().max(120),
  osVersion:z.string().max(120),browserName:z.string().max(120),browserVersion:z.string().max(120),
  screenWidth:z.number().int().min(0).max(20000),screenHeight:z.number().int().min(0).max(20000),devicePixelRatio:z.number().min(0).max(20),
  language:z.string().max(100),connectionType:z.string().max(100).nullable().optional(),
  connectionEffectiveType:z.string().max(100).nullable().optional(),downlink:z.number().nonnegative().nullable().optional(),
  rtt:z.number().nonnegative().nullable().optional(),saveData:z.boolean().nullable().optional(),online:z.boolean(),
  batteryLevel:z.number().min(0).max(100).nullable().optional(),batteryCharging:z.boolean().nullable().optional(),
}).strict();
const command=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('route'),command:z.record(z.unknown())}).strict(),
  z.object({kind:z.literal('location'),routeId:docId,location,requestRevision:z.string().max(50).optional()}).strict(),
  z.object({kind:z.literal('presence'),online:z.boolean(),device:device.optional()}).strict(),
  z.object({kind:z.literal('settings'),darkMode:z.boolean(),autoNavigation:z.boolean(),keepScreenOn:z.boolean()}).strict(),
  z.object({kind:z.literal('inbox-open'),id:docId}).strict(),
  z.object({kind:z.literal('push-bind'),token,explicit:z.boolean(),preferenceRevision:z.number().int().safe().nonnegative()}).strict(),
  z.object({kind:z.literal('push-disable')}).strict(),
  z.object({kind:z.literal('push-detach'),token}).strict(),
  z.object({kind:z.literal('upload'),routeId:docId,targetStop:identity,mediaKind:z.enum(['delivery','attempt']),data:z.string().max(3600000)}).strict(),
]);

function text(value: unknown) { return typeof value==='string' ? value : undefined; }
function routeUnknown():never { throw new EarningsError(404,'route_not_found'); }
function dbOrThrow() { if (!adminDb) throw new EarningsError(503,'route_unavailable'); return adminDb; }
function preferences(db:FirebaseFirestore.Firestore,uid:string) { return db.collection('users').doc(uid).collection('settings').doc('preferences'); }
function createProfile(uid:string,body:FirebaseFirestore.DocumentData) {
  const car=body.vehicle && typeof body.vehicle==='object' ? body.vehicle : null;
  return {
    uid,displayName:text(body.displayName) ?? text(body.name) ?? 'Motorista',email:text(body.email),photoURL:text(body.photoURL),
    phone:text(body.phone),city:text(body.city),createdAt:driverTimestamp(body.createdAt),
    totalDeliveries:Number.isSafeInteger(body.totalDeliveries)?body.totalDeliveries:0,
    vehicle:car ? {type:text(car.type),plate:text(car.plate),model:text(car.model),color:text(car.color)} : text(body.vehicle),
  };
}
function bindRouteMediaType(data:string) {
  const upload=data.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!upload) throw new EarningsError(422,'route_invalid_media');
  const bytes=Buffer.from(upload[2],'base64');
  const magic=upload[1]==='jpeg' ? bytes.subarray(0,3).equals(Buffer.from([255,216,255]))
    : upload[1]==='png' ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP';
  if (!magic || bytes.length>2500000) throw new EarningsError(422,'route_invalid_media');
  return {bytes,contentType:'image/'+upload[1]};
}

async function readRoutes(db:FirebaseFirestore.Firestore,actor:DriverAuthority,args:z.infer<typeof selection>) {
  const routes=db.collection('routes');
  if (args.id) {
    const snap=await routes.doc(args.id).get();
    const body=snap.data();
    if (!driverOwnsRoute(body,actor.sourceUid)) routeUnknown();
    const [notice,settings]=await db.getAll(db.collection('routeChangeNotifications').doc(args.id),db.doc('settings/general'));
    const general=settings.data();
    const distance=general?.maxDeliveryDistance;
    const deliveryValidation={enabled:general?.deliveryDistanceValidation===true,
      maxDistance:typeof distance==='number' && Number.isFinite(distance) && distance>0 ? distance:0.5};
    const data=notice.data() as RouteChangeNotification | undefined;
    const pending=data?.driverId===actor.sourceUid && !data.acknowledged ? {
      notification: { id:notice.id,routeId:args.id,driverId:actor.userId,acknowledged:false,createdAt:driverTimestamp(data.createdAt),
        changes: (data.changes ?? []).map(change => {
          const safeValue=(value:unknown)=>change.changeType==='sequence' && typeof value==='number' ? value
            : change.changeType==='address' ? text(value) : undefined;
          return {stopId:change.stopId,stopIndex:change.stopIndex,changeType:change.changeType,
            oldValue:safeValue(change.oldValue),newValue:safeValue(change.newValue)};
        }),
      },
      fingerprint:getRouteChangeNotificationFingerprint(data),
    }:null;
    return privateJson({route:serializeDriverRoute(snap.id,body!),notice:pending,deliveryValidation});
  }
  const statuses=args.view==='history'?['completed','completed_auto']:['dispatched','in_progress'];
  let query=routes.where('driverId','==',actor.sourceUid).where('status','in',statuses).orderBy(FieldPath.documentId()).limit(51);
  if (args.after) query=query.startAfter(args.after);
  const result=await query.get();
  return privateJson({routes:result.docs.slice(0,50).map(doc=>serializeDriverRoute(doc.id,doc.data())),
    nextCursor:result.size>50 ? result.docs[49].id:null});
}

async function getRuntime(request:Request,actor:DriverAuthority) {
  const {sourceUid:uid}=actor;
  const db=dbOrThrow();
  const args=selection.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!args.success) throw new EarningsError(422,'route_invalid_query');
  if (args.data.resource==='routes') return readRoutes(db,actor,args.data);
  if (args.data.resource==='profile') {
    const profile=(await db.collection('users').doc(uid).get()).data();
    if (!profile) throw new EarningsError(403,'route_access_denied');
    return privateJson({profile:createProfile(actor.userId,profile),forceLogoutAt:driverTimestamp(profile.forceLogoutAt),readOnly:!!actor.readOnly});
  }
  if (args.data.resource==='preferences') {
    const raw=(await preferences(db,uid).get()).data() ?? {};
    return privateJson({notifications:raw.notifications!==false,darkMode:raw.darkMode===true,autoNavigation:raw.autoNavigation===true,
      keepScreenOn:raw.keepScreenOn!==false,pushRevision:Number.isSafeInteger(raw.pushRevision) ? raw.pushRevision:0});
  }
  if (args.data.resource==='location-request') {
    const doc=await db.collection('locationUpdateRequests').doc(uid).get();
    return privateJson({revision:doc.updateTime ? String(doc.updateTime.seconds)+'.'+String(doc.updateTime.nanoseconds):null});
  }
  // Older notifications did not have forAdmin. Apply that exclusion after the owner query.
  const items=await db.collection('notifications').where('driverId','==',uid).orderBy('timestamp','desc').limit(150).get();
  return privateJson({notifications:items.docs.flatMap(doc=>{
    const n=doc.data();
    if (n.forAdmin===true) return [];
    return [{id:doc.id,type:text(n.type) ?? 'system',title:text(n.title) ?? 'Notificação',message:text(n.message) ?? '',
      priority:text(n.priority),opened:n.opened===true || n.read===true,timestamp:driverTimestamp(n.timestamp),openedAt:driverTimestamp(n.openedAt),
      routeId:text(n.routeId),routeName:text(n.routeName),reportId:text(n.reportId),link:text(n.link),
    }];
  })});
}

async function upload(db:FirebaseFirestore.Firestore,uid:string,input:Extract<z.infer<typeof command>,{kind:'upload'}>) {
  const bucketName=process.env.FIREBASE_STORAGE_BUCKET;
  if (!adminApp || !bucketName || (process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9198'))
    throw new EarningsError(503,'route_media_unavailable');
  const route=(await db.collection('routes').doc(input.routeId).get()).data();
  if (!driverOwnsRoute(route,uid)) routeUnknown();
  const key=getStopIdentityKey(input.targetStop);
  if (!key || !(route!.stops as PlaceValue[] | undefined)?.some(stop=>getStopIdentityKey(stop)===key)) routeUnknown();
  const {bytes,contentType}=bindRouteMediaType(input.data);
  const id=randomUUID();
  const object=driverMediaObject(input.routeId,key,input.mediaKind,id);
  const file=getStorage(adminApp).bucket(bucketName).file(object);
  const downloadToken=randomUUID();
  await file.save(bytes,{resumable:false,metadata:{contentType,cacheControl:'private,max-age=0',metadata:{firebaseStorageDownloadTokens:downloadToken}}});
  const endpoint=process.env.FIRESTORE_EMULATOR_HOST ? 'http://127.0.0.1:9198' : 'https://firebasestorage.googleapis.com';
  const url=endpoint+'/v0/b/'+encodeURIComponent(bucketName)+'/o/'+encodeURIComponent(object)+'?alt=media&token='+downloadToken;
  try {
    await db.collection('driverDeliveryMedia').doc(id).create({uid,routeId:input.routeId,stopKey:key,kind:input.mediaKind,url,at:FieldValue.serverTimestamp()});
  } catch (error) {
    await file.delete({ignoreNotFound:true}).catch(()=>{});
    throw error;
  }
  return privateJson({id,url});
}

async function postRuntime(request:Request,actor:DriverAuthority) {
  const uid=actor.sourceUid;
  const db=dbOrThrow();
  const input=command.safeParse(await readJsonBody(request,3900000));
  if (!input.success) throw new EarningsError(422,'route_invalid_request');
  const data=input.data;
  const user=db.collection('users').doc(uid);
  const prefs=preferences(db,uid);
  if (data.kind==='route') return performDriverRouteAction(
    new Request(request.url,{method:'POST',body:JSON.stringify(data.command)}),uid,{canonical:actor.native,bindMedia:true});
  if (data.kind==='upload') return upload(db,uid,data);
  if (data.kind==='settings') {
    await prefs.set({darkMode:data.darkMode,autoNavigation:data.autoNavigation,keepScreenOn:data.keepScreenOn},{merge:true});
    return privateJson({ok:true});
  }
  if (data.kind==='presence') {
    await user.update({status:data.online?'online':'offline',lastSeenAt:FieldValue.serverTimestamp(),
      ...(data.device ? {deviceInfo:{...data.device,lastUpdated:FieldValue.serverTimestamp()}}:{})});
    return privateJson({ok:true});
  }
  if (data.kind==='location') {
    await db.runTransaction(async tx=>{
      const route=db.collection('routes').doc(data.routeId);
      const snap=await tx.get(route);
      if (!driverOwnsRoute(snap.data(),uid) || snap.data()?.status!=='in_progress') routeUnknown();
      const ref=db.collection('locationUpdateRequests').doc(uid);
      const pending=data.requestRevision ? await tx.get(ref):null;
      tx.update(route,{currentLocation:{...data.location,timestamp:FieldValue.serverTimestamp()},lastUpdated:FieldValue.serverTimestamp()});
      if (pending?.updateTime && data.requestRevision===pending.updateTime.seconds+'.'+pending.updateTime.nanoseconds) tx.delete(ref);
    });
    return privateJson({ok:true});
  }
  if (data.kind==='inbox-open') {
    const ref=db.collection('notifications').doc(data.id);
    await db.runTransaction(async tx=>{
      const n=(await tx.get(ref)).data();
      if (n?.driverId!==uid || n.forAdmin===true) routeUnknown();
      tx.update(ref,{opened:true,read:true,openedAt:FieldValue.serverTimestamp()});
    });
    return privateJson({ok:true});
  }
  await db.runTransaction(async tx=>{
    const [settings,profile]=await tx.getAll(prefs,user);
    const body=settings.data() ?? {};
    const revision=Number.isSafeInteger(body.pushRevision) ? body.pushRevision:0;
    if (data.kind==='push-bind' && (revision!==data.preferenceRevision || (!data.explicit && body.notifications===false))) {
      throw new EarningsError(409,body.notifications===false?'push-disabled':'preference-changed');
    }
    const previousToken=text(profile.data()?.fcmToken);
    const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
    const bindings=db.collection('driverPushTokenBindings');
    const binding=data.kind==='push-bind' ? bindings.doc(hash(data.token)):null;
    const registered=binding ? (await tx.get(binding)).data():null;
    const priorRef=typeof registered?.uid==='string'&&registered.uid!==uid ? db.collection('users').doc(registered.uid):null;
    const prior=priorRef ? (await tx.get(priorRef)).data():null;
    const old=previousToken ? bindings.doc(hash(previousToken)):null;
    const oldOwner=old && old.path!==binding?.path ? (await tx.get(old)).data():null;
    if (data.kind==='push-detach' && data.token!==previousToken) return;
    if (priorRef && data.kind==='push-bind' && prior?.fcmToken===data.token) {
      tx.update(priorRef,{fcmToken:FieldValue.delete(),fcmTokenUpdatedAt:FieldValue.serverTimestamp()});
    }
    if (old && oldOwner?.uid===uid) tx.delete(old);
    if (binding) tx.set(binding,{uid,timestamp:FieldValue.serverTimestamp()});
    tx.update(user,{fcmToken:data.kind==='push-bind'?data.token:FieldValue.delete(),fcmTokenUpdatedAt:FieldValue.serverTimestamp()});
    if (data.kind!=='push-detach') tx.set(prefs,{notifications:data.kind==='push-bind',pushRevision:revision+(data.kind==='push-disable'||data.explicit?1:0)},{merge:true});
  });
  return privateJson({ok:true});
}

export async function serveDriverRuntime(request:Request,phase:'native'|'legacy') {
  try {
    const write=request.method==='POST';
    const actor=await driverAuthority(request,phase,write);
    return write ? await postRuntime(request,actor):await getRuntime(request,actor);
  } catch (error) { return earningsErrorResponse(error); }
}
