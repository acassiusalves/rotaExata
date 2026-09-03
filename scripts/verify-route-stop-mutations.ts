import assert from 'node:assert/strict';
import type { PlaceValue } from '../src/lib/types';

type Ref = { collection: string; id: string };
type StoredDocument = Record<string, unknown>;
type Increment = { kind: 'increment'; amount: number };

function assertNoRecursiveUndefined(value: unknown, path = 'documento'): void {
  if (value === undefined) {
    throw new Error(`Firestore não aceita undefined em ${path}.`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRecursiveUndefined(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => (
      assertNoRecursiveUndefined(item, `${path}.${key}`)
    ));
  }
}

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
        assertNoRecursiveUndefined(patch);
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
        assertNoRecursiveUndefined(data);
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

const mutationModule = await import('../src/lib/firebase/route-stop-mutations');
const {
  createRouteStopMutationGateway,
  getRouteChangeNotificationFingerprint,
  RouteStopNotFoundError,
} = mutationModule;
const resolveRoutePlanMetrics = (
  mutationModule as unknown as {
    resolveRoutePlanMetrics?: (
      plannedStops: PlaceValue[],
      computed?: { encodedPolyline: string; distanceMeters: number; duration: string } | null,
    ) => { encodedPolyline: string; distanceMeters: number; duration: string } | undefined;
  }
).resolveRoutePlanMetrics;
assert.equal(typeof resolveRoutePlanMetrics, 'function');
assert.deepEqual(resolveRoutePlanMetrics!([], null), {
  encodedPolyline: '',
  distanceMeters: 0,
  duration: '0s',
});
assert.deepEqual(
  resolveRoutePlanMetrics!([], {
    encodedPolyline: 'stale-polyline',
    distanceMeters: 999,
    duration: '999s',
  }),
  {
    encodedPolyline: '',
    distanceMeters: 0,
    duration: '0s',
  },
  'rota vazia deve zerar métricas mesmo se o cálculo retornou dados obsoletos',
);
assert.equal(resolveRoutePlanMetrics!([stop('not-empty')], null), undefined);
const notifySavedRoutePlansAndCount = (
  mutationModule as unknown as {
    notifySavedRoutePlansAndCount?: (
      results: Array<{
        routeId: string;
        changes: unknown[];
        driverId?: string;
        status: string;
      }>,
      notify: (result: { routeId: string }) => Promise<void>,
      onError?: (result: { routeId: string }, error: unknown) => void,
    ) => Promise<number>;
  }
).notifySavedRoutePlansAndCount;
assert.equal(typeof notifySavedRoutePlansAndCount, 'function');
const notificationErrors: string[] = [];
const notifiedCount = await notifySavedRoutePlansAndCount!(
  [
    { routeId: 'success', changes: [{}], driverId: 'driver-1', status: 'dispatched' },
    { routeId: 'failure', changes: [{}], driverId: 'driver-2', status: 'in_progress' },
    { routeId: 'not-eligible', changes: [], driverId: 'driver-3', status: 'dispatched' },
  ],
  async (result) => {
    if (result.routeId === 'failure') throw new Error('notification failed');
  },
  (result: { routeId: string }) => notificationErrors.push(result.routeId),
);
assert.equal(notifiedCount, 1);
assert.deepEqual(notificationErrors, ['failure']);
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

const undefinedRejectingStore = new MemoryFirestore({});
await assert.rejects(
  () => undefinedRejectingStore.runTransaction(async (transaction) => {
    transaction.set(undefinedRejectingStore.ref('routes', 'invalid'), {
      nested: { invalid: undefined },
    });
  }),
  /Firestore não aceita undefined/,
);
assert.equal(undefinedRejectingStore.has(undefinedRejectingStore.ref('routes', 'invalid')), false);

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
  const moveResult = await gatewayFor(moveStore).saveRoutePlanBatchAtomically({
    existingPlans: [
      { routeId: 'source', baseStops: [staleMovedStop], plannedStops: [] },
      { routeId: 'target', baseStops: [], plannedStops: [staleMovedStop] },
    ],
    transferIntents: [{
      sourceRouteId: 'source',
      targetRouteId: 'target',
      stopKey: 'id:moved',
    }],
  } as Parameters<ReturnType<typeof gatewayFor>['saveRoutePlanBatchAtomically']>[0]);
  const [sourceResult] = moveResult.existingRoutes;
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
  assert.equal(metadataResult.previousStatus, 'draft');
  assert.equal(metadataResult.previousDriverId, 'driver-old');
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
    transferIntents: [{
      sourceRouteId: 'source',
      targetRouteId: 'new-route',
      stopKey: 'id:a',
    }],
    serviceLink: { serviceId: 'service-1', routeIds: ['new-route'] },
  } as Parameters<ReturnType<typeof gatewayFor>['saveRoutePlanBatchAtomically']>[0]);
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
      transferIntents: [{
        sourceRouteId: 'source',
        targetRouteId: 'new-route',
        stopKey: 'id:a',
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

const independentAdditionStore = new MemoryFirestore({
  'routes/source-independent': {
    stops: [stop('same-key', {
      deliveryStatus: 'completed',
      payments: [{ id: 'source-payment', method: 'pix', value: 99 }],
    })],
  },
  'routes/target-independent': { stops: [] },
});
await gatewayFor(independentAdditionStore).saveRoutePlanBatchAtomically({
  existingPlans: [
    {
      routeId: 'source-independent',
      baseStops: [stop('same-key')],
      plannedStops: [],
    },
    {
      routeId: 'target-independent',
      baseStops: [],
      plannedStops: [stop('same-key', { customerName: 'Adição independente' })],
    },
  ],
});
const independentPersisted = (
  independentAdditionStore.data(independentAdditionStore.ref('routes', 'target-independent'))
    .stops as PlaceValue[]
)[0];
assert.equal(independentPersisted.deliveryStatus, undefined);
assert.equal(independentPersisted.payments, undefined);

const renamedStore = new MemoryFirestore({
  'routes/renamed': {
    stops: [stop('rename-id', {
      orderNumber: 'ORDER-OLD',
      deliveryStatus: 'completed',
      photoUrl: 'https://example.test/latest.jpg',
    })],
  },
});
const [renamedResult] = await gatewayFor(renamedStore).saveExistingRoutePlansAtomically([{
  routeId: 'renamed',
  baseStops: [stop('rename-id', { orderNumber: 'ORDER-OLD' })],
  plannedStops: [{
    ...stop('rename-id', { orderNumber: 'ORDER-NEW' }),
    _originalStopKey: 'order:order-old',
  }],
}]);
assert.equal(renamedResult.stops[0].deliveryStatus, 'completed');
assert.equal(renamedResult.stops[0].photoUrl, 'https://example.test/latest.jpg');
assert.deepEqual(renamedResult.removedStops, []);
assert.equal('_originalStopKey' in renamedResult.stops[0], false);
assert.equal(
  '_originalStopKey' in (
    renamedStore.data(renamedStore.ref('routes', 'renamed')).stops as PlaceValue[]
  )[0],
  false,
);

const invalidTransferInputs = [
  {
    label: 'one-to-many',
    input: {
      existingPlans: [
        { routeId: 'source', baseStops: [stop('A')], plannedStops: [] },
        { routeId: 'target-1', baseStops: [], plannedStops: [stop('A')] },
        { routeId: 'target-2', baseStops: [], plannedStops: [stop('A')] },
      ],
      transferIntents: [
        { sourceRouteId: 'source', targetRouteId: 'target-1', stopKey: 'id:a' },
        { sourceRouteId: 'source', targetRouteId: 'target-2', stopKey: 'id:a' },
      ],
    },
  },
  {
    label: 'duplicate intent',
    input: {
      existingPlans: [
        { routeId: 'source', baseStops: [stop('A')], plannedStops: [] },
        { routeId: 'target-1', baseStops: [], plannedStops: [stop('A')] },
      ],
      transferIntents: [
        { sourceRouteId: 'source', targetRouteId: 'target-1', stopKey: 'id:a' },
        { sourceRouteId: 'source', targetRouteId: 'target-1', stopKey: 'id:a' },
      ],
    },
  },
  {
    label: 'missing source',
    input: {
      existingPlans: [{ routeId: 'target-1', baseStops: [], plannedStops: [stop('A')] }],
      transferIntents: [
        { sourceRouteId: 'missing-source', targetRouteId: 'target-1', stopKey: 'id:a' },
      ],
    },
  },
  {
    label: 'missing destination',
    input: {
      existingPlans: [{ routeId: 'source', baseStops: [stop('A')], plannedStops: [] }],
      transferIntents: [
        { sourceRouteId: 'source', targetRouteId: 'missing-target', stopKey: 'id:a' },
      ],
    },
  },
  {
    label: 'source route present without matching removal',
    input: {
      existingPlans: [
        { routeId: 'source', baseStops: [stop('A')], plannedStops: [stop('A')] },
        { routeId: 'target-1', baseStops: [], plannedStops: [stop('A')] },
      ],
      transferIntents: [
        { sourceRouteId: 'source', targetRouteId: 'target-1', stopKey: 'id:a' },
      ],
    },
  },
  {
    label: 'destination route present without matching addition',
    input: {
      existingPlans: [
        { routeId: 'source', baseStops: [stop('A')], plannedStops: [] },
        { routeId: 'target-1', baseStops: [], plannedStops: [] },
      ],
      transferIntents: [
        { sourceRouteId: 'source', targetRouteId: 'target-1', stopKey: 'id:a' },
      ],
    },
  },
] as const;

for (const invalid of invalidTransferInputs) {
  const documents = Object.fromEntries(
    invalid.input.existingPlans.map((plan) => [
      `routes/${plan.routeId}`,
      { stops: plan.baseStops },
    ]),
  );
  const store = new MemoryFirestore(documents);
  await assert.rejects(
    () => gatewayFor(store).saveRoutePlanBatchAtomically(
      invalid.input as unknown as Parameters<ReturnType<typeof gatewayFor>['saveRoutePlanBatchAtomically']>[0],
    ),
    (error: unknown) => (
      (error as { code?: string }).code === 'route-structure-conflict'
    ),
    invalid.label,
  );
  assert.deepEqual(
    store.operations.filter((operation) => (
      operation.startsWith('write:') || operation.startsWith('set:')
    )),
    [],
    `${invalid.label}: falha antes de escrever`,
  );
}

const invalidPlanInputs = [
  {
    label: 'duplicate route id',
    input: {
      existingPlans: [
        { routeId: 'duplicate-route', baseStops: [stop('A')], plannedStops: [stop('A')] },
        { routeId: 'duplicate-route', baseStops: [stop('B')], plannedStops: [stop('B')] },
      ],
    },
  },
  {
    label: 'blank route id',
    input: {
      existingPlans: [{ routeId: ' ', baseStops: [stop('A')], plannedStops: [stop('A')] }],
    },
  },
  {
    label: 'duplicate planned identity',
    input: {
      existingPlans: [{
        routeId: 'planned-duplicate',
        baseStops: [stop('A')],
        plannedStops: [stop('B'), stop('B')],
      }],
    },
  },
  {
    label: 'missing planned identity',
    input: {
      existingPlans: [{
        routeId: 'planned-missing',
        baseStops: [stop('A')],
        plannedStops: [{ id: '', placeId: '', address: '' } as PlaceValue],
      }],
    },
  },
  {
    label: 'duplicate new-route identity',
    input: {
      existingPlans: [],
      newRoutes: [{
        routeId: 'new-duplicate',
        data: { status: 'draft' },
        plannedStops: [stop('B'), stop('B')],
      }],
    },
  },
  {
    label: 'missing new-route identity',
    input: {
      existingPlans: [],
      newRoutes: [{
        routeId: 'new-missing',
        data: { status: 'draft' },
        plannedStops: [{ id: '', placeId: '', address: '' } as PlaceValue],
      }],
    },
  },
] as const;

for (const invalid of invalidPlanInputs) {
  const store = new MemoryFirestore({});
  await assert.rejects(
    () => gatewayFor(store).saveRoutePlanBatchAtomically(
      invalid.input as unknown as Parameters<ReturnType<typeof gatewayFor>['saveRoutePlanBatchAtomically']>[0],
    ),
    (error: unknown) => (
      (error as { code?: string }).code === 'route-structure-conflict'
    ),
    invalid.label,
  );
  assert.deepEqual(store.operations, [], `${invalid.label}: valida antes de ler/escrever`);
}

const sanitizedStore = new MemoryFirestore({
  'routes/sanitized-existing': {
    status: 'dispatched',
    driverId: 'driver-existing',
    stops: [stop('sanitized-existing')],
  },
});
const sanitizedResult = await gatewayFor(sanitizedStore).saveRoutePlanBatchAtomically({
  existingPlans: [{
    routeId: 'sanitized-existing',
    baseStops: [stop('sanitized-existing')],
    plannedStops: [stop('sanitized-existing', { notes: undefined })],
    metadata: {
      serviceCode: undefined,
      driverId: undefined,
      explicitNull: null,
      nested: { omitted: undefined, kept: 'value' },
    },
  }],
  newRoutes: [{
    routeId: 'sanitized-new',
    data: {
      status: 'draft',
      serviceCode: undefined,
      explicitNull: null,
      nested: { omitted: undefined, kept: 'value' },
    },
    plannedStops: [stop('sanitized-new', { notes: undefined })],
  }],
});
assert.equal(
  sanitizedResult.existingRoutes[0].driverId,
  'driver-existing',
  'metadata undefined omitida não pode divergir o resultado do documento confirmado',
);
for (const routeId of ['sanitized-existing', 'sanitized-new']) {
  const persisted = sanitizedStore.data(sanitizedStore.ref('routes', routeId));
  assert.equal(Object.prototype.hasOwnProperty.call(persisted, 'serviceCode'), false);
  assert.equal(persisted.explicitNull, null);
  assert.deepEqual(persisted.nested, { kept: 'value' });
  assert.equal(
    Object.prototype.hasOwnProperty.call((persisted.stops as PlaceValue[])[0], 'notes'),
    false,
  );
}

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

const arrivedStore = new MemoryFirestore({
  'routes/arrived-route': {
    driverId: 'driver-1',
    stops: [stop('arrived', { deliveryStatus: 'arrived' })],
  },
  'users/driver-1': { totalDeliveries: 0 },
});
const arrivedCompletion = await gatewayFor(arrivedStore).confirmRouteStopAtomically({
  routeId: 'arrived-route',
  driverId: 'driver-1',
  targetStop: stop('arrived'),
  patch: { deliveryStatus: 'completed' },
});
assert.equal(arrivedCompletion.wasPreviouslyFinalized, false);
assert.equal(arrivedCompletion.transitionedToCompleted, true);
assert.equal(arrivedStore.data(arrivedStore.ref('users', 'driver-1')).totalDeliveries, 1);

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

for (const latestStops of [
  [stop('duplicate-confirm'), stop('duplicate-confirm')],
  [{ id: '', placeId: '', address: '' } as PlaceValue],
]) {
  const invalidLatestStore = new MemoryFirestore({
    'routes/invalid-latest': { driverId: 'driver-1', stops: latestStops },
    'users/driver-1': { totalDeliveries: 0 },
  });
  await assert.rejects(
    () => gatewayFor(invalidLatestStore).confirmRouteStopAtomically({
      routeId: 'invalid-latest',
      driverId: 'driver-1',
      targetStop: latestStops[0],
      patch: { deliveryStatus: 'completed' },
    }),
    (error: unknown) => (error as { code?: string }).code === 'route-structure-conflict',
  );
  assert.deepEqual(invalidLatestStore.operations, ['read:routes/invalid-latest']);
}

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

const causalAcknowledgementStore = new MemoryFirestore({
  'routes/causal': {
    stops: [stop('A', { wasModified: true })],
    pendingChanges: true,
  },
  'routeChangeNotifications/causal': {
    routeId: 'causal',
    driverId: 'driver-1',
    changes: [{ stopId: 'A', stopIndex: 0, changeType: 'data' }],
    createdAt: 'newer-notification',
    acknowledged: false,
  },
});
const currentCausalNotification = causalAcknowledgementStore.data(
  causalAcknowledgementStore.ref('routeChangeNotifications', 'causal'),
) as unknown as Parameters<typeof getRouteChangeNotificationFingerprint>[0];
const causalAcknowledge = gatewayFor(causalAcknowledgementStore)
  .acknowledgeRouteChangesAtomically as unknown as (
    routeId: string,
    expectedFingerprint: string,
  ) => Promise<void>;
await assert.rejects(
  () => causalAcknowledge('causal', 'obsolete-notification'),
  (error: unknown) => (
    (error as { code?: string }).code === 'route-notification-conflict'
  ),
);
assert.deepEqual(causalAcknowledgementStore.operations, [
  'read:routes/causal',
  'read:routeChangeNotifications/causal',
]);
assert.equal(
  causalAcknowledgementStore
    .data(causalAcknowledgementStore.ref('routeChangeNotifications', 'causal'))
    .acknowledged,
  false,
);

causalAcknowledgementStore.operations.splice(0);
await gatewayFor(causalAcknowledgementStore).acknowledgeRouteChangesAtomically(
  'causal',
  getRouteChangeNotificationFingerprint(currentCausalNotification),
);
assert.equal(
  causalAcknowledgementStore
    .data(causalAcknowledgementStore.ref('routeChangeNotifications', 'causal'))
    .acknowledged,
  true,
);

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
