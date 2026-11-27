import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireEarningsActor, type ActorAuthority } from '../src/lib/server/earnings/actor.ts';

const issuer = 'http://127.0.0.1:54321/auth/v1';
const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const scopeId = '30000000-0000-4000-8000-000000000001';
const claims = { sub: userId, session_id: sessionId, iss: issuer, exp: 1900000000, aud: 'authenticated', role: 'authenticated', aal: 'aal1' };
const driver = { userId, sessionId, scopeId, role: 'driver', application: 'driver', revision: 1, policyRevision: 1 };

function tokenClaim(extras: Record<string, unknown> = {}) {
  const payload = Buffer.from(JSON.stringify({ ...claims, ...extras })).toString('base64url');
  return new Request('http://localhost/api?userId=forged&scopeId=forged&role=admin', {
    headers: { authorization: 'Bearer e30.' + payload + '.test' },
  });
}
function authority(actor: unknown = driver): ActorAuthority {
  return {
    issuer,
    scopeId,
    now: () => 1800000000000,
    verify: async () => ({ id: userId }),
    resolve: async () => actor,
  };
}

test('verifies a native session and uses the canonical identity and server scope', async () => {
  const action = await requireEarningsActor(tokenClaim(), 'statement', authority());
  assert.equal(action.userId, userId);
  assert.equal(action.sessionId, sessionId);
  assert.equal(action.scopeId, scopeId);
  assert.equal(action.role, 'driver');
});

test('denies absent, revoked, and non-native credentials', async () => {
  await assert.rejects(requireEarningsActor(new Request('http://localhost'), 'statement', authority()), { status: 401 });
  await assert.rejects(requireEarningsActor(tokenClaim(), 'statement', authority({ errorCode: 'platform_session_revoked' })), { status: 401 });
  await assert.rejects(requireEarningsActor(tokenClaim({ iss: 'https://securetoken.google.com/legacy' }), 'statement', authority()), { status: 401 });
  await assert.rejects(requireEarningsActor(tokenClaim({ client_id: 'delegated' }), 'statement', authority()), { status: 403 });
});

test('denies disabled profiles, cross-scope membership, and privilege forgery', async () => {
  await assert.rejects(requireEarningsActor(tokenClaim(), 'statement', authority({ errorCode: 'platform_access_denied' })), { status: 403 });
  await assert.rejects(requireEarningsActor(tokenClaim(), 'statement', authority({ ...driver, scopeId: sessionId })), { status: 403 });
  await assert.rejects(requireEarningsActor(tokenClaim({ user_metadata: { role: 'admin' } }), 'payment:write', authority()), { status: 403 });
});

test('lets an authorized manager operate payments while restricting rule publication', async () => {
  const actor = { ...driver, role: 'gestor', application: 'lunna' };
  assert.equal((await requireEarningsActor(tokenClaim(), 'payment:write', authority(actor))).role, 'gestor');
  await assert.rejects(requireEarningsActor(tokenClaim(), 'rule:publish', authority(actor)), { status: 403 });
});
