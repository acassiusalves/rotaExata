import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assessRoute, issueRouteEarnings } from '../src/lib/server/earnings/issuance.ts';
import { makeEnvelope } from '../functions/src/earnings-source-adapter.ts';

const facts = {
  status: 'completed', evidence: 'driver-server-v1', driverUid: 'legacy-driver',
  workedAt: '2026-11-18T14:30:00.000Z', distanceMeters: 12500,
  stops: [{ id: '1', status: 'completed' }],
};
const cutoff = '2026-11-18T09:00:00Z';

test('assesses the signed completion and holds unverifiable closures', () => {
  assert.equal(assessRoute(facts, cutoff, 'snapshot').kind, 'eligible');
  assert.deepEqual(assessRoute({ ...facts, evidence: null }, cutoff, 'snapshot'), { kind: 'review', reason: 'source_unproven' });
  assert.deepEqual(assessRoute({ ...facts, forced: true }, cutoff, 'snapshot'), { kind: 'review', reason: 'forced_closure' });
  assert.deepEqual(assessRoute({ ...facts, status: 'completed_auto', workedAt: null }, cutoff, 'snapshot'), { kind: 'ineligible', reason: 'abandoned' });
  assert.deepEqual(assessRoute(facts, '2026-11-19T09:00:00Z', 'snapshot'), { kind: 'ineligible', reason: 'before_cutover' });
  assert.deepEqual(assessRoute(facts, cutoff, 'deleted'), { kind: 'review', reason: 'source_deleted' });
});

test('issues only a quote from the rule pinned by the database to the work time', async () => {
  const event = makeEnvelope('demo-rotaexata-driver','r1',{seconds: 1795000000,nanoseconds: 1},'snapshot',{});
  const calls: Array<[string, Record<string, unknown>]> = [];
  const call = async (name: string, payload: Record<string, unknown>) => {
    calls.push([name,payload]);
    if (name === 'rota_earnings_claim_event') return {
      ...event, leaseId: 'lease', attempts: 1, issueFrom: cutoff, facts,
      rule: { id: 'v1', engineVersion: 1, definition: { mode: 'distance', baseCents: 2000, kilometerCents: 120, deliveryCents: 200, attemptCents: 100 } },
    };
    return { status: 'processed' };
  };
  assert.equal(await issueRouteEarnings('scope',call), 'processed');
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1].p_rule_id, 'v1');
  assert.equal((calls[1][1].p_quote as { totalCents: number }).totalCents, 3700);
});
