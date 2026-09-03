import type { PlaceValue } from '@/lib/types';
import { getStopIdentityKey } from '@/lib/route-stop-utils';

const EXECUTION_FIELDS = [
  'deliveryStatus',
  'arrivedAt',
  'completedAt',
  'photoUrl',
  'signatureUrl',
  'failureReason',
  'wentToLocation',
  'attemptPhotoUrl',
  'payments',
  'deliveredItemIds',
  'reconciled',
  'reconciledAt',
  'reconciledBy',
  'reconciledMethod',
  'aiExtractedValue',
  'editedByDriver',
  'editedAt',
] as const;

const hasOwn = (value: object, key: PropertyKey) =>
  Object.prototype.hasOwnProperty.call(value, key);

export class RouteStructureConflictError extends Error {
  readonly code = 'route-structure-conflict';

  constructor(message = 'A estrutura da rota mudou durante a edição.') {
    super(message);
    this.name = 'RouteStructureConflictError';
  }
}

export class RouteStopNotFoundError extends Error {
  readonly code = 'route-stop-not-found';

  constructor(message = 'A parada não existe mais nesta rota.') {
    super(message);
    this.name = 'RouteStopNotFoundError';
  }
}

function keysOf(stops: PlaceValue[], label: string): string[] {
  const keys = stops.map((item) => getStopIdentityKey(item));
  if (keys.some((key) => !key)) {
    throw new RouteStructureConflictError(`${label} contém parada sem identidade estável.`);
  }
  const normalized = keys as string[];
  if (new Set(normalized).size !== normalized.length) {
    throw new RouteStructureConflictError(`${label} contém identidades duplicadas.`);
  }
  return normalized;
}

function stripTransientFields(stop: PlaceValue): PlaceValue {
  const {
    _originalIndex,
    _wasMoved,
    _movedFromRoute,
    _originalRouteColor,
    wasModified,
    modifiedAt,
    modificationType,
    originalSequence,
    ...clean
  } = stop as PlaceValue & Record<string, unknown>;
  return clean as PlaceValue;
}

function mergeWithLatestExecution(latest: PlaceValue, planned: PlaceValue): PlaceValue {
  const merged = {
    ...latest,
    ...stripTransientFields(planned),
  } as Record<string, unknown>;

  for (const field of EXECUTION_FIELDS) {
    if (hasOwn(latest, field)) merged[field] = (latest as Record<string, unknown>)[field];
    else delete merged[field];
  }

  if (
    (latest.deliveryStatus === 'completed' || latest.deliveryStatus === 'failed') &&
    hasOwn(latest, 'notes')
  ) {
    merged.notes = latest.notes;
  }

  return merged as PlaceValue;
}

export function rebasePlannedStops(input: {
  baseStops: PlaceValue[];
  plannedStops: PlaceValue[];
  latestStops: PlaceValue[];
}): PlaceValue[] {
  const baseKeys = keysOf(input.baseStops, 'A base');
  const latestKeys = keysOf(input.latestStops, 'A versão atual');
  if (JSON.stringify(baseKeys) !== JSON.stringify(latestKeys)) {
    throw new RouteStructureConflictError();
  }

  const baseKeySet = new Set(baseKeys);
  const latestByKey = new Map(
    input.latestStops.map((item) => [getStopIdentityKey(item) as string, item]),
  );

  return input.plannedStops.map((planned) => {
    const key = getStopIdentityKey(planned);
    if (!key) throw new RouteStructureConflictError('O plano contém parada sem identidade estável.');
    const latest = latestByKey.get(key);
    if (latest) return mergeWithLatestExecution(latest, planned);
    if (baseKeySet.has(key)) throw new RouteStructureConflictError();
    return stripTransientFields(planned);
  });
}

export function updateStopByIdentity(
  stops: PlaceValue[],
  target: Partial<PlaceValue>,
  patch: Partial<PlaceValue>,
): { stops: PlaceValue[]; previousStop: PlaceValue; updatedStop: PlaceValue; index: number } {
  const targetKey = getStopIdentityKey(target);
  if (!targetKey) throw new RouteStopNotFoundError('Não foi possível identificar a parada.');
  const index = stops.findIndex((item) => getStopIdentityKey(item) === targetKey);
  if (index < 0) throw new RouteStopNotFoundError();
  const previousStop = stops[index];
  const updatedStop = { ...previousStop, ...patch };
  const next = [...stops];
  next[index] = updatedStop;
  return { stops: next, previousStop, updatedStop, index };
}

export function clearRouteChangeFlags(stops: PlaceValue[]): PlaceValue[] {
  return stops.map((stop) => {
    const {
      modifiedAt,
      modificationType,
      originalSequence,
      ...clean
    } = stop;
    return { ...clean, wasModified: false };
  });
}
