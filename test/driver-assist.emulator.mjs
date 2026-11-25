// Acesso do operador ao app do motorista, contra o emulador do Firestore.
// Rodar com:
//   PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH firebase emulators:exec --project demo-rotaexata-driver \
//     --only firestore --config firebase.test.json "node --import tsx --test test/driver-assist.emulator.mjs"
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { Timestamp } from 'firebase-admin/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
process.env.FIREBASE_PROJECT_ID='demo-rotaexata-driver';
const { adminDb:db }=await import('../src/lib/firebase/admin.ts');
const store=await import('../src/lib/server/staff/driver-assist.ts');
const { performDriverRouteAction }=await import('../src/lib/server/earnings/firestore-route-actions.ts');
const { getStopIdentityKey }=await import('../src/lib/route-stop-utils.ts');
const { factsHash }=await import('../functions/src/earnings-source-adapter.ts');
const { serveDriverRuntimeAs }=await import('../src/lib/server/driver/runtime.ts');
assert.ok(db,'Firestore emulator is required');
after(()=>db.terminate());

const HOUR=60*60*1000;
const operator=()=>({userId:randomUUID(),sessionId:randomUUID(),name:'Operadora Teste',sourceUid:'staff-'+randomUUID()});
async function driverProfile(t,body={role:'driver',active:true,displayName:'Motorista Teste'}) {
  const ref=db.collection('users').doc('driver-'+randomUUID());
  await ref.set(body);
  t.after(()=>ref.delete());
  return ref;
}
const refused=code=>error=>error.status===(code==='staff_driver_not_found' ? 404:403) && error.code===code;

test('abrir o acesso grava o documento de 60 minutos e o evento com o motivo',async t=>{
  const actor=operator();
  const driver=await driverProfile(t);
  const now=Date.now();
  const assist=await store.openDriverAssist(db,actor,driver.id,'Motorista sem sinal',now);
  assert.equal(assist.driverUid,driver.id);
  assert.equal(assist.driverName,'Motorista Teste');
  assert.equal(assist.staffName,'Operadora Teste');
  assert.equal(Date.parse(assist.expiresAt),now+HOUR);

  const grant=await db.collection('rotaStaffDriverAssists').doc(assist.grantId).get();
  assert.equal(grant.get('staffUserId'),actor.userId);
  assert.equal(grant.get('staffSessionId'),actor.sessionId);
  assert.equal(grant.get('reason'),'Motorista sem sinal');
  assert.equal(grant.get('endedAt'),null);

  const log=await db.collection('activity_log').doc('staff-assist-'+assist.grantId).get();
  assert.equal(log.get('eventType'),'driver_assist_started');
  assert.equal(log.get('userName'),'Operadora Teste');
  assert.equal(log.get('entityId'),driver.id);
  assert.equal(log.get('metadata.reason'),'Motorista sem sinal');
});

test('não abre acesso para quem não é motorista',async t=>{
  const staff=await driverProfile(t,{role:'admin',displayName:'Outra pessoa'});
  await assert.rejects(store.openDriverAssist(db,operator(),staff.id,'Teste de recusa'),refused('staff_driver_not_found'));
  await assert.rejects(store.openDriverAssist(db,operator(),'nao-existe-'+randomUUID(),'Teste de recusa'),refused('staff_driver_not_found'));
});

test('só o operador e a sessão que abriram resolvem o acesso, e só até vencer',async t=>{
  const actor=operator();
  const driver=await driverProfile(t);
  const now=Date.now();
  const {grantId}=await store.openDriverAssist(db,actor,driver.id,'Conferencia de rota',now);
  assert.equal((await store.resolveDriverAssist(db,actor,grantId,now+1000)).driverUid,driver.id);
  await assert.rejects(store.resolveDriverAssist(db,operator(),grantId,now+1000),refused('assist_not_found'));
  await assert.rejects(store.resolveDriverAssist(db,{...actor,sessionId:randomUUID()},grantId,now+1000),refused('assist_not_found'));
  await assert.rejects(store.resolveDriverAssist(db,actor,randomUUID(),now+1000),refused('assist_not_found'));
  await assert.rejects(store.resolveDriverAssist(db,actor,grantId,now+HOUR),refused('assist_expired'));
});

test('encerrar o acesso o invalida, registra o evento e pode ser repetido',async t=>{
  const actor=operator();
  const driver=await driverProfile(t);
  const {grantId}=await store.openDriverAssist(db,actor,driver.id,'Encerramento manual');
  await store.endDriverAssist(db,actor,grantId);
  await assert.rejects(store.resolveDriverAssist(db,actor,grantId),refused('assist_expired'));
  assert.equal((await db.collection('activity_log').doc('staff-assist-end-'+grantId).get()).get('eventType'),'driver_assist_ended');
  await store.endDriverAssist(db,actor,grantId);
});

const CUSTOMER='Cliente Sigiloso da Silva';
const stop=(id,deliveryStatus)=>({id,customerName:CUSTOMER,address:'Rua Reservada 123',lat:-16.6,lng:-49.2,
  ...(deliveryStatus ? {deliveryStatus,completedAt:Timestamp.now()}:{})});
const stops=(done,open)=>[...Array.from({length:done},(_,i)=>stop('done-'+i,'completed')),...Array.from({length:open},(_,i)=>stop('open-'+i))];
const assistOf=()=>({grantId:randomUUID(),staffUserId:randomUUID(),staffSourceUid:'staff-'+randomUUID(),staffName:'Operadora Teste'});

async function routeFixture(t,route) {
  const driver=await driverProfile(t);
  const ref=db.collection('routes').doc('route-'+randomUUID());
  const evidence=db.collection('rotaEarningRouteEvidence').doc(ref.id);
  await ref.set({name:'Rota de teste',code:'LNS-TEST',driverId:driver.id,plannedDate:Timestamp.now(),...route});
  t.after(()=>Promise.all([ref.delete(),evidence.delete()]));
  return {driver,ref,evidence};
}
const act=(uid,command,assist)=>performDriverRouteAction(
  new Request('http://localhost/api/staff/driver-assist',{method:'POST',body:JSON.stringify(command)}),uid,{canonical:true,bindMedia:true,assist});
async function ok(response) {
  const body=await response.json();
  assert.equal(response.status,200,'server returned '+JSON.stringify(body));
  return body;
}
// Monta uma confirmação de entrega igual à que o app envia: foto vinculada e revisão da parada.
async function confirmCommand(t,f,id) {
  const current=(await f.ref.get()).get('stops').find(item=>item.id===id);
  const mediaId=randomUUID();
  const url='/api/driver/media/'+mediaId;
  const media=db.collection('driverDeliveryMedia').doc(mediaId);
  await media.set({uid:f.driver.id,routeId:f.ref.id,stopKey:getStopIdentityKey(current),kind:'delivery',url,contentType:'image/png'});
  t.after(()=>media.delete());
  return {action:'confirm',routeId:f.ref.id,targetStop:{id},requestId:randomUUID(),expectedRevision:factsHash(current),
    media:{delivery:mediaId},patch:{deliveryStatus:'completed',notes:null,failureReason:null,wentToLocation:null,
      payments:[],deliveredItemIds:[],photoUrl:url,attemptPhotoUrl:null}};
}
const routeLogs=async routeId=>(await db.collection('activity_log').where('routeId','==',routeId).get()).docs.map(doc=>doc.data());

test('operador inicia, confirma e finaliza: tudo fica no nome dele e a rota vai para conferência',async t=>{
  const f=await routeFixture(t,{status:'dispatched',stops:stops(0,2)});
  const assist=assistOf();
  await ok(await act(f.driver.id,{action:'start',routeId:f.ref.id},assist));
  for (const id of ['open-0','open-1']) await ok(await act(f.driver.id,await confirmCommand(t,f,id),assist));
  await ok(await act(f.driver.id,{action:'finish',routeId:f.ref.id},assist));

  const route=await f.ref.get();
  assert.equal(route.get('status'),'completed');
  assert.equal(route.get('staffAssist.by'),assist.staffSourceUid);
  assert.equal(route.get('staffAssist.grantId'),assist.grantId);

  const evidence=await f.evidence.get();
  assert.equal(evidence.get('staffAssisted.name'),'Operadora Teste');
  assert.equal(evidence.get('completion'),null,'rota operada pelo painel não gera evidência automática');

  const logs=await routeLogs(f.ref.id);
  assert.deepEqual(logs.map(log=>log.eventType).sort(),['point_completed','point_completed','route_completed','route_started']);
  for (const log of logs) {
    assert.equal(log.userId,assist.staffSourceUid);
    assert.equal(log.userName,'Operadora Teste');
    assert.equal(log.metadata.onBehalfOf,f.driver.id);
    assert.equal(log.metadata.assistGrantId,assist.grantId);
  }
});

test('uma única parada confirmada pelo operador leva a rota do motorista para conferência',async t=>{
  const f=await routeFixture(t,{status:'dispatched',stops:stops(0,2)});
  await ok(await act(f.driver.id,{action:'start',routeId:f.ref.id}));
  await ok(await act(f.driver.id,await confirmCommand(t,f,'open-0')));
  await ok(await act(f.driver.id,await confirmCommand(t,f,'open-1'),assistOf()));
  await ok(await act(f.driver.id,{action:'finish',routeId:f.ref.id}));
  const evidence=await f.evidence.get();
  assert.ok(evidence.get('staffAssisted'));
  assert.equal(evidence.get('completion'),null);
});

test('a marca do painel sobrevive a uma reabertura para "despachada"',async t=>{
  const f=await routeFixture(t,{status:'dispatched',stops:stops(2,0)});
  const first=assistOf();
  await f.evidence.set({start:null,completion:null,staffAssisted:{by:first.staffSourceUid,name:first.staffName,grantId:first.grantId,at:Timestamp.now()}});
  await ok(await act(f.driver.id,{action:'start',routeId:f.ref.id}));
  await ok(await act(f.driver.id,{action:'finish',routeId:f.ref.id}));
  const evidence=await f.evidence.get();
  assert.equal(evidence.get('staffAssisted.grantId'),first.grantId);
  assert.equal(evidence.get('completion'),null);
});

test('rota feita só pelo motorista continua gerando evidência automática e log no nome dele',async t=>{
  const f=await routeFixture(t,{status:'dispatched',stops:stops(0,1)});
  await ok(await act(f.driver.id,{action:'start',routeId:f.ref.id}));
  await ok(await act(f.driver.id,await confirmCommand(t,f,'open-0')));
  await ok(await act(f.driver.id,{action:'finish',routeId:f.ref.id}));
  const evidence=await f.evidence.get();
  assert.equal(evidence.get('staffAssisted'),undefined);
  assert.equal(evidence.get('completion.kind'),'driver-server-v1');
  assert.equal((await f.ref.get()).get('staffAssist'),undefined);
  const logs=await routeLogs(f.ref.id);
  assert.deepEqual(logs.map(log=>log.eventType),['point_completed']);
  assert.equal(logs[0].userId,f.driver.id);
});

test('confirmar alterações pelo painel fica no histórico e não marca a rota',async t=>{
  const f=await routeFixture(t,{status:'in_progress',startedAt:Timestamp.now(),pendingChanges:true,stops:stops(0,1)});
  const notice=db.collection('routeChangeNotifications').doc(f.ref.id);
  await notice.set({routeId:f.ref.id,driverId:f.driver.id,acknowledged:false,createdAt:Timestamp.now(),changes:[]});
  t.after(()=>notice.delete());
  const { getRouteChangeNotificationFingerprint }=await import('../src/lib/route-change-fingerprint.ts');
  const fingerprint=getRouteChangeNotificationFingerprint((await notice.get()).data());
  const assist=assistOf();
  await ok(await act(f.driver.id,{action:'acknowledge',routeId:f.ref.id,fingerprint},assist));
  assert.equal((await notice.get()).get('acknowledged'),true);
  assert.equal((await f.evidence.get()).exists,false);
  const logs=await routeLogs(f.ref.id);
  assert.deepEqual(logs.map(log=>log.eventType),['route_changes_acknowledged']);
  assert.equal(logs[0].userName,'Operadora Teste');
});

test('operador confirma entrega com validação de distância ligada e sem localização do aparelho',async t=>{
  const settings=db.doc('settings/general');
  await settings.set({deliveryDistanceValidation:true,maxDeliveryDistance:0.5});
  t.after(()=>settings.delete());
  const f=await routeFixture(t,{status:'in_progress',startedAt:Timestamp.now(),stops:stops(0,1)});
  const refusedForDriver=await act(f.driver.id,await confirmCommand(t,f,'open-0'));
  assert.equal(refusedForDriver.status,422);
  assert.equal((await refusedForDriver.json()).code,'route_delivery_location');
  await ok(await act(f.driver.id,await confirmCommand(t,f,'open-0'),assistOf()));
});

test('recusa de comando do operador não leva dados do cliente para o log do servidor',async t=>{
  const warn=t.mock.method(console,'warn',()=>{});
  const f=await routeFixture(t,{status:'dispatched',stops:stops(0,3)});
  const assist=assistOf();
  const response=await act(f.driver.id,{action:'finish',routeId:f.ref.id},assist);
  assert.equal(response.status,409);
  const line=warn.mock.calls[0].arguments.join(' ');
  assert.ok(line.includes(assist.grantId));
  assert.ok(!line.includes(CUSTOMER));
});

const runtimeActor=(driverUid,assist)=>({sourceUid:driverUid,userId:assist.staffUserId,native:true,
  assist:{...assist,driverName:'Motorista Teste',expiresAt:new Date(Date.now()+HOUR).toISOString()}});
const runtimeGet=(actor,query)=>serveDriverRuntimeAs(new Request('http://localhost/api/staff/driver-assist?'+query),actor);
const runtimePost=(actor,body)=>serveDriverRuntimeAs(new Request('http://localhost/api/staff/driver-assist',{
  method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),actor);

test('o perfil no modo operador diz quem opera, até quando, e não propaga o logout forçado do motorista',async t=>{
  const driver=await driverProfile(t,{role:'driver',displayName:'Motorista Teste',forceLogoutAt:Timestamp.now()});
  const assist=assistOf();
  const response=await runtimeGet(runtimeActor(driver.id,assist),'resource=profile');
  const body=await response.json();
  assert.equal(response.status,200,JSON.stringify(body));
  assert.equal(body.profile.displayName,'Motorista Teste');
  assert.equal(body.readOnly,false);
  assert.equal(body.forceLogoutAt,null);
  assert.deepEqual(Object.keys(body.assist).sort(),['driverName','expiresAt','staffName']);
  assert.equal(body.assist.staffName,'Operadora Teste');
});

test('o operador vê as rotas ativas do motorista e não recebe pedido de localização',async t=>{
  const f=await routeFixture(t,{status:'dispatched',stops:stops(0,2)});
  const actor=runtimeActor(f.driver.id,assistOf());
  const list=await (await runtimeGet(actor,'resource=routes&view=active')).json();
  assert.deepEqual(list.routes.map(route=>route.id),[f.ref.id]);
  const pending=db.collection('locationUpdateRequests').doc(f.driver.id);
  await pending.set({requestedAt:Timestamp.now()});
  t.after(()=>pending.delete());
  assert.deepEqual(await (await runtimeGet(actor,'resource=location-request')).json(),{revision:null});
});

test('o operador não envia localização, presença, preferências, leitura de aviso nem token de push',async t=>{
  const f=await routeFixture(t,{status:'in_progress',startedAt:Timestamp.now(),stops:stops(0,1)});
  const actor=runtimeActor(f.driver.id,assistOf());
  const blocked=[
    {kind:'location',routeId:f.ref.id,location:{lat:-16.6,lng:-49.2,accuracy:5,heading:null,speed:null}},
    {kind:'presence',online:true},
    {kind:'settings',darkMode:true,autoNavigation:false,keepScreenOn:true},
    {kind:'inbox-open',id:'aviso-1'},
    {kind:'push-disable'},
  ];
  for (const body of blocked) {
    const response=await runtimePost(actor,body);
    assert.equal(response.status,403,body.kind);
    assert.equal((await response.json()).code,'assist_not_allowed',body.kind);
  }
  const route=await f.ref.get();
  assert.equal(route.get('currentLocation'),undefined);
  assert.equal((await f.driver.get()).get('status'),undefined);
});

test('o comando de rota enviado pelo runtime do operador chega marcado',async t=>{
  const f=await routeFixture(t,{status:'dispatched',stops:stops(0,1)});
  const assist=assistOf();
  const response=await runtimePost(runtimeActor(f.driver.id,assist),{kind:'route',command:{action:'start',routeId:f.ref.id}});
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
  const route=await f.ref.get();
  assert.equal(route.get('status'),'in_progress');
  assert.equal(route.get('staffAssist.grantId'),assist.grantId);
  assert.equal(route.get('staffAssist.by'),assist.staffSourceUid);
});
