import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { buildSync } = require('esbuild');
const { runInThisContext } = require('node:vm');
const preferencesModule = { exports: {} };
const preferencesCode = buildSync({ entryPoints: ['src/lib/firebase/push-preferences.ts'], bundle: true, packages: 'external', platform: 'node', format: 'cjs', write: false }).outputFiles[0].text;
runInThisContext(`(function(require, module, exports) { ${preferencesCode}\n})`)(require, preferencesModule, preferencesModule.exports);
const { persistDriverPushToken, disableDriverPushToken } = preferencesModule.exports;
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
assert.equal(emulator, '127.0.0.1:8181', 'Regras só podem ser testadas no emulador local dedicado');
const projectId = 'demo-rotaexata-rules';
let env;
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { host: '127.0.0.1', port: 8181, rules: readFileSync('firestore.rules', 'utf8') } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      db.doc('users/a').set({ role: 'driver' }), db.doc('users/b').set({ role: 'driver' }), db.doc('users/admin').set({ role: 'admin' }),
      db.doc('routes/route-a').set({ driverId: 'a', status: 'dispatched', pendingChanges: true }),
      db.doc('notifications/notice-a').set({ driverId: 'a', routeId: 'route-a', opened: false, title: 'Aviso' }),
      db.doc('routeChangeNotifications/route-a').set({ driverId: 'a', routeId: 'route-a', acknowledged: false, changes: [] }),
      db.doc('activity_log/log-a').set({ eventType: 'route_dispatched' }),
      db.doc('orders/protected').set({ retornoFinanceiro: { versao: 2 }, billing: { finalValue: 100 } }),
      db.doc('products/protected').set({ name: 'Produto' }),
    ]);
  });
});
const db = uid => env.authenticatedContext(uid).firestore();

test('motorista lê e marca seu aviso como aberto', async () => {
  await assertSucceeds(db('a').doc('notifications/notice-a').get());
  await assertSucceeds(db('a').doc('notifications/notice-a').update({ opened: true }));
});
test('outro motorista não lê nem assume o aviso de uma rota', async () => {
  await assertFails(db('b').doc('notifications/notice-a').get());
  await assertFails(db('b').doc('routeChangeNotifications/route-a').update({ driverId: 'b' }));
});
test('motorista não reescreve conteúdo do aviso nem seu destinatário', async () => {
  await assertFails(db('a').doc('notifications/notice-a').update({ title: 'Outra mensagem' }));
  await assertFails(db('a').doc('notifications/notice-a').update({ driverId: 'b' }));
});
test('motorista confirma mudanças sem alterar a identidade do aviso', async () => {
  await assertSucceeds(db('a').doc('routeChangeNotifications/route-a').get());
  await assertSucceeds(db('a').doc('routeChangeNotifications/route-a').update({ acknowledged: true }));
  await assertFails(db('a').doc('routeChangeNotifications/route-a').update({ changes: [{ arbitrary: true }] }));
});
test('usuário não autenticado não lê avisos', async () => {
  await assertFails(env.unauthenticatedContext().firestore().doc('notifications/notice-a').get());
});
test('administrador mantém gestão dos avisos', async () => {
  await assertSucceeds(db('admin').doc('notifications/notice-a').update({ title: 'Mensagem revisada' }));
  await assertSucceeds(db('admin').doc('routeChangeNotifications/route-a').update({ acknowledged: false }));
});
test('preferências do motorista são graváveis apenas por ele e com os campos previstos', async () => {
  const prefs = { notifications: true, darkMode: false, autoNavigation: false, keepScreenOn: true };
  await assertSucceeds(db('a').doc('users/a/settings/preferences').set(prefs));
  await assertSucceeds(db('a').doc('users/a/settings/preferences').get());
  await assertFails(db('b').doc('users/a/settings/preferences').set(prefs));
  await assertFails(db('a').doc('users/a/settings/preferences').update({ role: 'admin' }));
  await assertFails(db('a').doc('users/a/settings/preferences').update({ notifications: 'true' }));
});
test('ativação e desativação registram token e preferência em um único batch autorizado', async () => {
  const owner = db('a');
  const batch = owner.batch();
  batch.update(owner.doc('users/a'), { fcmToken: 'test-token' });
  batch.set(owner.doc('users/a/settings/preferences'), { notifications: true }, { merge: true });
  await assertSucceeds(batch.commit());
  assert.equal((await owner.doc('users/a/settings/preferences').get()).data().notifications, true);
});
test('histórico permite criação autenticada mas mantém registros imutáveis', async () => {
  await assertSucceeds(db('a').doc('activity_log/new').set({ eventType: 'delivery_completed' }));
  await assertFails(db('a').doc('activity_log/log-a').update({ eventType: 'changed' }));
  await assertFails(db('admin').doc('activity_log/log-a').delete());
});
test('composição preserva proteção financeira V2 e exclusão de produtos', async () => {
  await assertFails(db('admin').doc('orders/protected').update({ 'billing.finalValue': 120 }));
  await assertFails(db('admin').doc('products/protected').delete());
});

for (const explicit of [false, true]) test(`cadastro pendente (${explicit ? 'manual' : 'automático'}) não desfaz desativação de outra aba`, async () => {
  const owner = db('a');
  await owner.doc('users/a/settings/preferences').set({ notifications: true, pushRevision: 0 });
  await disableDriverPushToken(owner._delegate, 'a');
  await assert.rejects(persistDriverPushToken(owner._delegate, 'a', 'late-token', { explicit, preferenceRevision: 0 }));
  assert.equal((await owner.doc('users/a/settings/preferences').get()).data().notifications, false);
  assert.equal((await owner.doc('users/a').get()).data().fcmToken, undefined);
});
test('ativação explícita atualiza token e versão sem apagar preferências existentes', async () => {
  const owner = db('a');
  await owner.doc('users/a/settings/preferences').set({ notifications: false, darkMode: true, pushRevision: 2 });
  await persistDriverPushToken(owner._delegate, 'a', 'current-token', { explicit: true, preferenceRevision: 2 });
  const prefs = (await owner.doc('users/a/settings/preferences').get()).data();
  assert.equal(prefs.notifications, true);
  assert.equal(prefs.pushRevision, 3);
  assert.equal(prefs.darkMode, true);
  await assertFails(owner.doc('users/a/settings/preferences').update({ pushRevision: -1 }));
});

test('motorista atualiza presença sem alterar papel, atribuição ou fatos tarifáveis', async () => {
  await assertSucceeds(db('a').doc('users/a').update({ status: 'online' }));
  await assertFails(db('a').doc('users/a').update({ role: 'admin' }));
  await assertSucceeds(db('a').doc('routes/route-a').update({ currentLocation: { lat: 0, lng: 0 } }));
  await assertFails(db('a').doc('routes/route-a').update({ driverId: 'b' }));
  await assertFails(db('a').doc('routes/route-a').update({ status: 'completed' }));
  await assertFails(db('a').doc('routes/route-a').update({ stops: [{ id: 'fake' }] }));
  await assertFails(db('admin').doc('routes/route-a').update({ earningsSourceStart: { driverUid: 'a' } }));
  await assertFails(db('admin').doc('rotaEarningOutbox/event-a').set({ ready: true }));
});

test('corte nativo fecha o SDK Firebase para motoristas e preserva operações do administrador', async () => {
  await env.withSecurityRulesDisabled(async context => {
    const source=context.firestore();
    await source.doc('rotaAuthTransition/driver').set({mode:'supabase',driverUids:['former-driver']});
    await source.doc('users/former-driver').set({role:'usuario'});
  });
  await assertFails(db('a').doc('users/a').get());
  await assertFails(db('former-driver').doc('activity_log/log-a').get());
  await assertSucceeds(db('no-profile').doc('activity_log/log-a').get());
  await assertFails(db('a').doc('routes/route-a').get());
  await assertFails(db('a').doc('notifications/notice-a').update({opened:true}));
  await assertFails(db('a').doc('activity_log/new').set({eventType:'route_completed'}));
  await assertSucceeds(db('admin').doc('routes/route-a').get());
  await assertSucceeds(db('admin').doc('settings/general').get());
  await assertFails(db('admin').doc('rotaAuthTransition/driver').update({mode:'firebase'}));
  await env.withSecurityRulesDisabled(context =>
    context.firestore().doc('rotaAuthTransition/driver').update({mode:'firebase'}));
  await assertSucceeds(db('a').doc('routes/route-a').get());
});

test('staff only dispatches a new native UUID after its server-owned projection is enabled',async()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const target=db('admin').doc('routes/source-dispatch');
  await assertFails(target.set({driverId:id,status:'dispatched'}));
  await assertFails(db('admin').doc('users/'+id).set({role:'driver'}));
  await assertSucceeds(db('admin').doc('users/'+id).set({role:'usuario'}));
  await assertFails(db('admin').doc('users/'+id).update({role:'driver'}));
  await env.withSecurityRulesDisabled(async context=>{
    await context.firestore().doc('users/'+id).set({nativeDriverProvisioningId:'owned',nativeDriverReady:false,nativeDriverDispatchEnabled:false});
  });
  await assertFails(target.set({driverId:id,status:'dispatched'}));
  await assertFails(db('admin').doc('users/'+id).update({nativeDriverReady:true,role:'driver'}));
  await assertFails(db('admin').doc('users/'+id).delete());
  await env.withSecurityRulesDisabled(async context=>{
    await context.firestore().doc('users/'+id).update({nativeDriverReady:true,nativeDriverDispatchEnabled:true,role:'driver'});
  });
  await assertSucceeds(target.set({driverId:id,status:'dispatched'}));
  await assertSucceeds(db('admin').doc('routes/route-a').update({driverId:id}));
  await env.withSecurityRulesDisabled(async context=>{
    await context.firestore().doc('users/'+id).update({nativeDriverDispatchEnabled:false});
  });
  await assertFails(db('admin').doc('routes/second-dispatch').set({driverId:id,status:'dispatched'}));
  await assertFails(db('admin').doc('users/'+id).update({nativeDriverDispatchEnabled:true}));
  await assertSucceeds(target.update({driverInfo:{name:'Atualização existente'}}));
  await assertSucceeds(target.update({driverId:'a'})); // UID legado preservado
});

test('Google Maps server credential is server-only while other settings keep their contract',async()=>{
  await env.withSecurityRulesDisabled(async context=>{
    const source=context.firestore();
    await source.doc('settings/googleMaps').set({apiKey:'synthetic-never-a-real-key'});
    await source.doc('settings/defaultOrigin').set({active:true});
  });
  const publicDb=env.unauthenticatedContext().firestore();
  await assertSucceeds(publicDb.doc('settings/defaultOrigin').get());
  await assertSucceeds(db('admin').doc('settings/defaultOrigin').set({active:false}));
  await assertFails(publicDb.doc('settings/googleMaps').get());
  await assertFails(db('admin').doc('settings/googleMaps').get());
  await assertFails(db('admin').doc('settings/googleMaps').update({apiKey:'synthetic-replacement'}));
});

test('staff provisioning marker and projected role cannot be altered by Firebase clients',async()=>{
  const admin=db('admin');
  await assertFails(admin.doc('users/forged-native-staff').set({role:'admin',nativeStaffProvisioningId:'forged'}));
  await env.withSecurityRulesDisabled(async context=>{
    await context.firestore().doc('users/native-staff').set({role:'gestor',active:true,nativeStaffProvisioningId:'synthetic'});
  });
  await assertSucceeds(admin.doc('users/native-staff').get());
  await assertFails(admin.doc('users/native-staff').update({role:'admin'}));
  await assertFails(admin.doc('users/native-staff').delete());
});

test('autoria nativa do aviso só pode ser atribuída pelo servidor',async()=>{
  const legacy={driverId:'a',title:'Aviso'};
  await assertSucceeds(db('a').doc('notifications/legacy').set(legacy));
  await assertFails(db('a').doc('notifications/spoofed').set({...legacy,staffAuthorId:'operator'}));
  for (const key of ['staffScopeId','staffAuthorId','staffAuthorName','staffNotificationCommandId','staffPushStatus']) {
    await assertFails(db('admin').doc('notifications/notice-a').update({[key]:'forged'}));
  }
});

test('corte de staff impede escritas Rota exclusivas e preserva a integração Lunna',async()=>{
  const admin=db('admin');
  await assertSucceeds(admin.doc('settings/permissions').set({pagePermissions:{}}));
  await env.withSecurityRulesDisabled(context=>context.firestore().doc('rotaAuthTransition/staff').set({mode:'supabase'}));
  await assertFails(admin.doc('rotaAuthTransition/staff').update({mode:'firebase'}));
  await assertFails(admin.doc('settings/permissions').update({pagePermissions:{}}));
  await assertFails(admin.doc('notifications/notice-a').update({title:'Novo'}));
  await assertFails(admin.doc('locationUpdateRequests/driver-a').set({driverId:'driver-a'}));
  await assertSucceeds(admin.doc('settings/defaultOrigin').set({origin:{lat:1,lng:2}}));
  await assertSucceeds(admin.doc('settings/app').set({pagePermissions:{}}));
  await assertSucceeds(admin.doc('routes/route-a').update({name:'Lunna'}));
  await assertSucceeds(admin.doc('services/lunna-direct').set({status:'organizing'}));
  await assertSucceeds(admin.doc('counters/serviceCode').set({count:1}));
  // Desde 21/11/2026 (liberação R1 do Lunna em modo nativo) pedido só é criado pelo servidor.
  // O Rota Exata não cria pedido pelo SDK: src/lib/lunna-sync.ts só atualiza metadados de entrega.
  await assertFails(admin.doc('orders/lunna-direct').set({number:'SYNTHETIC'}));
});

test('Luna activity can append legacy logs but cannot claim a canonical Rota actor',async()=>{
  const operator=db('admin');
  const row={eventType:'point_removed_from_route',userId:'admin',routeId:'route-a'};
  await assertSucceeds(operator.doc('activity_log/lunna-legacy').set(row));
  await assertFails(operator.doc('activity_log/spoofed-native').set({...row,staffAuditVersion:1,canonicalUserId:'canonical-user'}));
  await assertFails(operator.doc('activity_log/staff-spoofed').set(row));
});
