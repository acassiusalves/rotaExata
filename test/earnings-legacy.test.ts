import assert from 'node:assert/strict';
import { test } from 'node:test';
import { prepareLegacyBatch, brlToCents } from '../src/lib/server/earnings/legacy.ts';

const payment = {
  documentId: 'payment-a', sourceRevision: '001795000000.123456789',
  data: {
    routeId: 'r1', status: 'approved', totalEarnings: 1.005, driverId: 'historical',
    rulesVersion: 2, routeCompletedAt: { seconds: 1795000000, nanoseconds: 123456789 },
    breakdown: { deliveryBonuses: 1.005 },
  },
};
const snapshot = {
  sourceProject: 'demo-rotaexata-driver', sourceCutoff: '2026-11-18T18:30:13.973649Z',
  legacyRule: { version: 3 }, payments: [payment],
  routes: [{ documentId: 'r1', data: { driverId: 'new-owner', status: 'completed' } }, { documentId: 'r2', data: { status: 'completed_auto' } }],
};
test('converts decimal reais with commercial rounding without floating point drift', () => {
  assert.equal(brlToCents(1.005), 101);
  assert.equal(brlToCents('10.195'), 1020);
  assert.equal(brlToCents('1e-3'), 0);
  assert.equal(brlToCents('2.55e+2'), 25500);
  assert.equal(brlToCents(''), null);
});
test('preserves original values, IDs and timestamp precision and never adopts the current route owner', () => {
  const result = prepareLegacyBatch(snapshot);
  assert.equal(result.rows[0].sourceRevision,'001795000000.123456789');
  assert.equal(result.rows[0].driverUid,'historical');
  assert.equal(result.rows[0].status,'approved');
  assert.equal(result.rows[0].totalCents,101);
  assert.deepEqual(result.rows[0].original,payment.data);
  assert.equal(result.summary.completedAutoWithoutPayment,1);
  assert.equal(result.summary.completedAutoWithoutDate,1);
  assert.equal(result.rows.length,1);
});
test('retains unknown UID, orphan and duplicated route for private reconciliation', () => {
  const result = prepareLegacyBatch({ ...snapshot, payments: [
    { ...payment, data: { ...payment.data, driverId: undefined } },
    { ...payment, documentId: 'payment-b' },
    { ...payment, documentId: 'payment-c', data: { ...payment.data, routeId: 'unknown' } },
  ] });
  assert.equal(result.rows[0].driverUid,null);
  assert.ok(result.rows[0].reviewReasons.includes('driver_uid_missing'));
  assert.ok(result.rows[1].reviewReasons.includes('duplicate_route'));
  assert.ok(result.rows[2].reviewReasons.includes('orphan_route'));
});
