import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createPushRegistrar } from '../src/lib/push-registration.ts';

function fixture() {
  const tokens = new Map<string, string>();
  let permission: NotificationPermission = 'granted';
  let uid = 'a';
  let impersonating = false;
  let failSave = false;
  const registrar = createPushRegistrar({
    isSupported: async () => true,
    getPermission: () => permission,
    requestPermission: async () => { permission = 'granted'; return permission; },
    getCurrentUid: () => uid,
    isImpersonating: () => impersonating,
    getToken: async () => 'device-token',
    saveToken: async (id, token) => { if (failSave) throw { code: 'permission-denied' }; tokens.set(id, token); },
  });
  return { registrar, tokens, setPermission(p: NotificationPermission) { permission = p; }, setUid(id: string) { uid = id; }, impersonate() { impersonating = true; }, failSave() { failSave = true; } };
}

test('notificações só ficam ativas depois de persistir o token', async () => {
  const f = fixture();
  assert.equal((await f.registrar.register('a', true)).state, 'enabled');
  assert.equal(f.tokens.get('a'), 'device-token');
});
test('permissão concedida com erro de persistência continua como falha', async () => {
  const f = fixture(); f.failSave();
  const result = await f.registrar.register('a', true);
  assert.equal(result.state, 'error');
  assert.equal(result.errorCode, 'permission-denied');
  assert.equal(f.tokens.size, 0);
});
test('permissão negada não registra token', async () => {
  const f = fixture(); f.setPermission('denied');
  assert.equal((await f.registrar.register('a', true)).state, 'blocked');
  assert.equal(f.tokens.size, 0);
});
test('abertura automática não solicita permissão ainda não escolhida', async () => {
  const f = fixture(); f.setPermission('default');
  assert.equal((await f.registrar.register('a', false)).state, 'needs_permission');
  assert.equal(f.tokens.size, 0);
  assert.equal((await f.registrar.register('a', true)).state, 'enabled');
});
test('impersonação não cadastra token na conta do entregador', async () => {
  const f = fixture(); f.impersonate();
  assert.equal((await f.registrar.register('a', true)).state, 'impersonating');
  assert.equal(f.tokens.size, 0);
});
test('uma sessão diferente não pode cadastrar token para o UID anterior', async () => {
  const f = fixture(); f.setUid('b');
  assert.equal((await f.registrar.register('a', true)).state, 'error');
  assert.equal(f.tokens.size, 0);
});
test('troca de sessão durante obtenção do token impede persistência', async () => {
  const tokens = new Map<string, string>(); let uid = 'a';
  const registrar = createPushRegistrar({
    isSupported: async () => true, getPermission: () => 'granted', requestPermission: async () => 'granted',
    getCurrentUid: () => uid, isImpersonating: () => false,
    getToken: async () => { uid = 'b'; return 'token'; },
    saveToken: async (id, token) => { tokens.set(id, token); },
  });
  assert.equal((await registrar.register('a', true)).state, 'error');
  assert.equal(tokens.size, 0);
});
test('navegador sem suporte informa indisponibilidade sem tentar cadastrar token', async () => {
  const registrar = createPushRegistrar({
    isSupported: async () => false, getPermission: () => 'default', requestPermission: async () => 'granted',
    getCurrentUid: () => 'a', isImpersonating: () => false,
    getToken: async () => { throw new Error('não deveria obter token'); }, saveToken: async () => {},
  });
  assert.equal((await registrar.register('a', true)).state, 'unsupported');
});

test('retomar o app não reativa notificações desativadas pelo usuário', async () => {
  const registrar = createPushRegistrar({
    isSupported: async () => true, getPermission: () => 'granted', requestPermission: async () => 'granted',
    getCurrentUid: () => 'a', isImpersonating: () => false, isEnabled: async () => false,
    getToken: async () => { throw new Error('não deve reativar token'); }, saveToken: async () => {},
  });
  assert.equal((await registrar.register('a', false)).state, 'disabled');
});

test('desativação invalida cadastro pendente do mesmo usuário', async () => {
  let finish!: (token: string) => void;
  const token = new Promise<string>(resolve => { finish = resolve; });
  const tokens = new Map<string, string>();
  const registrar = createPushRegistrar({
    isSupported: async () => true, getPermission: () => 'granted', requestPermission: async () => 'granted',
    getCurrentUid: () => 'a', isImpersonating: () => false,
    getToken: () => token, saveToken: async (id, value) => { tokens.set(id, value); },
    disableToken: async () => { tokens.delete('a'); },
  });
  const registering = registrar.register('a', false);
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await registrar.disable('a');
  finish('late-token');
  assert.equal((await registering).state, 'disabled');
  assert.equal(tokens.size, 0);
});
