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
import { isImpersonationSessionActive } from '@/lib/impersonation-session';
import type { PlaceValue } from '@/lib/types';
import {
  createRouteStopMutationGateway,type RouteStopMutationDependencies,
  type ExistingRoutePlan,type SavedRoutePlan,type RoutePlanBatchInput,type SavedRoutePlanBatch,
} from '@/lib/route-stop-mutations';
export * from '@/lib/route-stop-mutations';

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
  if (isImpersonationSessionActive()) throw new Error('O modo teste não registra recebimento pelo entregador.');
  return defaultGateway.acknowledgeRouteChangesAtomically(routeId, expectedFingerprint);
}
