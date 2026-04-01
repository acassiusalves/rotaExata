import type { PlaceValue } from '@/lib/types';

const normalizeToken = (value?: string | null) => value?.trim().toLowerCase() ?? '';

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
