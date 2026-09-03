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

  async runTransaction<Result>(callback: (transaction: {
    get: (ref: Ref) => Promise<{ exists: () => boolean; data: () => StoredDocument }>;
    update: (ref: Ref, patch: StoredDocument) => void;
  }) => Promise<Result>): Promise<Result> {
    let hasWritten = false;

    return callback({
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
        const current = this.documents.get(key);
        if (!current) throw new Error(`Documento ${key} não encontrado.`);
        const next = { ...current };
        Object.entries(patch).forEach(([field, value]) => {
          const increment = value as Increment;
          next[field] = increment?.kind === 'increment'
            ? Number(next[field] || 0) + increment.amount
            : structuredClone(value);
        });
        this.documents.set(key, next);
      },
    });
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
          get: (reference) => transaction.get(reference as Ref),
          update: (reference, patch) => transaction.update(reference as Ref, patch),
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
