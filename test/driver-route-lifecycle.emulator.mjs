// Ciclo Iniciar -> Confirmar -> Finalizar do motorista contra o emulador do Firestore.
// Rodar com:
//   PATH=/opt/homebrew/opt/openjdk@21/bin:$PATH firebase emulators:exec --project demo-rotaexata-driver \
//     --only firestore --config firebase.test.json "node --import tsx --test test/driver-route-lifecycle.emulator.mjs"
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
process.env.FIREBASE_PROJECT_ID='demo-rotaexata-driver';
const { adminDb:db }=await import('../src/lib/firebase/admin.ts');
const { performDriverRouteAction }=await import('../src/lib/server/earnings/firestore-route-actions.ts');
assert.ok(db,'Firestore emulator is required');
after(()=>db.terminate());

const CUSTOMER='Cliente Sigiloso da Silva';
const ADDRESS='Rua Reservada 123';
const stop=(id,deliveryStatus)=>({id,customerName:CUSTOMER,address:ADDRESS,phone:'62999990000',lat:-16.6,lng:-49.2,
  ...(deliveryStatus ? {deliveryStatus,completedAt:Timestamp.now()}:{})});
const stops=(done,open)=>[...Array.from({length:done},(_,i)=>stop('done-'+i,'completed')),...Array.from({length:open},(_,i)=>stop('open-'+i))];

async function fixture(t,route) {
  const driver=db.collection('users').doc('driver-'+randomUUID());
  const ref=db.collection('routes').doc('route-'+randomUUID());
  const evidence=db.collection('rotaEarningRouteEvidence').doc(ref.id);
  await driver.set({role:'driver',active:true,name:'Motorista de teste'});
  await ref.set({name:'Rota de teste',code:'LNS-TEST',driverId:driver.id,plannedDate:Timestamp.now(),...route});
  t.after(()=>Promise.all([driver.delete(),ref.delete(),evidence.delete()]));
  return {driver,ref,evidence};
}
const send=(uid,command,authority={canonical:true,bindMedia:true})=>performDriverRouteAction(
  new Request('http://localhost/api/driver/runtime',{method:'POST',body:JSON.stringify(command)}),uid,authority);
async function expectResponse(response,status,code) {
  const body=await response.json();
  assert.equal(response.status,status,'server returned '+JSON.stringify(body));
  if (code) assert.equal(body.code,code);
  return body;
}
const logged=mock=>mock.mock.calls.map(call=>call.arguments.join(' '));

test('iniciar uma rota despachada a coloca em andamento e cria a evidência de início',async t=>{
  const f=await fixture(t,{status:'dispatched',stops:stops(0,3)});
  await expectResponse(await send(f.driver.id,{action:'start',routeId:f.ref.id}),200);
  const route=await f.ref.get();
  assert.equal(route.get('status'),'in_progress');
  assert.equal(route.get('currentStopIndex'),0);
  assert.ok(route.get('startedAt') instanceof Timestamp);
  assert.equal((await f.evidence.get()).get('start.driverUid'),f.driver.id);

  // Toque repetido em "Iniciar" não reinicia a rota.
  await expectResponse(await send(f.driver.id,{action:'start',routeId:f.ref.id}),200);
  assert.deepEqual((await f.ref.get()).get('startedAt'),route.get('startedAt'));
});

test('finalizar uma rota que nunca foi iniciada é recusado com o motivo e fica registrado em log',async t=>{
  const warn=t.mock.method(console,'warn',()=>{});
  const f=await fixture(t,{status:'dispatched',stops:stops(0,6)});
  const body=await expectResponse(await send(f.driver.id,{action:'finish',routeId:f.ref.id}),409,'route_not_ready');
  assert.deepEqual(body,{code:'route_not_ready',routeStatus:'dispatched',activeStops:6,resolvedStops:0});
  assert.equal((await f.ref.get()).get('status'),'dispatched');
  const lines=logged(warn);
  assert.equal(lines.length,1);
  assert.match(lines[0],/"action":"finish"/);
  assert.match(lines[0],/"code":"route_not_ready"/);
  assert.match(lines[0],/"routeStatus":"dispatched"/);
  assert.ok(lines[0].includes(f.ref.id));
  assert.ok(!lines[0].includes(CUSTOMER) && !lines[0].includes(ADDRESS) && !lines[0].includes('62999990000'),'log não leva dados do cliente');
});

test('finalizar abaixo de 80% devolve quantas paradas faltam',async t=>{
  t.mock.method(console,'warn',()=>{});
  const f=await fixture(t,{status:'in_progress',startedAt:Timestamp.now(),stops:stops(3,2)});
  const body=await expectResponse(await send(f.driver.id,{action:'finish',routeId:f.ref.id}),409,'route_not_ready');
  assert.deepEqual(body,{code:'route_not_ready',routeStatus:'in_progress',activeStops:5,resolvedStops:3});
  assert.equal((await f.ref.get()).get('status'),'in_progress');
});

test('finalizar com 80% conclui a rota',async t=>{
  const warn=t.mock.method(console,'warn',()=>{});
  const f=await fixture(t,{status:'in_progress',startedAt:Timestamp.now(),stops:stops(4,1)});
  await expectResponse(await send(f.driver.id,{action:'finish',routeId:f.ref.id}),200);
  const route=await f.ref.get();
  assert.equal(route.get('status'),'completed');
  assert.ok(route.get('completedAt') instanceof Timestamp);
  assert.equal(logged(warn).length,0,'sucesso não gera log de recusa');
});

test('rota iniciada, confirmada e finalizada pelo app gera evidência de conclusão para a remuneração',async t=>{
  const f=await fixture(t,{status:'dispatched',stops:stops(0,5)});
  const legacy={canonical:true};
  await expectResponse(await send(f.driver.id,{action:'start',routeId:f.ref.id},legacy),200);
  for (const id of ['open-0','open-1','open-2','open-3']) {
    await expectResponse(await send(f.driver.id,{action:'confirm',routeId:f.ref.id,targetStop:{id},patch:{
      deliveryStatus:'completed',notes:null,failureReason:null,wentToLocation:null,payments:[],deliveredItemIds:[],
      photoUrl:'https://cdn.example.test/'+id+'.jpg',attemptPhotoUrl:null}},legacy),200);
  }
  await expectResponse(await send(f.driver.id,{action:'finish',routeId:f.ref.id},legacy),200);
  assert.equal((await f.ref.get()).get('status'),'completed');
  assert.equal((await f.evidence.get()).get('completion.kind'),'driver-server-v1');
});

test('rota reaberta pelo painel pode ser finalizada de novo pelo motorista',async t=>{
  const startedAt=Timestamp.fromMillis(Date.now()-3600000);
  const f=await fixture(t,{status:'completed',startedAt,completedAt:Timestamp.now(),currentStopIndex:4,stops:stops(4,1)});
  // Mesmo patch que src/lib/server/staff/history-reopen.ts grava na rota.
  await f.ref.update({status:'in_progress',reopenedAt:FieldValue.serverTimestamp(),reopenedBy:'staff',reopenReason:'Correcao de dados',
    reopenCount:FieldValue.increment(1),completedAt:FieldValue.delete(),autoCompletedAt:FieldValue.delete(),completedBy:FieldValue.delete()});
  await expectResponse(await send(f.driver.id,{action:'finish',routeId:f.ref.id}),200);
  const route=await f.ref.get();
  assert.equal(route.get('status'),'completed');
  assert.ok(route.get('completedAt') instanceof Timestamp);
  assert.deepEqual(route.get('startedAt'),startedAt);
});

test('iniciar uma rota já finalizada é recusado e registrado',async t=>{
  const warn=t.mock.method(console,'warn',()=>{});
  const f=await fixture(t,{status:'completed',completedAt:Timestamp.now(),stops:stops(3,0)});
  const body=await expectResponse(await send(f.driver.id,{action:'start',routeId:f.ref.id}),409,'route_invalid_state');
  assert.equal(body.routeStatus,'completed');
  assert.match(logged(warn)[0],/"action":"start".*"code":"route_invalid_state".*"routeStatus":"completed"/);
});

test('motorista não mexe na rota de outro, e a tentativa fica registrada',async t=>{
  const warn=t.mock.method(console,'warn',()=>{});
  const f=await fixture(t,{status:'dispatched',stops:stops(0,2)});
  const intruder=db.collection('users').doc('driver-'+randomUUID());
  await intruder.set({role:'driver',active:true});
  t.after(()=>intruder.delete());
  await expectResponse(await send(intruder.id,{action:'start',routeId:f.ref.id}),403,'route_access_denied');
  assert.equal((await f.ref.get()).get('status'),'dispatched');
  assert.match(logged(warn)[0],/"code":"route_access_denied"/);
  assert.ok(logged(warn)[0].includes(intruder.id));
});

test('comando que o servidor não reconhece é recusado e registrado',async t=>{
  const warn=t.mock.method(console,'warn',()=>{});
  await expectResponse(await send('driver-qualquer',{action:'pausar',routeId:'route-x'}),400,'route_invalid_request');
  assert.match(logged(warn)[0],/"httpStatus":400.*"code":"route_invalid_request"/);
});
