import assert from 'node:assert/strict';
import type { PlaceValue } from '../src/lib/types';
import { getStopIdentityKey } from '../src/lib/route-stop-utils';
import * as reconciliationModule from '../src/lib/route-stop-reconciliation';
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

const findSingleStopByIdentity = (
  reconciliationModule as unknown as {
    findSingleStopByIdentity?: (
      stops: PlaceValue[],
      target: Partial<PlaceValue>,
    ) => PlaceValue;
  }
).findSingleStopByIdentity;
assert.equal(typeof findSingleStopByIdentity, 'function');
const latestRemoved = stop('removed-latest', {
  deliveryStatus: 'completed',
  photoUrl: 'https://example.test/latest-removal.jpg',
});
assert.equal(
  findSingleStopByIdentity!([latestRemoved], stop('removed-latest')),
  latestRemoved,
  'remoção deve selecionar a versão mais recente pela identidade original',
);
assert.throws(
  () => findSingleStopByIdentity!([], stop('removed-latest')),
  RouteStructureConflictError,
);
assert.throws(
  () => findSingleStopByIdentity!(
    [stop('removed-latest'), stop('removed-latest')],
    stop('removed-latest'),
  ),
  RouteStructureConflictError,
);

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

const pendingNotes = rebasePlannedStops({
  baseStops: [stop('P')],
  plannedStops: [stop('P', { notes: 'Nota administrativa' })],
  latestStops: [stop('P', { deliveryStatus: 'pending', notes: 'Nota atual' })],
});
assert.equal(pendingNotes[0].notes, 'Nota administrativa');

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

const reorderedBeforeConfirmation = [stop('B'), stop('A')];
const confirmation = updateStopByIdentity(
  reorderedBeforeConfirmation,
  stop('A'),
  { deliveryStatus: 'completed', payments: [{ id: 'cash-1', method: 'dinheiro', value: 50 }] },
);
assert.equal(confirmation.index, 1);
assert.equal(confirmation.stops[0].id, 'B');
assert.equal(confirmation.stops[0].deliveryStatus, undefined);
assert.equal(confirmation.stops[1].id, 'A');
assert.equal(confirmation.stops[1].deliveryStatus, 'completed');

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

const firstCompletion = updateStopByIdentity(
  [stop('A')],
  stop('A'),
  { deliveryStatus: 'completed' },
);
assert.equal(firstCompletion.previousStop.deliveryStatus, undefined);
assert.equal(firstCompletion.updatedStop.deliveryStatus, 'completed');

const completedEdit = updateStopByIdentity(
  [stop('A', { deliveryStatus: 'completed' })],
  stop('A'),
  { deliveryStatus: 'completed', notes: 'Corrigida' },
);
assert.equal(completedEdit.previousStop.deliveryStatus, 'completed');
assert.equal(completedEdit.updatedStop.deliveryStatus, 'completed');

// Regression: an administrative edit may change whichever field currently
// wins the identity precedence. The non-persisted lineage must still locate
// the latest stop and must never leak into the persisted/result object.
const identityRenameCases: Array<{
  label: string;
  base: PlaceValue;
  planned: PlaceValue;
}> = [
  {
    label: 'orderNumber',
    base: stop('order-id', { orderNumber: 'ORDER-OLD', pointCode: 'POINT-1' }),
    planned: stop('order-id', { orderNumber: 'ORDER-NEW', pointCode: 'POINT-1' }),
  },
  {
    label: 'pointCode fallback',
    base: stop('point-id', { pointCode: 'POINT-OLD' }),
    planned: stop('point-id', { pointCode: 'POINT-NEW' }),
  },
  {
    label: 'id fallback',
    base: stop('id-old'),
    planned: stop('id-new', { placeId: 'place-id-old' }),
  },
  {
    label: 'placeId fallback',
    base: { ...stop('', { placeId: 'place-old' }), id: '' },
    planned: { ...stop('', { placeId: 'place-new' }), id: '' },
  },
  {
    label: 'coordinates and address fallback',
    base: { ...stop('', { placeId: '' }), id: '', address: 'Rua antiga', lat: -16.7, lng: -49.2 },
    planned: { ...stop('', { placeId: '' }), id: '', address: 'Rua nova', lat: -16.8, lng: -49.3 },
  },
  {
    label: 'address fallback',
    base: { id: '', placeId: '', address: 'Rua antiga', customerName: 'Cliente' } as PlaceValue,
    planned: { id: '', placeId: '', address: 'Rua nova', customerName: 'Cliente' } as PlaceValue,
  },
];

for (const identityCase of identityRenameCases) {
  const originalKey = getStopIdentityKey(identityCase.base);
  assert.ok(originalKey, `${identityCase.label}: fixture precisa de identidade`);
  const latestStop = {
    ...identityCase.base,
    deliveryStatus: 'completed' as const,
    completedAt: new Date('2026-09-03T12:00:00Z'),
    payments: [{ id: 'latest', method: 'pix', value: 42 }],
    notes: `latest-${identityCase.label}`,
  };
  const plannedWithLineage = {
    ...identityCase.planned,
    _originalStopKey: originalKey,
    deliveryStatus: 'pending' as const,
    notes: `stale-${identityCase.label}`,
  } as PlaceValue & { _originalStopKey: string };
  const [renamed] = rebasePlannedStops({
    baseStops: [identityCase.base],
    plannedStops: [plannedWithLineage],
    latestStops: [latestStop],
  });
  assert.equal(renamed.deliveryStatus, 'completed', `${identityCase.label}: status mais recente`);
  assert.deepEqual(renamed.payments, [{ id: 'latest', method: 'pix', value: 42 }]);
  assert.equal(renamed.notes, `latest-${identityCase.label}`);
  assert.equal(getStopIdentityKey(renamed), getStopIdentityKey(identityCase.planned));
  assert.equal('_originalStopKey' in renamed, false, `${identityCase.label}: lineage não persiste`);
}

const renameCollisionBase = [
  stop('collision-a', { orderNumber: 'ORDER-A' }),
  stop('collision-b', { orderNumber: 'ORDER-B' }),
];
assert.throws(
  () => rebasePlannedStops({
    baseStops: renameCollisionBase,
    plannedStops: [
      {
        ...renameCollisionBase[0],
        orderNumber: 'ORDER-B',
        _originalStopKey: getStopIdentityKey(renameCollisionBase[0]),
      } as PlaceValue,
      renameCollisionBase[1],
    ],
    latestStops: renameCollisionBase,
  }),
  RouteStructureConflictError,
);

for (const deliveryStatus of ['completed', 'failed'] as const) {
  const terminalWithoutNotes = rebasePlannedStops({
    baseStops: [stop(`terminal-absent-${deliveryStatus}`)],
    plannedStops: [stop(`terminal-absent-${deliveryStatus}`, { notes: 'nota antiga' })],
    latestStops: [stop(`terminal-absent-${deliveryStatus}`, { deliveryStatus })],
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(terminalWithoutNotes[0], 'notes'),
    false,
    `${deliveryStatus}: ausência mais recente remove nota obsoleta`,
  );

  const terminalWithNull = rebasePlannedStops({
    baseStops: [stop(`terminal-null-${deliveryStatus}`)],
    plannedStops: [stop(`terminal-null-${deliveryStatus}`, { notes: 'nota antiga' })],
    latestStops: [{
      ...stop(`terminal-null-${deliveryStatus}`),
      deliveryStatus,
      notes: null,
    } as unknown as PlaceValue],
  });
  assert.equal(terminalWithNull[0].notes, null, `${deliveryStatus}: null explícito é preservado`);
}

assert.throws(
  () => rebasePlannedStops({
    baseStops: [stop('unique-base')],
    plannedStops: [stop('duplicate-plan'), stop('duplicate-plan')],
    latestStops: [stop('unique-base')],
  }),
  RouteStructureConflictError,
);
assert.throws(
  () => updateStopByIdentity(
    [stop('duplicate-latest'), stop('duplicate-latest')],
    stop('duplicate-latest'),
    { deliveryStatus: 'completed' },
  ),
  RouteStructureConflictError,
);
assert.throws(
  () => updateStopByIdentity(
    [{ id: '', placeId: '', address: '' } as PlaceValue],
    { address: 'sem-identidade' },
    { deliveryStatus: 'completed' },
  ),
  RouteStructureConflictError,
);

console.log('OK: reconciliação preserva execução e rejeita conflitos estruturais.');
