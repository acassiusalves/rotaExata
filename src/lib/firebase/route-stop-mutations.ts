import {
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  Timestamp,
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

export async function saveExistingRoutePlansAtomically(
  plans: ExistingRoutePlan[],
): Promise<SavedRoutePlan[]> {
  return runTransaction(db, async (transaction) => {
    const refs = plans.map((plan) => doc(db, 'routes', plan.routeId));
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
        status: data.status || '',
        driverId: data.driverId as string | undefined,
      };
    });

    results.forEach((result, index) => {
      const metrics = plans[index].metrics;
      transaction.update(refs[index], {
        stops: result.stops,
        ...(metrics || {}),
        updatedAt: serverTimestamp(),
      });
    });

    return results;
  });
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
  return runTransaction(db, async (transaction) => {
    const routeRef = doc(db, 'routes', input.routeId);
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
      ? { ...mutation.updatedStop, editedByDriver: true, editedAt: Timestamp.now() }
      : mutation.updatedStop;
    const stops = [...mutation.stops];
    stops[mutation.index] = updatedStop;

    transaction.update(routeRef, {
      stops,
      currentStopIndex: mutation.index + 1,
      updatedAt: serverTimestamp(),
    });

    if (transitionedToCompleted) {
      transaction.update(doc(db, 'users', input.driverId), {
        totalDeliveries: increment(1),
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

export async function acknowledgeRouteChangesAtomically(routeId: string): Promise<void> {
  await runTransaction(db, async (transaction) => {
    const routeRef = doc(db, 'routes', routeId);
    const notificationRef = doc(db, 'routeChangeNotifications', routeId);
    const routeSnapshot = await transaction.get(routeRef);
    const notificationSnapshot = await transaction.get(notificationRef);
    if (!routeSnapshot.exists()) throw new Error('Rota não encontrada.');
    if (!notificationSnapshot.exists()) throw new Error('Notificação não encontrada.');

    transaction.update(routeRef, {
      stops: clearRouteChangeFlags((routeSnapshot.data().stops || []) as PlaceValue[]),
      pendingChanges: false,
      updatedAt: serverTimestamp(),
    });
    transaction.update(notificationRef, {
      acknowledged: true,
      acknowledgedAt: serverTimestamp(),
    });
  });
}

export { RouteStopNotFoundError };
