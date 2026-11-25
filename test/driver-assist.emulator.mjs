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
