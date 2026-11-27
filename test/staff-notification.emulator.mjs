import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import mod_notifications from '../src/lib/server/staff/notifications.ts';
const {changeStaffNotifications,createStaffNotification,listStaffNotifications}=mod_notifications;
import mod_notification_contract from '../src/lib/staff/notification-contract.ts';
const {staffNotificationCreateSchema}=mod_notification_contract;

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
const app=initializeApp({projectId:'demo-rotaexata-staff-support'},'staff-notification-test');
const db=getFirestore(app);
const actor={userId:randomUUID(),scopeId:randomUUID(),name:'Equipe Rota'};
const nonce=randomUUID();

test('staff send rejects extra identity, arbitrary links and duplicate recipients',()=>{
  const input={commandId:randomUUID(),title:'Comunicado',message:'Atenção',type:'system',
    priority:'medium',driverIds:['driver'],push:true};
  assert.equal(staffNotificationCreateSchema.safeParse(input).success,true);
  for (const extra of [{createdBy:'me'},{link:'/other'},{driverIds:['driver','driver']}]) {
    assert.equal(staffNotificationCreateSchema.safeParse({...input,...extra}).success,false);
  }
});

test('notification inbox, proof and consent each gate a real dispatch attempt, and replays preserve outcome',async()=>{
  const drivers=['valid','optout','unbound','revoked','blocked'].map(kind=>`${kind}-${nonce}`);
  await Promise.all(drivers.map(async (id,index)=>{
    const token='fcm-'+id;
    const ref=db.doc('users/'+id);
    const bindingId=randomUUID();
    await ref.set({role:'driver',displayName:id,fcmToken:token,fcmSessionBindingId:bindingId,...(index===4?{disabled:true}:{})});
    if (index===2) await ref.update({fcmSessionBindingId:null});
    else {
      await db.doc('driverPushSessions/'+bindingId).set({sourceUid:id,token,sessionId:randomUUID(),proof:id});
      await db.doc('driverPushTokenBindings/'+createHash('sha256').update(token).digest('hex')).set({uid:id});
    }
    await ref.collection('settings').doc('preferences').set({notifications:index!==1});
  }));
  const input={commandId:randomUUID(),title:'Aviso '+nonce,message:'Atenção',type:'system',
    priority:'medium',driverIds:drivers,push:true};
  const sent=[];
  const delivery={
    validateBinding:async (_id,proof)=>!proof.startsWith('revoked'),
    send:async message=>{sent.push(message);return 'fake-ack';},
  };
  await assert.rejects(createStaffNotification(db,actor,input,delivery),{status:409});
  assert.equal(sent.length,0);
  const filtered={...input,driverIds:drivers.slice(0,4)};
  const result=await createStaffNotification(db,actor,filtered,delivery);
  assert.deepEqual(result.deliveries.map(record=>record.push),['accepted','skipped','skipped','skipped']);
  assert.deepEqual(result.deliveries.map(record=>record.pushReason),[undefined,'consent_missing','token_unlinked','binding_invalid']);
  const inbox=await listStaffNotifications(db,actor,{search:input.title});
  assert.equal(inbox.notifications.find(row=>row.id===result.deliveries[1].id)?.pushReason,'consent_missing');
  assert.ok(inbox.notifications.some(row=>row.id===result.deliveries[0].id && row.author===actor.name));
  assert.deepEqual(sent.map(message=>message.token),['fcm-'+drivers[0]]);
  assert.equal(sent[0].data.boundPush,'1');
  assert.deepEqual(await createStaffNotification(db,actor,filtered,delivery),result);
  assert.equal(sent.length,1);
  await assert.rejects(createStaffNotification(db,actor,{...filtered,message:'Mudou'},delivery),{status:409});
  const item=(await db.doc('notifications/'+result.deliveries[0].id).get()).data();
  assert.equal(item.staffAuthorId,actor.userId);
  assert.equal(item.driverId,drivers[0]);
});

test('uncertain provider acknowledgement never repeats the send',async()=>{
  const id='uncertain-'+nonce;
  const token='fcm-'+id;
  const ref=db.doc('users/'+id);
  await ref.set({role:'driver',fcmToken:token});
  await ref.collection('settings').doc('preferences').set({notifications:true});
  await db.doc('driverPushTokenBindings/'+createHash('sha256').update(token).digest('hex')).set({uid:id});
  let calls=0;
  const input={commandId:randomUUID(),title:'Aviso',message:'Atenção',type:'alert',priority:'high',driverIds:[id],push:true};
  const delivery={validateBinding:async()=>true,send:async()=>{calls++;throw new Error('connection dropped after write');}};
  const result=await createStaffNotification(db,actor,input,delivery);
  assert.equal(result.deliveries[0].push,'uncertain');
  assert.deepEqual(await createStaffNotification(db,actor,input,delivery),result);
  assert.equal(calls,1);
});

test('staff read/delete use the displayed revision and cannot mutate the driver route acknowledgement',async()=>{
  const ref=db.collection('notifications').doc();
  const route=db.collection('routes').doc();
  const notice=db.doc('routeChangeNotifications/'+route.id);
  await route.set({driverId:'driver-'+nonce,name:'Rota '+nonce});
  await notice.set({driverId:'driver-'+nonce,routeId:route.id,createdAt:Timestamp.now(),acknowledged:false,changes:[{changeType:'address'}]});
  await ref.set({type:'system',title:'Item '+nonce,read:false,timestamp:Timestamp.now()});
  const result=await listStaffNotifications(db,actor,{search:nonce});
  const item=result.notifications.find(row=>row.id===ref.id);
  const routeChange=result.notifications.find(row=>row.id===route.id&&row.kind==='route');
  assert.ok(item?.revision);
  assert.equal(routeChange?.canChange,false);
  const before={id:ref.id,revision:item.revision};
  const read={action:'mark',items:[before],read:true,commandId:randomUUID()};
  await changeStaffNotifications(db,actor,read);
  await changeStaffNotifications(db,actor,read);
  assert.equal((await ref.get()).get('read'),true);
  await assert.rejects(changeStaffNotifications(db,actor,{action:'delete',item:before,commandId:randomUUID()}),{status:409});
  assert.equal((await notice.get()).get('acknowledged'),false);
});

test.after(()=>deleteApp(app));

test('notification retry during a provider call reports uncertainty and does not send again',async()=>{
  const driver='racing-'+nonce;
  const token='fcm-'+driver;
  await Promise.all([
    db.doc('users/'+driver).set({role:'driver',fcmToken:token}),
    db.doc('users/'+driver+'/settings/preferences').set({notifications:true}),
    db.doc('driverPushTokenBindings/'+createHash('sha256').update(token).digest('hex')).set({uid:driver}),
  ]);
  const command={commandId:randomUUID(),title:'Aviso',message:'Teste',type:'system',priority:'medium',driverIds:[driver],push:true};
  const entered=Promise.withResolvers();
  const release=Promise.withResolvers();
  let calls=0;
  const sender={validateBinding:async()=>true,send:async()=>{calls++;entered.resolve();return release.promise;}};
  const first=createStaffNotification(db,actor,command,sender);
  try {
    await entered.promise;
    assert.equal((await createStaffNotification(db,actor,command,sender)).deliveries[0].push,'uncertain');
  } finally {release.resolve('fake-ack');}
  assert.equal((await first).deliveries[0].push,'accepted');
  assert.equal((await createStaffNotification(db,actor,command,sender)).deliveries[0].push,'accepted');
  assert.equal(calls,1);
});

test('spoofed fields on a Firebase-created notification do not show a staff author or delivery outcome',async()=>{
  const ref=db.collection('notifications').doc();
  await ref.set({title:'Origem '+nonce,read:false,timestamp:Timestamp.now(),staffScopeId:actor.scopeId,
    staffAuthorId:actor.userId,staffAuthorName:'Forged',staffNotificationCommandId:randomUUID(),staffPushStatus:'accepted'});
  const result=await listStaffNotifications(db,actor,{search:'Origem '+nonce});
  const projected=result.notifications.find(entry=>entry.id===ref.id);
  assert.ok(projected);
  assert.equal(projected.author,undefined);
  assert.equal(projected.push,undefined);
});
