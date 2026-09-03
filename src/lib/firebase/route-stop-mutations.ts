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
import { getStopIdentityKey } from '@/lib/route-stop-utils';
import {
  clearRouteChangeFlags,
  rebasePlannedStops,
  RouteStructureConflictError,
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
  metadata?: Record<string, unknown>;
};

export type SavedRoutePlan = {
  routeId: string;
  stops: PlaceValue[];
  removedStops: PlaceValue[];
  changes: RouteChange[];
  previousStatus: string;
  previousDriverId?: string;
  status: string;
  driverId?: string;
};

export type NewRoutePlan = {
  routeId: string;
  data: Record<string, unknown>;
  plannedStops: PlaceValue[];
};

export type RoutePlanBatchInput = {
  existingPlans: ExistingRoutePlan[];
  newRoutes?: NewRoutePlan[];
  serviceLink?: {
    serviceId: string;
    routeIds: string[];
  };
};

export type SavedNewRoutePlan = {
  routeId: string;
  stops: PlaceValue[];
};

export type SavedRoutePlanBatch = {
  existingRoutes: SavedRoutePlan[];
  createdRoutes: SavedNewRoutePlan[];
};

export type RouteStopMutationSnapshot = {
  exists: () => boolean;
  data: () => Record<string, unknown>;
};

export type RouteStopMutationTransaction = {
  get: (reference: unknown) => Promise<RouteStopMutationSnapshot>;
  update: (reference: unknown, data: Record<string, unknown>) => void;
  set?: (reference: unknown, data: Record<string, unknown>) => void;
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
  async function saveRoutePlanBatchAtomically(
    input: RoutePlanBatchInput,
  ): Promise<SavedRoutePlanBatch> {
    return dependencies.runTransaction(dependencies.db, async (transaction) => {
      const existingRefs = input.existingPlans.map((plan) => (
        dependencies.doc(dependencies.db, 'routes', plan.routeId)
      ));
      const newRoutes = input.newRoutes || [];
      if (newRoutes.length > 0 && !transaction.set) {
        throw new Error('A transação não oferece suporte à criação de rotas.');
      }
      const newRefs = newRoutes.map((plan) => (
        dependencies.doc(dependencies.db, 'routes', plan.routeId)
      ));
      const serviceRef = input.serviceLink
        ? dependencies.doc(dependencies.db, 'services', input.serviceLink.serviceId)
        : null;
      const existingSnapshots = await Promise.all(
        existingRefs.map((reference) => transaction.get(reference)),
      );
      const newSnapshots = await Promise.all(
        newRefs.map((reference) => transaction.get(reference)),
      );
      const serviceSnapshot = serviceRef ? await transaction.get(serviceRef) : null;

      newSnapshots.forEach((snapshot, index) => {
        if (snapshot.exists()) {
          throw new Error(`Rota ${newRoutes[index].routeId} já existe.`);
        }
      });
      if (serviceSnapshot && !serviceSnapshot.exists()) {
        throw new Error(`Serviço ${input.serviceLink?.serviceId} não encontrado.`);
      }

      const preparedExisting = input.existingPlans.map((plan, index) => {
        const snapshot = existingSnapshots[index];
        if (!snapshot.exists()) throw new Error(`Rota ${plan.routeId} não encontrada.`);
        const data = snapshot.data();
        const latestStops = (data.stops || []) as PlaceValue[];
        const rebased = rebasePlannedStops({
          baseStops: plan.baseStops,
          plannedStops: plan.plannedStops,
          latestStops,
        });
        const plannedKeys = new Set(rebased.map((stop) => getStopIdentityKey(stop)));
        const removedStops = latestStops.filter((stop) => !plannedKeys.has(getStopIdentityKey(stop)));
        return { plan, data, latestStops, rebased, removedStops };
      });

      const removedByIdentity = new Map<string, PlaceValue>();
      preparedExisting.forEach(({ removedStops }) => {
        removedStops.forEach((stop) => {
          const key = getStopIdentityKey(stop);
          if (!key) throw new RouteStructureConflictError('A parada removida não possui identidade estável.');
          if (removedByIdentity.has(key)) {
            throw new RouteStructureConflictError('A mesma parada foi removida de mais de uma rota.');
          }
          removedByIdentity.set(key, stop);
        });
      });

      const mergeTransferredExecution = (
        plannedStops: PlaceValue[],
        baseStops: PlaceValue[],
      ): PlaceValue[] => {
        const baseKeys = new Set(baseStops.map((stop) => getStopIdentityKey(stop)));
        return plannedStops.map((plannedStop) => {
          const key = getStopIdentityKey(plannedStop);
          if (!key || baseKeys.has(key)) return plannedStop;
          const sourceLatest = removedByIdentity.get(key);
          if (!sourceLatest) return plannedStop;
          return rebasePlannedStops({
            baseStops: [sourceLatest],
            plannedStops: [plannedStop],
            latestStops: [sourceLatest],
          })[0];
        });
      };

      const existingResults = preparedExisting.map((prepared) => {
        const rebased = mergeTransferredExecution(prepared.rebased, prepared.plan.baseStops);
        const metadata = prepared.plan.metadata || {};
        const changes = detectRouteChanges(prepared.latestStops, rebased);
        const stops = markModifiedStops(rebased, changes);
        return {
          routeId: prepared.plan.routeId,
          stops,
          removedStops: prepared.removedStops,
          changes,
          previousStatus: (prepared.data.status as string | undefined) || '',
          previousDriverId: prepared.data.driverId as string | undefined,
          status: (metadata.status as string | undefined) ??
            (prepared.data.status as string | undefined) ?? '',
          driverId: Object.prototype.hasOwnProperty.call(metadata, 'driverId')
            ? metadata.driverId as string | undefined
            : prepared.data.driverId as string | undefined,
        };
      });

      const createdRoutes = newRoutes.map((newRoute) => ({
        routeId: newRoute.routeId,
        stops: mergeTransferredExecution(newRoute.plannedStops, []),
      }));

      existingResults.forEach((result, index) => {
        const plan = input.existingPlans[index];
        transaction.update(existingRefs[index], {
          ...(plan.metadata || {}),
          stops: result.stops,
          ...(plan.metrics || {}),
          updatedAt: dependencies.serverTimestamp(),
        });
      });

      createdRoutes.forEach((createdRoute, index) => {
        transaction.set!(newRefs[index], {
          ...newRoutes[index].data,
          stops: createdRoute.stops,
          updatedAt: dependencies.serverTimestamp(),
        });
      });

      if (serviceRef && serviceSnapshot && input.serviceLink) {
        const currentRouteIds = serviceSnapshot.data().routeIds;
        const routeIds = Array.isArray(currentRouteIds)
          ? currentRouteIds.filter((routeId): routeId is string => typeof routeId === 'string')
          : [];
        transaction.update(serviceRef, {
          routeIds: Array.from(new Set([...routeIds, ...input.serviceLink.routeIds])),
          updatedAt: dependencies.serverTimestamp(),
        });
      }

      return { existingRoutes: existingResults, createdRoutes };
    });
  }

  async function saveExistingRoutePlansAtomically(
    plans: ExistingRoutePlan[],
  ): Promise<SavedRoutePlan[]> {
    const result = await saveRoutePlanBatchAtomically({ existingPlans: plans });
    return result.existingRoutes;
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
    saveRoutePlanBatchAtomically,
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
        set: (reference, data) => {
          transaction.set(reference as DocumentReference, data);
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

export async function saveRoutePlanBatchAtomically(
  input: RoutePlanBatchInput,
): Promise<SavedRoutePlanBatch> {
  return defaultGateway.saveRoutePlanBatchAtomically(input);
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
