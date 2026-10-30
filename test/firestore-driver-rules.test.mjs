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
const projectId = 'demo-rotaexata-driver';
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
