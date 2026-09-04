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
import type { PlaceValue, RouteChangeNotification } from '@/lib/types';
import { detectRouteChanges, markModifiedStops, type RouteChange } from '@/lib/route-change-tracker';
import { getStopIdentityKey } from '@/lib/route-stop-utils';
import {
  clearRouteChangeFlags,
  getPlannedStopSourceKey,
  type PlannedRouteStop,
  rebasePlannedStops,
  RouteStructureConflictError,
  RouteStopNotFoundError,
  updateStopByIdentity,
  validateStopIdentities,
} from '@/lib/route-stop-reconciliation';

export type RouteMetrics = {
  encodedPolyline: string;
  distanceMeters: number;
  duration: string;
};

export function resolveRoutePlanMetrics(
  plannedStops: PlaceValue[],
  computed?: RouteMetrics | null,
): RouteMetrics | undefined {
  if (plannedStops.length === 0) {
    return { encodedPolyline: '', distanceMeters: 0, duration: '0s' };
  }
  if (computed) return computed;
  return undefined;
}

export type ExistingRoutePlan = {
  routeId: string;
  baseStops: PlaceValue[];
  plannedStops: PlannedRouteStop[];
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
  plannedStops: PlannedRouteStop[];
};

export type RouteStopTransferIntent = {
  sourceRouteId: string;
  targetRouteId: string;
  stopKey: string;
};

export type RoutePlanBatchInput = {
  existingPlans: ExistingRoutePlan[];
  newRoutes?: NewRoutePlan[];
  transferIntents?: RouteStopTransferIntent[];
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

export async function notifySavedRoutePlansAndCount(
  results: SavedRoutePlan[],
  notify: (result: SavedRoutePlan) => Promise<void>,
  onError?: (result: SavedRoutePlan, error: unknown) => void,
): Promise<number> {
  let notifiedCount = 0;
  for (const result of results) {
    const eligible =
      result.changes.length > 0 &&
      Boolean(result.driverId) &&
      ['dispatched', 'in_progress'].includes(result.status);
    if (!eligible) continue;

    try {
      await notify(result);
      notifiedCount++;
    } catch (error) {
      onError?.(result, error);
    }
  }
  return notifiedCount;
}

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

export class RouteNotificationConflictError extends Error {
  readonly code = 'route-notification-conflict';

  constructor(message = 'A notificação da rota mudou antes da confirmação.') {
    super(message);
    this.name = 'RouteNotificationConflictError';
  }
}

function normalizeFingerprintValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeFingerprintValue);
  if (!value || typeof value !== 'object') return value;

  const timestampLike = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof timestampLike.toMillis === 'function') {
    return { timestampMillis: timestampLike.toMillis() };
  }
  if (typeof timestampLike.seconds === 'number' && typeof timestampLike.nanoseconds === 'number') {
    return { seconds: timestampLike.seconds, nanoseconds: timestampLike.nanoseconds };
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeFingerprintValue(item)]),
  );
}

export function getRouteChangeNotificationFingerprint(
  notification: Pick<RouteChangeNotification, 'routeId' | 'driverId' | 'changes' | 'createdAt'>,
): string {
  return JSON.stringify(normalizeFingerprintValue({
    routeId: notification.routeId,
    driverId: notification.driverId,
    createdAt: notification.createdAt,
    changes: notification.changes,
  }));
}

function omitUndefinedDeep<Value>(value: Value): Value {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => omitUndefinedDeep(item)) as Value;
  }
  if (!value || typeof value !== 'object') return value;

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;

  const sanitized = Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, omitUndefinedDeep(item)]),
  );
  return sanitized as Value;
}

function validateRoutePlanBatchInput(input: RoutePlanBatchInput): void {
  const newRoutes = input.newRoutes || [];
  const allPlans = [...input.existingPlans, ...newRoutes];
  const routeIds = allPlans.map((plan) => plan.routeId);
  if (routeIds.some((routeId) => !routeId.trim())) {
    throw new RouteStructureConflictError('O lote contém rota sem identificador.');
  }
  if (new Set(routeIds).size !== routeIds.length) {
    throw new RouteStructureConflictError('O lote contém identificadores de rota duplicados.');
  }

  input.existingPlans.forEach((plan) => {
    validateStopIdentities(plan.baseStops, `A base da rota ${plan.routeId}`);
    validateStopIdentities(plan.plannedStops, `O plano da rota ${plan.routeId}`);
  });
  newRoutes.forEach((plan) => {
    validateStopIdentities(plan.plannedStops, `A nova rota ${plan.routeId}`);
  });

  const existingRouteIds = new Set(input.existingPlans.map((plan) => plan.routeId));
  const allRouteIds = new Set(routeIds);
  const sourceStops = new Set<string>();
  const targetStops = new Set<string>();
  (input.transferIntents || []).forEach((intent) => {
    if (!intent.sourceRouteId.trim() || !intent.targetRouteId.trim() || !intent.stopKey.trim()) {
      throw new RouteStructureConflictError('A intenção de transferência está incompleta.');
    }
    if (!existingRouteIds.has(intent.sourceRouteId)) {
      throw new RouteStructureConflictError(`Rota de origem ${intent.sourceRouteId} ausente do lote.`);
    }
    if (!allRouteIds.has(intent.targetRouteId)) {
      throw new RouteStructureConflictError(`Rota de destino ${intent.targetRouteId} ausente do lote.`);
    }
    if (intent.sourceRouteId === intent.targetRouteId) {
      throw new RouteStructureConflictError('Uma transferência exige rotas distintas.');
    }

    const sourceKey = `${intent.sourceRouteId}\u0000${intent.stopKey}`;
    const targetKey = `${intent.targetRouteId}\u0000${intent.stopKey}`;
    if (sourceStops.has(sourceKey) || targetStops.has(targetKey)) {
      throw new RouteStructureConflictError('A intenção de transferência não é um-para-um.');
    }
    sourceStops.add(sourceKey);
    targetStops.add(targetKey);
  });

  if (input.serviceLink) {
    const linkedIds = input.serviceLink.routeIds;
    if (!input.serviceLink.serviceId.trim() || linkedIds.some((routeId) => !routeId.trim())) {
      throw new RouteStructureConflictError('O vínculo do serviço contém identificador inválido.');
    }
    if (new Set(linkedIds).size !== linkedIds.length) {
      throw new RouteStructureConflictError('O vínculo do serviço contém rotas duplicadas.');
    }
  }
}

export function createRouteStopMutationGateway(dependencies: RouteStopMutationDependencies) {
  async function saveRoutePlanBatchAtomically(
    input: RoutePlanBatchInput,
  ): Promise<SavedRoutePlanBatch> {
    validateRoutePlanBatchInput(input);
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
        const baseKeys = new Set(plan.baseStops.map((stop) => getStopIdentityKey(stop) as string));
        const retainedLatestKeys = new Set(
          plan.plannedStops
            .map((stop) => getPlannedStopSourceKey(stop))
            .filter((key): key is string => Boolean(key && baseKeys.has(key))),
        );
        const removedStops = latestStops.filter((stop) => (
          !retainedLatestKeys.has(getStopIdentityKey(stop) as string)
        ));
        const metadata = omitUndefinedDeep(plan.metadata || {});
        return { plan, data, latestStops, rebased, removedStops, baseKeys, metadata };
      });

      const transfersByTarget = new Map<string, Map<number, PlaceValue>>();
      (input.transferIntents || []).forEach((intent) => {
        const source = preparedExisting.find(({ plan }) => plan.routeId === intent.sourceRouteId);
        const sourceMatches = source?.removedStops.filter((stop) => (
          getStopIdentityKey(stop) === intent.stopKey
        )) || [];
        if (sourceMatches.length !== 1) {
          throw new RouteStructureConflictError(
            `A transferência de ${intent.stopKey} não corresponde a uma única remoção.`,
          );
        }

        const existingTarget = preparedExisting.find(({ plan }) => (
          plan.routeId === intent.targetRouteId
        ));
        const newTarget = newRoutes.find((plan) => plan.routeId === intent.targetRouteId);
        const targetPlannedStops = existingTarget?.plan.plannedStops || newTarget?.plannedStops || [];
        const targetBaseKeys = existingTarget?.baseKeys || new Set<string>();
        const targetIndexes = targetPlannedStops.flatMap((stop, index) => {
          const sourceKey = getPlannedStopSourceKey(stop);
          return sourceKey === intent.stopKey && !targetBaseKeys.has(sourceKey) ? [index] : [];
        });
        if (targetIndexes.length !== 1) {
          throw new RouteStructureConflictError(
            `A transferência de ${intent.stopKey} não corresponde a uma única adição.`,
          );
        }

        const targetTransfers = transfersByTarget.get(intent.targetRouteId) || new Map<number, PlaceValue>();
        if (targetTransfers.has(targetIndexes[0])) {
          throw new RouteStructureConflictError('A adição de destino já foi consumida por outra transferência.');
        }
        targetTransfers.set(targetIndexes[0], sourceMatches[0]);
        transfersByTarget.set(intent.targetRouteId, targetTransfers);
      });

      const applyTransferredExecution = (
        routeId: string,
        plannedStops: PlannedRouteStop[],
        rebasedStops?: PlaceValue[],
      ): PlaceValue[] => plannedStops.map((plannedStop, index) => {
        const sourceLatest = transfersByTarget.get(routeId)?.get(index);
        if (sourceLatest) {
          return rebasePlannedStops({
            baseStops: [sourceLatest],
            plannedStops: [plannedStop],
            latestStops: [sourceLatest],
          })[0];
        }
        if (rebasedStops) return rebasedStops[index];
        return rebasePlannedStops({
          baseStops: [],
          plannedStops: [plannedStop],
          latestStops: [],
        })[0];
      });

      const existingResults = preparedExisting.map((prepared) => {
        const rebased = applyTransferredExecution(
          prepared.plan.routeId,
          prepared.plan.plannedStops,
          prepared.rebased,
        );
        const metadata = prepared.metadata;
        const changes = detectRouteChanges(prepared.latestStops, rebased);
        const stops = omitUndefinedDeep(markModifiedStops(rebased, changes));
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
        stops: omitUndefinedDeep(applyTransferredExecution(
          newRoute.routeId,
          newRoute.plannedStops,
        )),
      }));

      existingResults.forEach((result, index) => {
        const plan = input.existingPlans[index];
        transaction.update(existingRefs[index], omitUndefinedDeep({
          ...preparedExisting[index].metadata,
          stops: result.stops,
          ...(plan.metrics || {}),
          updatedAt: dependencies.serverTimestamp(),
        }));
      });

      createdRoutes.forEach((createdRoute, index) => {
        transaction.set!(newRefs[index], omitUndefinedDeep({
          ...newRoutes[index].data,
          stops: createdRoute.stops,
          updatedAt: dependencies.serverTimestamp(),
        }));
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
      const wasPreviouslyFinalized =
        mutation.previousStop.deliveryStatus === 'completed' ||
        mutation.previousStop.deliveryStatus === 'failed';
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

  async function acknowledgeRouteChangesAtomically(
    routeId: string,
    expectedFingerprint?: string,
  ): Promise<void> {
    await dependencies.runTransaction(dependencies.db, async (transaction) => {
      const routeRef = dependencies.doc(dependencies.db, 'routes', routeId);
      const notificationRef = dependencies.doc(dependencies.db, 'routeChangeNotifications', routeId);
      const routeSnapshot = await transaction.get(routeRef);
      const notificationSnapshot = await transaction.get(notificationRef);
      if (!routeSnapshot.exists()) throw new Error('Rota não encontrada.');
      if (!notificationSnapshot.exists()) throw new Error('Notificação não encontrada.');
      if (expectedFingerprint) {
        const currentFingerprint = getRouteChangeNotificationFingerprint(
          notificationSnapshot.data() as RouteChangeNotification,
        );
        if (currentFingerprint !== expectedFingerprint) {
          throw new RouteNotificationConflictError();
        }
      }

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

export async function acknowledgeRouteChangesAtomically(
  routeId: string,
  expectedFingerprint?: string,
): Promise<void> {
  return defaultGateway.acknowledgeRouteChangesAtomically(routeId, expectedFingerprint);
}

export { RouteStopNotFoundError };
