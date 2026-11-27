import type { PlaceValue } from './types';
import { rebasePlannedStops, RouteStructureConflictError } from './route-stop-reconciliation.ts';

export function followRouteKey(
  id: string,
  anchor: string | undefined,
  serviceRoutes: { A: string | null; B: string | null },
  otherRoutes: { key: string; id?: string }[],
) {
  if (id === anchor || id === serviceRoutes.A) return 'A';
  if (id === serviceRoutes.B) return 'B';
  return otherRoutes.find(route => route.id === id)?.key;
}

export function reconcileFollowRouteStops(
  baseline: PlaceValue[], latest: PlaceValue[], pending: PlaceValue[] | null | undefined,
) {
  if (!pending) return { stops: latest, pending: null, conflict: false };
  try {
    const rebased = rebasePlannedStops({ baseStops: baseline, latestStops: latest, plannedStops: pending });
    const editingFields = ['_originalIndex', '_originalStopKey', '_recentlyInserted', '_wasMoved', '_movedFromRoute', '_originalRouteColor'];
    return {
      stops: latest,
      pending: rebased.map((stop, index) => ({
        ...stop,
        ...Object.fromEntries(Object.entries(pending[index]).filter(([field]) => editingFields.includes(field))),
      })),
      conflict: false,
    };
  } catch (error) {
    if (!(error instanceof RouteStructureConflictError)) throw error;
    return { stops: latest, pending, conflict: true };
  }
}
