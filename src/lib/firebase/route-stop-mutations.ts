import {
  doc as firebaseDoc,
  increment as firebaseIncrement,
  runTransaction as firebaseRunTransaction,
  serverTimestamp as firebaseServerTimestamp,
  Timestamp,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { PlaceValue } from '@/lib/types';
import { detectRouteChanges, markModifiedStops, type RouteChange } from '@/lib/route-change-tracker';
import {
  clearRouteChangeFlags,
  rebasePlannedStops,
  RouteStopNotFoundError,
  updateStopByIdentity,
} from '@/lib/route-stop-reconciliation';

export type RouteMetrics = {
  encodedPolyline: string;
  distanceMeters: number;
  duration: string;
};

export type ExistingRoutePlan = {
  routeId: string;
  baseStops: PlaceValue[];
  plannedStops: PlaceValue[];
  metrics?: RouteMetrics;
};

export type SavedRoutePlan = {
  routeId: string;
  stops: PlaceValue[];
  changes: RouteChange[];
  status: string;
  driverId?: string;
};

export type RouteStopMutationSnapshot = {
  exists: () => boolean;
  data: () => Record<string, unknown>;
};

export type RouteStopMutationTransaction = {
  get: (reference: unknown) => Promise<RouteStopMutationSnapshot>;
  update: (reference: unknown, data: Record<string, unknown>) => void;
};

export type RouteStopMutationDependencies = {
  db: unknown;
  doc: (database: unknown, collection: string, id: string) => unknown;
  runTransaction: <Result>(
    database: unknown,
    updateFunction: (transaction: RouteStopMutationTransaction) => Promise<Result>,
  ) => Promise<Result>;
  serverTimestamp: () => unknown;
  now: () => unknown;
  increment: (amount: number) => unknown;
};

export function createRouteStopMutationGateway(dependencies: RouteStopMutationDependencies) {
  async function saveExistingRoutePlansAtomically(
    plans: ExistingRoutePlan[],
  ): Promise<SavedRoutePlan[]> {
    return dependencies.runTransaction(dependencies.db, async (transaction) => {
      const refs = plans.map((plan) => dependencies.doc(dependencies.db, 'routes', plan.routeId));
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));

      const results = plans.map((plan, index) => {
        const snapshot = snapshots[index];
        if (!snapshot.exists()) throw new Error(`Rota ${plan.routeId} não encontrada.`);
        const data = snapshot.data();
        const latestStops = (data.stops || []) as PlaceValue[];
        const rebased = rebasePlannedStops({
          baseStops: plan.baseStops,
          plannedStops: plan.plannedStops,
          latestStops,
        });
        const changes = detectRouteChanges(latestStops, rebased);
        const stops = markModifiedStops(rebased, changes);
        return {
          routeId: plan.routeId,
          stops,
          changes,
          status: (data.status as string | undefined) || '',
          driverId: data.driverId as string | undefined,
        };
      });

      results.forEach((result, index) => {
        const metrics = plans[index].metrics;
        transaction.update(refs[index], {
          stops: result.stops,
          ...(metrics || {}),
          updatedAt: dependencies.serverTimestamp(),
        });
      });

      return results;
    });
  }

  async function confirmRouteStopAtomically(input: {
    routeId: string;
    driverId: string;
    targetStop: Partial<PlaceValue>;
    patch: Partial<PlaceValue>;
  }): Promise<{
    stops: PlaceValue[];
    previousStop: PlaceValue;
    updatedStop: PlaceValue;
    wasPreviouslyFinalized: boolean;
    transitionedToCompleted: boolean;
  }> {
    return dependencies.runTransaction(dependencies.db, async (transaction) => {
      const routeRef = dependencies.doc(dependencies.db, 'routes', input.routeId);
      const routeSnapshot = await transaction.get(routeRef);
      if (!routeSnapshot.exists()) throw new Error('Rota não encontrada.');
      const routeData = routeSnapshot.data();
      if (routeData.driverId !== input.driverId) {
        throw new Error('Esta rota não pertence mais ao motorista atual.');
      }

      const mutation = updateStopByIdentity(
        (routeData.stops || []) as PlaceValue[],
        input.targetStop,
        input.patch,
      );
      const wasPreviouslyFinalized = Boolean(mutation.previousStop.deliveryStatus);
      const transitionedToCompleted =
        mutation.previousStop.deliveryStatus !== 'completed' &&
        mutation.updatedStop.deliveryStatus === 'completed';
      const updatedStop = wasPreviouslyFinalized
        ? { ...mutation.updatedStop, editedByDriver: true, editedAt: dependencies.now() }
        : mutation.updatedStop;
      const stops = [...mutation.stops];
      stops[mutation.index] = updatedStop;

      transaction.update(routeRef, {
        stops,
        currentStopIndex: mutation.index + 1,
        updatedAt: dependencies.serverTimestamp(),
      });

      if (transitionedToCompleted) {
        transaction.update(dependencies.doc(dependencies.db, 'users', input.driverId), {
          totalDeliveries: dependencies.increment(1),
        });
      }

      return {
        stops,
        previousStop: mutation.previousStop,
        updatedStop,
        wasPreviouslyFinalized,
        transitionedToCompleted,
      };
    });
  }

  async function acknowledgeRouteChangesAtomically(routeId: string): Promise<void> {
    await dependencies.runTransaction(dependencies.db, async (transaction) => {
      const routeRef = dependencies.doc(dependencies.db, 'routes', routeId);
      const notificationRef = dependencies.doc(dependencies.db, 'routeChangeNotifications', routeId);
      const routeSnapshot = await transaction.get(routeRef);
      const notificationSnapshot = await transaction.get(notificationRef);
      if (!routeSnapshot.exists()) throw new Error('Rota não encontrada.');
      if (!notificationSnapshot.exists()) throw new Error('Notificação não encontrada.');

      transaction.update(routeRef, {
        stops: clearRouteChangeFlags((routeSnapshot.data().stops || []) as PlaceValue[]),
        pendingChanges: false,
        updatedAt: dependencies.serverTimestamp(),
      });
      transaction.update(notificationRef, {
        acknowledged: true,
        acknowledgedAt: dependencies.serverTimestamp(),
      });
    });
  }

  return {
    saveExistingRoutePlansAtomically,
    confirmRouteStopAtomically,
    acknowledgeRouteChangesAtomically,
  };
}

const firebaseDependencies: RouteStopMutationDependencies = {
  db,
  doc: (database, collection, id) => firebaseDoc(database as Firestore, collection, id),
  runTransaction: async (database, updateFunction) =>
    firebaseRunTransaction(database as Firestore, async (transaction) =>
      updateFunction({
        get: async (reference) => {
          const snapshot = await transaction.get(reference as DocumentReference);
          return {
            exists: () => snapshot.exists(),
            data: () => snapshot.data() || {},
          };
        },
        update: (reference, data) => {
          transaction.update(reference as DocumentReference, data);
        },
      }),
    ),
  serverTimestamp: firebaseServerTimestamp,
  now: () => Timestamp.now(),
  increment: firebaseIncrement,
};

const defaultGateway = createRouteStopMutationGateway(firebaseDependencies);

export async function saveExistingRoutePlansAtomically(
  plans: ExistingRoutePlan[],
): Promise<SavedRoutePlan[]> {
  return defaultGateway.saveExistingRoutePlansAtomically(plans);
}

export async function confirmRouteStopAtomically(input: {
  routeId: string;
  driverId: string;
  targetStop: Partial<PlaceValue>;
  patch: Partial<PlaceValue>;
}): Promise<{
  stops: PlaceValue[];
  previousStop: PlaceValue;
  updatedStop: PlaceValue;
  wasPreviouslyFinalized: boolean;
  transitionedToCompleted: boolean;
}> {
  return defaultGateway.confirmRouteStopAtomically(input);
}

export async function acknowledgeRouteChangesAtomically(routeId: string): Promise<void> {
  return defaultGateway.acknowledgeRouteChangesAtomically(routeId);
}

export { RouteStopNotFoundError };
