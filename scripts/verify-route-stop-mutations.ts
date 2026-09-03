import assert from 'node:assert/strict';
import type { PlaceValue } from '../src/lib/types';

type Ref = { collection: string; id: string };
type StoredDocument = Record<string, unknown>;
type Increment = { kind: 'increment'; amount: number };

class MemoryFirestore {
  readonly operations: string[] = [];
  private readonly documents = new Map<string, StoredDocument>();

  constructor(documents: Record<string, StoredDocument>) {
    Object.entries(documents).forEach(([key, value]) => {
      this.documents.set(key, structuredClone(value));
    });
  }

  ref(collection: string, id: string): Ref {
    return { collection, id };
  }

  data(ref: Ref): StoredDocument {
    const document = this.documents.get(`${ref.collection}/${ref.id}`);
    if (!document) throw new Error(`Documento ${ref.collection}/${ref.id} não encontrado.`);
    return structuredClone(document);
  }

  has(ref: Ref): boolean {
    return this.documents.has(`${ref.collection}/${ref.id}`);
  }

  async runTransaction<Result>(callback: (transaction: {
    get: (ref: Ref) => Promise<{ exists: () => boolean; data: () => StoredDocument }>;
    update: (ref: Ref, patch: StoredDocument) => void;
    set: (ref: Ref, data: StoredDocument) => void;
  }) => Promise<Result>): Promise<Result> {
    let hasWritten = false;
    const stagedDocuments = new Map<string, StoredDocument>();

    const result = await callback({
      get: async (ref) => {
        if (hasWritten) throw new Error('Leitura após escrita na transação.');
        this.operations.push(`read:${ref.collection}/${ref.id}`);
        const document = this.documents.get(`${ref.collection}/${ref.id}`);
        return {
          exists: () => Boolean(document),
          data: () => structuredClone(document || {}),
        };
      },
      update: (ref, patch) => {
        hasWritten = true;
        this.operations.push(`write:${ref.collection}/${ref.id}`);
        const key = `${ref.collection}/${ref.id}`;
        const current = stagedDocuments.get(key) ?? this.documents.get(key);
        if (!current) throw new Error(`Documento ${key} não encontrado.`);
        const next = { ...current };
        Object.entries(patch).forEach(([field, value]) => {
          const increment = value as Increment;
          next[field] = increment?.kind === 'increment'
            ? Number(next[field] || 0) + increment.amount
            : structuredClone(value);
        });
        stagedDocuments.set(key, next);
      },
      set: (ref, data) => {
        hasWritten = true;
        this.operations.push(`set:${ref.collection}/${ref.id}`);
        stagedDocuments.set(`${ref.collection}/${ref.id}`, structuredClone(data));
      },
    });

    stagedDocuments.forEach((document, key) => {
      this.documents.set(key, document);
    });
    return result;
  }
}

function stop(id: string, extra: Partial<PlaceValue> = {}): PlaceValue {
  return {
    id,
    placeId: `place-${id}`,
    address: `Rua ${id}, 10`,
    lat: -16.7,
    lng: -49.2,
    customerName: `Cliente ${id}`,
    ...extra,
  };
}

async function verifyGateway() {
process.env.NEXT_PUBLIC_FIREBASE_API_KEY = 'test-api-key';
process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN = 'test.invalid';
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = 'test-project';
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'test-project.appspot.com';
process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID = '123456789';
process.env.NEXT_PUBLIC_FIREBASE_APP_ID = '1:123456789:web:test';

const { createRouteStopMutationGateway, RouteStopNotFoundError } =
  await import('../src/lib/firebase/route-stop-mutations');
const gatewayFor = (store: MemoryFirestore) =>
  createRouteStopMutationGateway({
    db: store,
    doc: (database, collection, id) => (database as MemoryFirestore).ref(collection, id),
    runTransaction: (database, callback) =>
      (database as MemoryFirestore).runTransaction(async (transaction) =>
        callback({
          get: (reference: unknown) => transaction.get(reference as Ref),
          update: (reference: unknown, patch: StoredDocument) => transaction.update(reference as Ref, patch),
          set: (reference: unknown, data: StoredDocument) => transaction.set(reference as Ref, data),
        }),
      ),
    serverTimestamp: () => ({ kind: 'server-timestamp' }),
    now: () => new Date('2026-09-03T10:00:00Z'),
    increment: (amount) => ({ kind: 'increment', amount }),
  });

const routeOneStops = [stop('A'), stop('B')];
const routeTwoStops = [stop('C')];
const saveStore = new MemoryFirestore({
  'routes/r1': { driverId: 'driver-1', status: 'dispatched', stops: routeOneStops },
  'routes/r2': { driverId: 'driver-2', status: 'draft', stops: routeTwoStops },
});
const saveGateway = gatewayFor(saveStore);

await saveGateway.saveExistingRoutePlansAtomically([
  { routeId: 'r1', baseStops: routeOneStops, plannedStops: routeOneStops },
  { routeId: 'r2', baseStops: routeTwoStops, plannedStops: routeTwoStops },
]);
assert.deepEqual(saveStore.operations, [
  'read:routes/r1',
  'read:routes/r2',
  'write:routes/r1',
  'write:routes/r2',
]);

const rollbackStore = new MemoryFirestore({
  'routes/source': { status: 'draft', stops: [stop('rollback')] },
  'services/service-rollback': { routeIds: ['source'] },
});
await assert.rejects(
  () => rollbackStore.runTransaction(async (transaction) => {
    transaction.update(rollbackStore.ref('routes', 'source'), { status: 'dispatched' });
    transaction.set(rollbackStore.ref('routes', 'new-route'), {
      status: 'draft',
      stops: [stop('new')],
    });
    transaction.update(rollbackStore.ref('services', 'service-rollback'), {
      routeIds: ['source', 'new-route'],
    });
    throw new Error('falha injetada após escritas staged');
  }),
  /falha injetada após escritas staged/,
);
assert.equal(rollbackStore.data(rollbackStore.ref('routes', 'source')).status, 'draft');
assert.equal(rollbackStore.has(rollbackStore.ref('routes', 'new-route')), false);
assert.deepEqual(
  rollbackStore.data(rollbackStore.ref('services', 'service-rollback')).routeIds,
  ['source'],
);

const regressionFailures: string[] = [];

try {
  const staleMovedStop = stop('moved', { notes: 'Observação do planejador' });
  const latestMovedStop = stop('moved', {
    deliveryStatus: 'completed',
    completedAt: new Date('2026-09-03T11:30:00Z'),
    photoUrl: 'https://example.test/comprovante.jpg',
    notes: 'Entrega confirmada pelo motorista',
  });
  const moveStore = new MemoryFirestore({
    'routes/source': { status: 'in_progress', driverId: 'driver-1', stops: [latestMovedStop] },
    'routes/target': { status: 'dispatched', driverId: 'driver-2', stops: [] },
  });
  const [sourceResult] = await gatewayFor(moveStore).saveExistingRoutePlansAtomically([
    { routeId: 'source', baseStops: [staleMovedStop], plannedStops: [] },
    { routeId: 'target', baseStops: [], plannedStops: [staleMovedStop] },
  ]);
  const persistedTargetStop = (moveStore.data(moveStore.ref('routes', 'target')).stops as PlaceValue[])[0];
  assert.equal(persistedTargetStop.deliveryStatus, 'completed');
  assert.equal(persistedTargetStop.photoUrl, 'https://example.test/comprovante.jpg');
  assert.equal(persistedTargetStop.notes, 'Entrega confirmada pelo motorista');
  assert.equal(sourceResult.removedStops[0].deliveryStatus, 'completed');
  assert.equal(sourceResult.removedStops[0].photoUrl, 'https://example.test/comprovante.jpg');
  assert.equal(sourceResult.removedStops[0].notes, 'Entrega confirmada pelo motorista');
} catch (error) {
  regressionFailures.push(`movimento latest: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const metadataStore = new MemoryFirestore({
    'routes/draft': { status: 'draft', driverId: 'driver-old', stops: [stop('metadata')] },
  });
  const [metadataResult] = await gatewayFor(metadataStore).saveExistingRoutePlansAtomically([{
    routeId: 'draft',
    baseStops: [stop('metadata')],
    plannedStops: [stop('metadata', { customerName: 'Cliente atualizado' })],
    metadata: { status: 'dispatched', driverId: 'driver-new' },
  }]);
  const persistedMetadata = metadataStore.data(metadataStore.ref('routes', 'draft'));
  assert.equal(metadataResult.status, 'dispatched');
  assert.equal(metadataResult.driverId, 'driver-new');
  assert.equal(persistedMetadata.status, 'dispatched');
  assert.equal(persistedMetadata.driverId, 'driver-new');
} catch (error) {
  regressionFailures.push(`metadata atômica: ${error instanceof Error ? error.message : String(error)}`);
}

try {
  const latestForNewRoute = stop('A', {
    deliveryStatus: 'failed',
    failureReason: 'Cliente ausente',
    attemptPhotoUrl: 'https://example.test/tentativa.jpg',
  });
  const successfulBatchStore = new MemoryFirestore({
    'routes/source': { stops: [latestForNewRoute] },
    'services/service-1': { routeIds: ['source'] },
  });
  const successfulBatchResult = await gatewayFor(successfulBatchStore).saveRoutePlanBatchAtomically({
    existingPlans: [{
      routeId: 'source',
      baseStops: [stop('A')],
      plannedStops: [],
    }],
    newRoutes: [{
      routeId: 'new-route',
      data: { status: 'draft' },
      plannedStops: [stop('A')],
    }],
    serviceLink: { serviceId: 'service-1', routeIds: ['new-route'] },
  });
  const createdStop = (
    successfulBatchStore.data(successfulBatchStore.ref('routes', 'new-route')).stops as PlaceValue[]
  )[0];
  assert.equal(createdStop.deliveryStatus, 'failed');
  assert.equal(createdStop.failureReason, 'Cliente ausente');
  assert.equal(createdStop.attemptPhotoUrl, 'https://example.test/tentativa.jpg');
  assert.deepEqual(
    successfulBatchStore.data(successfulBatchStore.ref('services', 'service-1')).routeIds,
    ['source', 'new-route'],
  );
  assert.equal(successfulBatchResult.createdRoutes[0].stops[0].deliveryStatus, 'failed');
  assert.deepEqual(successfulBatchStore.operations, [
    'read:routes/source',
    'read:routes/new-route',
    'read:services/service-1',
    'write:routes/source',
    'set:routes/new-route',
    'write:services/service-1',
  ]);

  const batchStore = new MemoryFirestore({
    'routes/source': { stops: [stop('A'), stop('concurrent')] },
    'services/service-1': { routeIds: ['source'] },
  });
  let rejection: unknown;
  try {
    await gatewayFor(batchStore).saveRoutePlanBatchAtomically({
      existingPlans: [{
        routeId: 'source',
        baseStops: [stop('A')],
        plannedStops: [],
      }],
      newRoutes: [{
        routeId: 'new-route',
        data: { status: 'draft' },
        plannedStops: [stop('A')],
      }],
      serviceLink: { serviceId: 'service-1', routeIds: ['new-route'] },
    });
  } catch (error) {
    rejection = error;
  }
  assert.equal((rejection as { code?: string } | undefined)?.code, 'route-structure-conflict');
  assert.equal(batchStore.has(batchStore.ref('routes', 'new-route')), false);
  assert.deepEqual(batchStore.data(batchStore.ref('services', 'service-1')).routeIds, ['source']);
  assert.deepEqual(
    batchStore.operations.filter(operation => (
      operation.startsWith('write:') || operation.startsWith('set:')
    )),
    [],
  );
} catch (error) {
  regressionFailures.push(`batch atômico: ${error instanceof Error ? error.message : String(error)}`);
}

assert.deepEqual(regressionFailures, []);

const confirmationStore = new MemoryFirestore({
  'routes/r1': { driverId: 'driver-1', stops: routeOneStops },
  'users/driver-1': { totalDeliveries: 0 },
});
const confirmationGateway = gatewayFor(confirmationStore);

const firstConfirmation = await confirmationGateway.confirmRouteStopAtomically({
  routeId: 'r1',
  driverId: 'driver-1',
  targetStop: stop('B'),
  patch: { deliveryStatus: 'completed' },
});
assert.equal(firstConfirmation.transitionedToCompleted, true);
assert.equal(confirmationStore.data(confirmationStore.ref('users', 'driver-1')).totalDeliveries, 1);

confirmationStore.operations.splice(0);
const completedEdit = await confirmationGateway.confirmRouteStopAtomically({
  routeId: 'r1',
  driverId: 'driver-1',
  targetStop: stop('B'),
  patch: { deliveryStatus: 'completed', notes: 'Corrigida' },
});
assert.equal(completedEdit.transitionedToCompleted, false);
assert.equal(confirmationStore.data(confirmationStore.ref('users', 'driver-1')).totalDeliveries, 1);
assert.deepEqual(confirmationStore.operations, [
  'read:routes/r1',
  'write:routes/r1',
]);

const missingStopStore = new MemoryFirestore({
  'routes/r1': { driverId: 'driver-1', stops: routeOneStops },
  'users/driver-1': { totalDeliveries: 0 },
});
await assert.rejects(
  () => gatewayFor(missingStopStore).confirmRouteStopAtomically({
    routeId: 'r1',
    driverId: 'driver-1',
    targetStop: stop('missing'),
    patch: { deliveryStatus: 'completed' },
  }),
  RouteStopNotFoundError,
);
assert.deepEqual(missingStopStore.operations, ['read:routes/r1']);

const acknowledgementStore = new MemoryFirestore({
  'routes/r1': {
    stops: [stop('A', {
      wasModified: true,
      modifiedAt: new Date('2026-09-03T10:00:00Z'),
      modificationType: 'data',
    })],
    pendingChanges: true,
  },
  'routeChangeNotifications/r1': { acknowledged: false },
});
await gatewayFor(acknowledgementStore).acknowledgeRouteChangesAtomically('r1');
const acknowledgedRoute = acknowledgementStore.data(acknowledgementStore.ref('routes', 'r1'));
assert.equal((acknowledgedRoute.stops as PlaceValue[])[0].wasModified, false);
assert.equal((acknowledgedRoute.stops as PlaceValue[])[0].modifiedAt, undefined);
assert.equal(acknowledgedRoute.pendingChanges, false);
assert.equal(
  acknowledgementStore.data(acknowledgementStore.ref('routeChangeNotifications', 'r1')).acknowledged,
  true,
);
assert.deepEqual(acknowledgementStore.operations, [
  'read:routes/r1',
  'read:routeChangeNotifications/r1',
  'write:routes/r1',
  'write:routeChangeNotifications/r1',
]);

console.log('OK: gateway transacional preserva as garantias centrais.');
}

void verifyGateway();
