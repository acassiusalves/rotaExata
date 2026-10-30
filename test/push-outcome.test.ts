import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { sendPushWithOutcome, persistPushOutcome } from '../functions/src/push-outcome.ts';

test('sem token o aviso fica explicitamente sem envio de push', async () => {
  const outcome = await sendPushWithOutcome(false, async () => { throw new Error('não deve enviar'); });
  assert.equal(outcome.outcome, 'skipped_no_token');
});

test('resultado de envio antigo não sobrescreve aviso que já mudou', async () => {
  let version = 2;
  let stored = 'failed';
  const updated = await persistPushOutcome(async () => {
    if (version !== 1) throw { code: 9 };
    stored = 'accepted';
  });
  assert.equal(updated, false);
  assert.equal(stored, 'failed');
});
test('aceite do provedor inclui ID mas não declara recebimento no celular', async () => {
  const outcome = await sendPushWithOutcome(true, async () => 'provider-message');
  assert.deepEqual(outcome, { outcome: 'accepted', messageId: 'provider-message' });
});
test('falha no envio retorna falha sem expor dados do token ou do erro original', async () => {
  const outcome = await sendPushWithOutcome(true, async () => { throw { code: 'messaging/registration-token-not-registered', token: 'private' }; });
  assert.deepEqual(outcome, { outcome: 'failed', errorCode: 'messaging/registration-token-not-registered' });
});
