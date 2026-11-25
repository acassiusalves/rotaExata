import assert from 'node:assert/strict';
import test from 'node:test';
import { staffOperationAllowed } from '../src/lib/staff/access.ts';
import {
  ASSIST_TTL_MS, assistCommandAllowed, assistGrantProblem, assistOpenMessage, isAssistGrantId,
} from '../src/lib/driver/assist-policy.ts';

const open = { pagePermissions: {}, inactivePages: [] as string[] };
const actor = (role: 'admin' | 'socio' | 'gestor') => ({ role, policy: open, rotaPolicy: open });

test('operar o app do motorista é liberado só para admin e sócio', () => {
  assert.equal(staffOperationAllowed(actor('admin'), 'driver:operate'), true);
  assert.equal(staffOperationAllowed(actor('socio'), 'driver:operate'), true);
  assert.equal(staffOperationAllowed(actor('gestor'), 'driver:operate'), false);
});

test('operar o app do motorista exige a página Motoristas ativa', () => {
  const inactive = { ...actor('admin'), rotaPolicy: { pagePermissions: {}, inactivePages: ['/drivers'] } };
  assert.equal(staffOperationAllowed(inactive, 'driver:operate'), false);
});

const owner = { userId: 'user-1', sessionId: 'session-1' };
const grant = { staffUserId: 'user-1', staffSessionId: 'session-1', expiresAtMs: 10_000, endedAtMs: null };

test('o acesso vale 60 minutos', () => {
  assert.equal(ASSIST_TTL_MS, 60 * 60 * 1000);
});

test('acesso válido do próprio operador e da própria sessão é aceito', () => {
  assert.equal(assistGrantProblem(grant, owner, 9_999), null);
});

test('acesso inexistente, de outro operador ou de outra sessão não é reconhecido', () => {
  assert.equal(assistGrantProblem(undefined, owner, 0), 'assist_not_found');
  assert.equal(assistGrantProblem(grant, { ...owner, userId: 'user-2' }, 0), 'assist_not_found');
  assert.equal(assistGrantProblem(grant, { ...owner, sessionId: 'session-2' }, 0), 'assist_not_found');
});

test('acesso vencido ou encerrado é recusado', () => {
  assert.equal(assistGrantProblem(grant, owner, 10_000), 'assist_expired');
  assert.equal(assistGrantProblem({ ...grant, endedAtMs: 5 }, owner, 6), 'assist_expired');
});

test('no modo operador só comandos de rota e envio de foto são aceitos', () => {
  assert.deepEqual(['route', 'upload'].map(assistCommandAllowed), [true, true]);
  for (const kind of ['location', 'presence', 'settings', 'inbox-open', 'push-bind', 'push-disable', 'push-detach', undefined]) {
    assert.equal(assistCommandAllowed(kind), false, String(kind));
  }
});

test('identificador de acesso precisa ser um UUID', () => {
  assert.equal(isAssistGrantId('3f2c1a9e-8b7d-4c6f-9a1b-2d3e4f5a6b7c'), true);
  assert.equal(isAssistGrantId('../routes'), false);
  assert.equal(isAssistGrantId(null), false);
});

test('falha ao abrir o app do motorista vira mensagem para o operador', () => {
  const failure = (status: number, code: string) => Object.assign(new Error(code), { status, code });
  assert.match(assistOpenMessage(failure(404, 'staff_driver_not_found')), /motorista n[aã]o encontrado/i);
  assert.match(assistOpenMessage(failure(403, 'staff_access_denied')), /n[aã]o tem acesso/i);
  assert.match(assistOpenMessage(failure(422, 'staff_invalid_command')), /motivo/i);
  assert.match(assistOpenMessage(new TypeError('Failed to fetch')), /n[aã]o foi poss[ií]vel abrir/i);
});
