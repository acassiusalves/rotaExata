import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currentCompetence, displayCents, periodQuery, earningsStatusLabel } from '../src/lib/driver-statement.ts';

test('uses the work competence in São Paulo at the UTC month boundary', () => {
  assert.equal(currentCompetence(new Date('2026-12-01T02:59:00Z')),'2026-11');
  assert.equal(currentCompetence(new Date('2026-12-01T03:00:00Z')),'2026-12');
});
test('treats pending as a conferir and formats exact cents and negative adjustments', () => {
  assert.equal(earningsStatusLabel.pending,'A conferir');
  assert.match(displayCents('9007199254740999'),/90\.071\.992\.547\.409,99/);
  assert.match(displayCents(-50),/-.*0,50/);
});
test('pagination only sends period, status and cursor without a driver id', () => {
  const params = new URLSearchParams(periodQuery('2026-11','pending',{ workedAt: '2026-11-18T15:00:00+00:00', id: 'abc' }));
  assert.deepEqual(Object.fromEntries(params),{month:'2026-11',status:'pending',after:'2026-11-18T15:00:00+00:00',afterId:'abc'});
});
