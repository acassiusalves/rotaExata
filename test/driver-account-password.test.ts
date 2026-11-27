import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeDriverPassword } from '../src/lib/server/driver/account-password.ts';

test('falha do Auth conserva a exigência de trocar senha e não finaliza a revisão', async () => {
  const calls: (string | null)[] = [];
  await assert.rejects(changeDriverPassword('uma-nova-senha', {
    async state(revision) { calls.push(revision); return { revision: '7:2', mustChangePassword: true }; },
    async updatePassword() { throw new Error('Auth rejeitou'); },
  }), /Auth rejeitou/);
  assert.deepEqual(calls,[null]);
});

test('atualização confirmada pelo Auth finaliza a revisão preparada', async () => {
  const calls: (string | null)[] = [];
  const result=await changeDriverPassword('uma-nova-senha', {
    async state(revision) { calls.push(revision); return { revision: '7:2', mustChangePassword: revision === null }; },
    async updatePassword() { calls.push('auth'); },
  });
  assert.deepEqual(calls,[null,'auth','7:2']);
  assert.equal(result.mustChangePassword,false);
});
