import assert from 'node:assert/strict';
import test from 'node:test';
import { profileFailure } from '../src/lib/driver/profile-failure.ts';

const failure = (status: number, code: string) => Object.assign(new Error(code), { status, code });
const driver = { native: true, assist: false };
const operator = { native: true, assist: true };

test('falha de rede ou do servidor mantém a tela e marca a sessão como em verificação', () => {
  assert.deepEqual(profileFailure(new TypeError('Failed to fetch'), driver), { kind: 'stale' });
  assert.deepEqual(profileFailure(failure(503, 'route_unavailable'), driver), { kind: 'stale' });
  assert.deepEqual(profileFailure(failure(503, 'route_unavailable'), operator), { kind: 'stale' });
});

test('motorista com sessão expirada é deslogado, como antes', () => {
  assert.deepEqual(profileFailure(failure(401, 'earnings_unauthorized'), driver),
    { kind: 'denied', message: 'Não foi possível carregar sua conta.', passwordRequired: false, signOut: true, retry: true });
});

test('motorista sem acesso vê a mensagem de conta sem acesso, como antes', () => {
  assert.deepEqual(profileFailure(failure(403, 'route_access_denied'), driver),
    { kind: 'denied', message: 'Esta conta não tem acesso às rotas.', passwordRequired: false, signOut: false, retry: true });
});

test('troca de senha pendente só é pedida no modo nativo', () => {
  const pending = failure(403, 'platform_password_change_required');
  assert.equal((profileFailure(pending, driver) as { passwordRequired: boolean }).passwordRequired, true);
  assert.equal((profileFailure(pending, { native: false, assist: false }) as { passwordRequired: boolean }).passwordRequired, false);
});

test('operador com sessão expirada NÃO é deslogado do painel', () => {
  const result = profileFailure(failure(401, 'earnings_unauthorized'), operator);
  assert.deepEqual(result, { kind: 'denied', message: 'Sua sessão do painel expirou. Entre de novo no painel e abra o app do motorista outra vez.',
    passwordRequired: false, signOut: false, retry: false });
});

test('acesso vencido ou desconhecido pede para abrir de novo e não oferece nova tentativa', () => {
  for (const code of ['assist_expired', 'assist_not_found']) {
    assert.deepEqual(profileFailure(failure(403, code), operator),
      { kind: 'denied', message: 'Acesso encerrado. Abra de novo pelo painel.', passwordRequired: false, signOut: false, retry: false }, code);
  }
});

test('operador sem permissão vê que a conta não tem acesso à função', () => {
  assert.deepEqual(profileFailure(failure(403, 'staff_access_denied'), operator),
    { kind: 'denied', message: 'Sua conta não tem acesso a esta função.', passwordRequired: false, signOut: false, retry: true });
});

test('no modo operador nunca se pede troca de senha do motorista', () => {
  assert.equal((profileFailure(failure(403, 'platform_password_change_required'), operator) as { passwordRequired: boolean }).passwordRequired, false);
});
