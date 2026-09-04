import { RouteStructureConflictError } from '@/lib/route-stop-reconciliation';
import type { RouteStopTransferIntent } from '@/lib/firebase/route-stop-mutations';
import { getStopIdentityKey } from '@/lib/route-stop-utils';
import type { PlaceValue } from '@/lib/types';

export type RoutePlanBatchConflictOutcome<Result> =
  | { status: 'saved'; result: Result }
  | { status: 'conflict' };

export function buildRouteStopTransferIntents({
  targetRouteKeys,
  pendingEdits,
  existingRouteIdsByKey,
  targetRouteIdsByKey,
}: {
  targetRouteKeys: string[];
  pendingEdits: Record<string, PlaceValue[] | null | undefined>;
  existingRouteIdsByKey: Map<string, string>;
  targetRouteIdsByKey: Map<string, string>;
}): RouteStopTransferIntent[] {
  return targetRouteKeys.flatMap((targetRouteKey) => {
    const targetRouteId = targetRouteIdsByKey.get(targetRouteKey);
    if (!targetRouteId) return [];
    return (pendingEdits[targetRouteKey] || []).flatMap((stop) => {
      const sourceRouteKey = (stop as PlaceValue & { _movedFromRoute?: string })._movedFromRoute;
      if (!sourceRouteKey) return [];
      const sourceRouteId = existingRouteIdsByKey.get(sourceRouteKey);
      if (!sourceRouteId || sourceRouteId === targetRouteId) return [];
      const stopKey = getStopIdentityKey(stop);
      if (!stopKey) {
        throw new RouteStructureConflictError('Uma transferência pendente está sem identidade estável.');
      }
      return [{ sourceRouteId, targetRouteId, stopKey }];
    });
  });
}

export async function saveRoutePlanBatchWithConflictHandling<Input, Result>({
  buildInput,
  save,
  onConflict,
}: {
  buildInput: () => Input;
  save: (input: Input) => Promise<Result>;
  onConflict: (error: RouteStructureConflictError) => void;
}): Promise<RoutePlanBatchConflictOutcome<Result>> {
  try {
    return { status: 'saved', result: await save(buildInput()) };
  } catch (error) {
    if (error instanceof RouteStructureConflictError) {
      onConflict(error);
      return { status: 'conflict' };
    }
    throw error;
  }
}
