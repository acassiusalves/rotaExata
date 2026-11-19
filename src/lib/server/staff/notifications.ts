import {createHash} from 'node:crypto';
import {FieldPath,FieldValue,type DocumentData,type Firestore,type QueryDocumentSnapshot} from 'firebase-admin/firestore';
import type {TokenMessage} from 'firebase-admin/messaging';
import {z} from 'zod';
import {driverPushMessage} from '../../../../functions/src/driver-push';
import {sendPushWithOutcome} from '../../../../functions/src/push-outcome';
import {serializeReportDate,validReportId} from '../../reporting/report-contract';
import type {
  StaffNotification,StaffNotificationChange,StaffNotificationCreate,StaffNotificationDriver,StaffNotificationDrivers,
  StaffNotificationList,StaffNotificationReceipt,StaffNotificationsPage,StaffPushReason,StaffPushStatus,
} from '../../staff/notification-contract';
import type {StaffActor} from './actor';
import {EarningsError} from '../earnings/transport';
import {cursorFor,cursorTimestamp,readSupportCursor,revisionOf,supportCursor,supportHash} from './support-revision';

type Actor=Pick<StaffActor,'userId'|'scopeId'|'name'|'sourceUid'>;
type Sender={validateBinding:(bindingId:string,proof:string)=>Promise<boolean>;send:(message:TokenMessage)=>Promise<string>};
type Delivery=StaffNotificationReceipt['deliveries'][number];
type PushResult=Omit<Delivery,'id'>;
type Target={driverId:string;id:string};
type Kind=StaffNotification['kind'];
const sources={inbox:{collection:'notifications',date:'timestamp'},route:{collection:'routeChangeNotifications',date:'createdAt'}} as const;
const uuid=z.string().uuid();
const listCursor=z.object({filter:z.string(),inbox:supportCursor.optional(),route:supportCursor.optional()}).strict();
const pageSize=50;
const scanSize=150;
const string=(value:unknown,max=500)=>typeof value==='string' ? value.slice(0,max):undefined;

function activeDriver(profile:DocumentData|undefined) {
  return profile?.role==='driver' && profile.active!==false && profile.disabled!==true && !profile.deletedAt &&
    (!profile.nativeDriverProvisioningId || (profile.nativeDriverReady===true && profile.nativeDriverDispatchEnabled===true));
}

function staffVisible(data:DocumentData,actor:Actor) {
  return data.staffScopeId===undefined || data.staffScopeId===actor.scopeId;
}
function noticeMissing():never {throw new EarningsError(404,'staff_notification_not_found');}
function pushState(value:unknown):StaffPushStatus|undefined {
  if (value==='not_requested'||value==='accepted'||value==='skipped'||value==='failed'||value==='uncertain') return value;
}
function pushReason(value:unknown):StaffPushReason|undefined {
  if (value==='recipient_unavailable'||value==='consent_missing'||value==='token_missing'||value==='token_unlinked'||
      value==='binding_invalid'||value==='destination_changed') return value;
}
function projectInbox(doc:QueryDocumentSnapshot,actor:Actor,audit:DocumentData|undefined):StaffNotification|null {
  const data=doc.data();
  if (!staffVisible(data,actor)) return null;
  const authored=!!audit && audit.actorId===data.staffAuthorId && audit.scopeId===actor.scopeId &&
    Array.isArray(audit.targets) && audit.targets.some((target:Target)=>target.id===doc.id && target.driverId===data.driverId);
  return {
    id:doc.id,kind:'inbox',revision:revisionOf(doc),canChange:true,type:string(data.type,32) ?? 'system',
    title:string(data.title,180) ?? 'Notificação',message:string(data.message,1000) ?? '',priority:string(data.priority,12) ?? 'medium',
    read:data.read===true,opened:data.opened===true,timestamp:serializeReportDate(data.timestamp),
    openedAt:serializeReportDate(data.openedAt),driverName:string(data.driverName,200),routeName:string(data.routeName,200),
    routeId:validReportId(data.routeId) ? data.routeId:undefined,reportId:validReportId(data.reportId) ? data.reportId:undefined,
    author:authored ? string(audit?.authorName,200):undefined,
    push:authored ? pushState(data.staffPushStatus?.push ?? data.staffPushStatus):undefined,
    pushReason:authored ? pushReason(data.staffPushStatus?.pushReason):undefined,
  };
}

export async function listStaffNotifications(db:Firestore,actor:Actor,filters:StaffNotificationList):Promise<StaffNotificationsPage> {
  const kinds=['inbox','route'] as const;
  const filter=supportHash([filters.type,filters.status,filters.search,actor.scopeId,actor.userId]);
  const after=readSupportCursor(filters.cursor,listCursor);
  if (after && after.filter!==filter) throw new EarningsError(422,'staff_invalid_cursor');
  const pages=await Promise.all(kinds.map(kind=>{
    const {collection,date}=sources[kind];
    const query=db.collection(collection).orderBy(date,'desc').orderBy(FieldPath.documentId(),'desc').limit(scanSize+1);
    const cursor=after?.[kind];
    return (cursor ? query.startAfter(cursorTimestamp(cursor),cursor.id):query).get();
  }));
  const candidates=pages.flatMap((page,index)=>page.docs.slice(0,scanSize).map(doc=>{
    const kind= kinds[index];
    return {kind,doc,cursor:cursorFor(doc,sources[kind].date)};
  }));
  const time=(value:typeof candidates[number]['cursor']['timestamp'])=>Array.isArray(value)
    ? [value[0],value[1]] : [Date.parse(serializeReportDate(value) ?? '')/1000 || 0,0];
  candidates.sort((a,b)=>{
    const [bs,bn]=time(b.cursor.timestamp),[as,an]=time(a.cursor.timestamp);
    return bs-as || bn-an || (b.doc.id>a.doc.id ? 1:b.doc.id<a.doc.id ? -1:0);
  });
  const routeCandidates=candidates.filter(({kind})=>kind==='route');
  const commands=[...new Set(candidates.flatMap(({kind,doc})=>{
    const id=doc.get('staffNotificationCommandId');
    return kind==='inbox' && uuid.safeParse(id).success ? [id as string]:[];
  }))];
  const [routeFields,auditFields]=await Promise.all([
    routeCandidates.length ? db.getAll(...routeCandidates.map(({doc})=>db.collection('routes').doc(doc.id)),
      {fieldMask:['driverId','name','routeName']}):[],
    commands.length ? db.getAll(...commands.map(id=>db.collection('rotaStaffNotificationCommands').doc(id)),
      {fieldMask:['actorId','scopeId','authorName','targets']}):[],
  ]);
  const routes=new Map(routeFields.map(doc=>[doc.id,doc]));
  const audit=new Map(auditFields.map(doc=>[doc.id,doc.data()]));
  const next={...after,filter};
  const notifications:StaffNotification[]=[];
  const consumed={inbox:0,route:0};
  const term=filters.search?.toLowerCase() ?? '';
  for (const {kind,doc,cursor} of candidates) {
    next[kind]=cursor;
    consumed[kind]++;
    let item:StaffNotification|null=null;
    if (kind==='inbox') item=projectInbox(doc,actor,audit.get(doc.get('staffNotificationCommandId')));
    else {
      const data=doc.data();
      const route=routes.get(doc.id);
      if (route?.exists && data.routeId===doc.id && typeof data.driverId==='string' && route.get('driverId')===data.driverId) {
        const acknowledged=data.acknowledged===true;
        const outcome=data.push?.outcome;
        item={id:doc.id,kind:'route',revision:revisionOf(doc),canChange:false,type:'route_change',
          title:'Alterações na rota',message:'O plano da rota foi atualizado.',priority:'high',
          timestamp:serializeReportDate(data.createdAt),openedAt:serializeReportDate(data.acknowledgedAt),
          read:acknowledged,opened:acknowledged,routeId:doc.id,routeName:string(route.get('name') ?? route.get('routeName'),200),
          push:outcome==='skipped_no_token'?'skipped':pushState(outcome),
        };
      }
    }
    if (item && (!filters.type || item.type===filters.type) && (!filters.status || item.read===(filters.status==='read')) &&
        (!term || [item.title,item.message,item.driverName,item.routeName,item.author].some(value=>value?.toLowerCase().includes(term)))) {
      notifications.push(item);
    }
    // Beyond a source's scan window its next item may precede anything left in the other source.
    if (notifications.length===pageSize || consumed[kind]===scanSize && pages[kinds.indexOf(kind)].size>scanSize) break;
  }
  const hasNext=kinds.some((kind,index)=>consumed[kind]<pages[index].size);
  return {notifications,cursor:hasNext ? JSON.stringify(next):null};
}

export async function listStaffNotificationDrivers(db:Firestore,cursor?:string):Promise<StaffNotificationDrivers> {
  const query=db.collection('users').where('role','==','driver').orderBy(FieldPath.documentId())
    .select('role','active','disabled','deletedAt','nativeDriverProvisioningId','nativeDriverReady','nativeDriverDispatchEnabled','displayName','name','email')
    .limit(101);
  const rows=await (cursor ? query.startAfter(cursor):query).get();
  const docs=rows.docs.slice(0,100);
  const drivers:StaffNotificationDriver[]=docs.flatMap(doc=>{
    const profile=doc.data();
    return activeDriver(profile) && /^[\w-]{1,128}$/.test(doc.id) ? [{
      id:doc.id,displayName:string(profile.displayName || profile.name || profile.email,200) ?? 'Motorista',
      email:string(profile.email,254) ?? '',
    }]:[];
  });
  return {drivers,cursor:rows.size>100 ? docs.at(-1)!.id:null};
}

export async function changeStaffNotifications(db:Firestore,actor:Actor,command:StaffNotificationChange) {
  const receipt=db.collection('rotaStaffNotificationChanges').doc(command.commandId);
  const digest=supportHash([actor.scopeId,actor.userId,command]);
  const items=command.action==='delete' ? [command.item]:command.items;
  const refs=items.map(item=>db.collection('notifications').doc(item.id));
  await db.runTransaction(async tx=>{
    const previous=await tx.get(receipt);
    if (previous.exists) {
      if (previous.get('digest')!==digest) throw new EarningsError(409,'staff_notification_command_conflict');
      return;
    }
    const rows=await tx.getAll(...refs);
    for (const [index,row] of rows.entries()) {
      const data=row.data();
      if (!data || !staffVisible(data,actor)) noticeMissing();
      if (revisionOf(row)!==items[index].revision) throw new EarningsError(409,'staff_notification_revision_conflict');
    }
    for (const ref of refs) {
      if (command.action==='delete') tx.delete(ref);
      else tx.update(ref,{read:command.read});
    }
    tx.create(receipt,{digest,createdAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
}

const knownSendRejections=new Set([
  'messaging/invalid-argument','messaging/invalid-registration-token','messaging/registration-token-not-registered',
  'messaging/mismatched-credential','messaging/invalid-payload','messaging/message-rate-exceeded',
]);

async function dispatch(db:Firestore,command:StaffNotificationCreate,actor:Actor,target:Target,sender:Sender):Promise<Delivery> {
  const job=db.collection('rotaStaffNotificationCommands').doc(command.commandId).collection('deliveries').doc(target.driverId);
  const notice=db.collection('notifications').doc(target.id);
  const profile=db.collection('users').doc(target.driverId);
  const preference=profile.collection('settings').doc('preferences');
  const belongs=(data:DocumentData|undefined)=>data?.staffNotificationCommandId===command.commandId &&
    data.staffScopeId===actor.scopeId && data.staffAuthorId===actor.userId && data.driverId===target.driverId;
  const claimed=await db.runTransaction(async tx=>{
    const [current,row]=await tx.getAll(job,notice);
    const old=pushState(current.get('push'));
    if (old) {
      const reason=pushReason(current.get('pushReason'));
      return {push:old,...(reason ? {pushReason:reason}:{})} satisfies PushResult;
    }
    if (current.get('state')==='dispatching') return {push:'uncertain'} satisfies PushResult;
    if (!current.exists || !belongs(row.data())) {
      const result={push:'skipped',pushReason:'destination_changed'} satisfies PushResult;
      if (current.exists) tx.update(job,{state:'settled',...result,settledAt:FieldValue.serverTimestamp()});
      return result;
    }
    tx.update(job,{state:'dispatching',startedAt:FieldValue.serverTimestamp()});
    return 'claimed';
  });
  if (claimed!=='claimed') return {id:target.id,...claimed};

  async function dispatchOnce():Promise<PushResult> {
    const [driver,prefs]=await db.getAll(profile,preference);
    const data=driver.data();
    const token=data?.fcmToken;
    if (!activeDriver(data)) return {push:'skipped',pushReason:'recipient_unavailable'};
    if (prefs.get('notifications')!==true) return {push:'skipped',pushReason:'consent_missing'};
    if (typeof token!=='string' || !token) return {push:'skipped',pushReason:'token_missing'};
    const owner=db.collection('driverPushTokenBindings').doc(createHash('sha256').update(token).digest('hex'));
    if ((await owner.get()).get('uid')!==target.driverId) return {push:'skipped',pushReason:'token_unlinked'};
    const payload=await driverPushMessage(db,target.driverId,data,{
      token,data:{type:command.type,priority:command.priority,customNotification:'true',title:command.title,body:command.message,
        notificationTitle:command.title,notificationBody:command.message},
      android:{priority:command.priority==='high'?'high':'normal'},
      webpush:{notification:{title:command.title,body:command.message,icon:'/icons/pwa-192.png',badge:'/icons/pwa-192.png',
        tag:'custom-'+target.id,requireInteraction:command.priority==='high'},fcmOptions:{link:'/driver/notifications'}},
    },sender.validateBinding);
    if (!payload) return {push:'skipped',pushReason:'binding_invalid'};
    const [newDriver,newPrefs,newOwner,row]=await db.getAll(profile,preference,owner,notice);
    if (!belongs(row.data()) || !activeDriver(newDriver.data()) || newDriver.get('fcmToken')!==token ||
        newDriver.get('fcmSessionBindingId')!==data?.fcmSessionBindingId ||
        newPrefs.get('notifications')!==true || newOwner.get('uid')!==target.driverId) return {push:'skipped',pushReason:'destination_changed'};
    const result=await sendPushWithOutcome(true,()=>sender.send(payload));
    return {push:result.outcome==='accepted' ? 'accepted'
      :result.outcome==='failed' && knownSendRejections.has(result.errorCode) ? 'failed':'uncertain'};
  }
  let result:PushResult={push:'failed'};
  try { result=await dispatchOnce(); }
  catch { /* A read or binding failure happened before the provider call. */ }

  try {
    await db.runTransaction(async tx=>{
      const row=await tx.get(notice);
      tx.update(job,{state:'settled',...result,settledAt:FieldValue.serverTimestamp()});
      if (belongs(row.data())) tx.update(notice,{staffPushStatus:result});
    });
    return {id:target.id,...result};
  } catch {
    // The claim already fenced retries. The provider might have accepted the send.
    return {id:target.id,push:'uncertain'};
  }
}

export async function createStaffNotification(db:Firestore,actor:Actor,command:StaffNotificationCreate,sender:Sender):Promise<StaffNotificationReceipt> {
  const ref=db.collection('rotaStaffNotificationCommands').doc(command.commandId);
  const digest=supportHash([actor.scopeId,actor.userId,command]);
  const targets=await db.runTransaction(async tx=>{
    const previous=await tx.get(ref);
    if (previous.exists) {
      if (previous.get('digest')!==digest) throw new EarningsError(409,'staff_notification_command_conflict');
      return previous.get('targets') as Target[];
    }
    const drivers=await tx.getAll(...command.driverIds.map(id=>db.collection('users').doc(id)));
    if (drivers.some(doc=>!activeDriver(doc.data()))) throw new EarningsError(409,'staff_notification_recipient_unavailable');
    const targets=drivers.map(doc=>{
      const id=supportHash([actor.scopeId,actor.userId,command.commandId,doc.id]);
      const data=doc.data()!;
      tx.create(db.collection('notifications').doc(id),{
        title:command.title,message:command.message,type:command.type,priority:command.priority,
        driverId:doc.id,driverName:string(data.displayName || data.name || data.email,200) ?? 'Motorista',
        read:false,opened:false,openedAt:null,timestamp:FieldValue.serverTimestamp(),
        createdBy:actor.sourceUid ?? actor.userId,staffAuthorName:actor.name,staffAuthorId:actor.userId,
        staffScopeId:actor.scopeId,staffNotificationCommandId:command.commandId,
        ...(command.push ? {}:{staffPushStatus:'not_requested'}),
      });
      if (command.push) tx.create(ref.collection('deliveries').doc(doc.id),{state:'pending'});
      return {driverId:doc.id,id};
    });
    tx.create(ref,{digest,targets,actorId:actor.userId,scopeId:actor.scopeId,authorName:actor.name,createdAt:FieldValue.serverTimestamp()});
    return targets;
  });
  if (!command.push) return {deliveries:targets.map(({id})=>({id,push:'not_requested'}))};
  const deliveries:Delivery[]=[];
  for (let offset=0;offset<targets.length;offset+=12) {
    deliveries.push(...await Promise.all(targets.slice(offset,offset+12).map(target=>dispatch(db,command,actor,target,sender))));
  }
  return {deliveries};
}
