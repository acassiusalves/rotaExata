import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { resolveDispatchDriver } from '../src/lib/dispatch-driver.ts';
import { summarizeServiceDispatch } from '../src/lib/service-dispatch-summary.ts';

test('atribuição usa o UID e o cadastro de users, sem depender de drivers', async () => {
  const driver = await resolveDispatchDriver(' a ', async uid => uid === 'a' ? { role: 'driver', displayName: 'Entregador' } : null);
  assert.equal(driver.id, 'a');
  assert.equal(driver.name, 'Entregador');
});
test('cadastro inexistente ou que não seja entregador é recusado antes da criação da rota', async () => {
  await assert.rejects(resolveDispatchDriver('missing', async () => null));
  await assert.rejects(resolveDispatchDriver('admin', async () => ({ role: 'admin' })));
  await assert.rejects(resolveDispatchDriver(' ', async () => ({ role: 'driver' })));
});
test('resumo distingue rascunho, atribuição válida e documento sem destinatário', () => {
  assert.deepEqual(summarizeServiceDispatch([
    { status: 'draft' }, { status: 'in_progress', driverId: 'a' }, { status: 'dispatched' },
  ]), { sent: 1, drafts: 1 });
});
