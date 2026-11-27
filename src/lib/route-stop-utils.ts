import type { PlaceValue } from '@/lib/types';

const normalizeToken = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() :
  typeof value === 'number' && Number.isFinite(value) ? String(value) : '';

export const getStopIdentityKey = (stop: Partial<PlaceValue> | null | undefined): string | null => {
  if (!stop) return null;

  const orderNumber = normalizeToken(stop.orderNumber);
  if (orderNumber) return `order:${orderNumber}`;

  const pointCode = normalizeToken(stop.pointCode);
  if (pointCode) return `point:${pointCode}`;

  const id = normalizeToken(stop.id);
  if (id) return `id:${id}`;

  const placeId = normalizeToken(stop.placeId);
  if (placeId) return `place:${placeId}`;

  const hasCoordinates = typeof stop.lat === 'number' && typeof stop.lng === 'number';
  if (hasCoordinates) {
    const address = normalizeToken(stop.address);
    return `coords:${stop.lat!.toFixed(6)}:${stop.lng!.toFixed(6)}:${address}`;
  }

  const address = normalizeToken(stop.address);
  if (address) return `address:${address}`;

  return null;
};

export const hasStopWithSameIdentity = (
  stops: PlaceValue[],
  stop: Partial<PlaceValue> | null | undefined
) => {
  const targetKey = getStopIdentityKey(stop);
  if (!targetKey) return false;

  return stops.some((candidate) => getStopIdentityKey(candidate) === targetKey);
};

export const findStopIndexByIdentity = (
  stops: PlaceValue[],
  stop: Partial<PlaceValue> | null | undefined
) => {
  const targetKey = getStopIdentityKey(stop);
  if (!targetKey) return -1;

  return stops.findIndex((candidate) => getStopIdentityKey(candidate) === targetKey);
};

export const removeStopWithSameIdentity = (
  stops: PlaceValue[],
  stop: Partial<PlaceValue> | null | undefined
) => {
  const targetKey = getStopIdentityKey(stop);
  if (!targetKey) return [...stops];

  return stops.filter((candidate) => getStopIdentityKey(candidate) !== targetKey);
};

export const dedupeStops = (stops: PlaceValue[]) => {
  const seen = new Set<string>();
  const deduped: PlaceValue[] = [];

  for (const stop of stops) {
    const identityKey = getStopIdentityKey(stop);

    if (identityKey) {
      if (seen.has(identityKey)) continue;
      seen.add(identityKey);
    }

    deduped.push(stop);
  }

  return deduped;
};

export const upsertStopInCollection = (
  stops: PlaceValue[],
  stop: PlaceValue,
  index?: number
) => {
  const withoutStop = removeStopWithSameIdentity(stops, stop);

  if (index === undefined || index < 0 || index > withoutStop.length) {
    return dedupeStops([...withoutStop, stop]);
  }

  const nextStops = [...withoutStop];
  nextStops.splice(index, 0, stop);

  return dedupeStops(nextStops);
};

export function stopHasExecution(stop: PlaceValue) {
  return ['arrived', 'completed', 'failed'].includes(stop.deliveryStatus ?? '') ||
    Boolean(stop.arrivedAt || stop.completedAt || stop.photoUrl || stop.attemptPhotoUrl || stop.signatureUrl ||
      stop.wentToLocation || stop.payments?.length || stop.deliveredItemIds?.length);
}

export function poolStopKeys(stop: Partial<PlaceValue> | null | undefined): string[] {
  const primary = getStopIdentityKey(stop);
  const manualId = stop?.orderNumber ? null : getStopIdentityKey({ id: stop?.id });
  return [...new Set([primary, manualId].filter((key): key is string => Boolean(key)))];
}

export function excludedPoolStopKeys(copies: PlaceValue[], removed: unknown = []): string[] {
  const blocked = new Set<string>();
  if (Array.isArray(removed)) for (const key of removed) {
    if (typeof key === 'string') blocked.add(key);
  }
  for (const stop of copies) {
    if (stop && (stop.unlinkedAt || stopHasExecution(stop))) poolStopKeys(stop).forEach(key => blocked.add(key));
  }
  return [...blocked];
}

export function availableRouteStops(
  candidates: PlaceValue[],
  routes: PlaceValue[][],
  excluded: string[] = [],
): PlaceValue[] {
  // A legacy copy cannot make an assigned or archived identity available again.
  const unavailable = new Set([...routes.flatMap(stops => stops.flatMap(poolStopKeys)), ...excludedPoolStopKeys(candidates, excluded)]);
  return candidates.filter(stop => {
    if (!stop) return false;
    const keys = poolStopKeys(stop);
    if (keys.some(key => unavailable.has(key))) return false;
    keys.forEach(key => unavailable.add(key));
    return true;
  });
}

export function isClosedPlanningRoute(status?: string) {
  return status === 'completed' || status === 'completed_auto' || status === 'finished';
}
