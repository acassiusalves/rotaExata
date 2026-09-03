import assert from 'node:assert/strict';
import type { PlaceValue } from '../src/lib/types';
import {
  RouteStopNotFoundError,
  RouteStructureConflictError,
  clearRouteChangeFlags,
  rebasePlannedStops,
  updateStopByIdentity,
} from '../src/lib/route-stop-reconciliation';

const stop = (id: string, extra: Partial<PlaceValue> = {}): PlaceValue => ({
  id,
  placeId: `place-${id}`,
  address: `Rua ${id}, 10`,
  lat: -16.7,
  lng: -49.2,
  customerName: `Cliente ${id}`,
  ...extra,
});

const base = [stop('A'), stop('B'), stop('C')];
const latest = [
  stop('A', {
    deliveryStatus: 'completed',
    completedAt: new Date('2026-09-03T10:00:00Z'),
    payments: [{ id: 'pix-1', method: 'pix', value: 120 }],
    photoUrl: 'https://example.test/a.jpg',
    notes: 'Recebido por Maria',
  }),
  stop('B'),
  stop('C', {
    deliveryStatus: 'failed',
    failureReason: 'Cliente ausente',
    wentToLocation: true,
    attemptPhotoUrl: 'https://example.test/c.jpg',
  }),
];

const removeB = rebasePlannedStops({
  baseStops: base,
  plannedStops: [base[0], base[2]],
  latestStops: latest,
});

assert.deepEqual(removeB.map((item) => item.id), ['A', 'C']);
assert.equal(removeB[0].deliveryStatus, 'completed');
assert.deepEqual(removeB[0].payments, [{ id: 'pix-1', method: 'pix', value: 120 }]);
assert.equal(removeB[0].photoUrl, 'https://example.test/a.jpg');
assert.equal(removeB[0].notes, 'Recebido por Maria');
assert.equal(removeB[1].deliveryStatus, 'failed');
assert.equal(removeB[1].failureReason, 'Cliente ausente');

const reordered = rebasePlannedStops({
  baseStops: base,
  plannedStops: [base[2], base[0], base[1]],
  latestStops: latest,
});
assert.deepEqual(reordered.map((item) => item.id), ['C', 'A', 'B']);
assert.equal(reordered[0].attemptPhotoUrl, 'https://example.test/c.jpg');
assert.equal(reordered[1].deliveryStatus, 'completed');

assert.throws(
  () => rebasePlannedStops({
    baseStops: base,
    plannedStops: [base[0], base[2]],
    latestStops: [...latest, stop('D')],
  }),
  RouteStructureConflictError,
);

const byOrder = updateStopByIdentity(
  [stop('legacy-id', { orderNumber: 'P-100' })],
  { orderNumber: 'p-100' },
  { deliveryStatus: 'completed' },
);
assert.equal(byOrder.updatedStop.deliveryStatus, 'completed');
assert.equal(byOrder.index, 0);

assert.throws(
  () => updateStopByIdentity(latest, stop('removida'), { deliveryStatus: 'completed' }),
  RouteStopNotFoundError,
);

const clean = clearRouteChangeFlags([
  stop('A', {
    wasModified: true,
    modifiedAt: new Date('2026-09-03T10:10:00Z'),
    modificationType: 'sequence',
    originalSequence: 2,
    deliveryStatus: 'completed',
  }),
]);
assert.equal(clean[0].wasModified, false);
assert.equal(clean[0].modifiedAt, undefined);
assert.equal(clean[0].modificationType, undefined);
assert.equal(clean[0].originalSequence, undefined);
assert.equal(clean[0].deliveryStatus, 'completed');

console.log('OK: reconciliação preserva execução e rejeita conflitos estruturais.');
