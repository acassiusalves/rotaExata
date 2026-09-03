import type { PlaceValue } from '@/lib/types';
import { getStopIdentityKey } from '@/lib/route-stop-utils';

export type PlannedRouteStop = PlaceValue & {
  /** Identidade da parada antes de uma edição. Nunca deve ser persistida. */
  _originalStopKey?: string;
};

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

export function validateStopIdentities(stops: PlaceValue[], label: string): string[] {
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

export function getPlannedStopSourceKey(stop: PlannedRouteStop): string | null {
  if (!Object.prototype.hasOwnProperty.call(stop, '_originalStopKey')) {
    return getStopIdentityKey(stop);
  }

  const originalStopKey = stop._originalStopKey?.trim();
  if (!originalStopKey) {
    throw new RouteStructureConflictError('O plano contém linhagem de parada inválida.');
  }
  return originalStopKey;
}

export function findSingleStopByIdentity(
  stops: PlaceValue[],
  target: Partial<PlaceValue>,
): PlaceValue {
  const targetKey = getStopIdentityKey(target);
  if (!targetKey) {
    throw new RouteStructureConflictError('A parada removida não possui identidade estável.');
  }
  const matches = stops.filter((stop) => getStopIdentityKey(stop) === targetKey);
  if (matches.length !== 1) {
    throw new RouteStructureConflictError(
      'A parada removida não pôde ser identificada de forma única após o commit.',
    );
  }
  return matches[0];
}

function stripTransientFields(stop: PlaceValue): PlaceValue {
  const {
    _originalIndex,
    _wasMoved,
    _movedFromRoute,
    _originalRouteColor,
    _originalStopKey,
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

  if (latest.deliveryStatus === 'completed' || latest.deliveryStatus === 'failed') {
    if (hasOwn(latest, 'notes')) merged.notes = latest.notes;
    else delete merged.notes;
  }

  return merged as PlaceValue;
}

export function rebasePlannedStops(input: {
  baseStops: PlaceValue[];
  plannedStops: PlannedRouteStop[];
  latestStops: PlaceValue[];
}): PlaceValue[] {
  const baseKeys = validateStopIdentities(input.baseStops, 'A base');
  const latestKeys = validateStopIdentities(input.latestStops, 'A versão atual');
  validateStopIdentities(input.plannedStops, 'O plano');
  if (JSON.stringify(baseKeys) !== JSON.stringify(latestKeys)) {
    throw new RouteStructureConflictError();
  }

  const plannedSourceKeys = input.plannedStops.map(getPlannedStopSourceKey);
  if (new Set(plannedSourceKeys).size !== plannedSourceKeys.length) {
    throw new RouteStructureConflictError('O plano reutiliza a mesma parada mais de uma vez.');
  }

  const baseKeySet = new Set(baseKeys);
  const latestByKey = new Map(
    input.latestStops.map((item) => [getStopIdentityKey(item) as string, item]),
  );

  return input.plannedStops.map((planned, index) => {
    const key = getStopIdentityKey(planned);
    if (!key) throw new RouteStructureConflictError('O plano contém parada sem identidade estável.');
    const sourceKey = plannedSourceKeys[index];
    if (!sourceKey) throw new RouteStructureConflictError('O plano contém parada sem identidade estável.');
    const latest = latestByKey.get(sourceKey);
    if (latest) return mergeWithLatestExecution(latest, planned);
    if (baseKeySet.has(sourceKey) || Object.prototype.hasOwnProperty.call(planned, '_originalStopKey')) {
      throw new RouteStructureConflictError();
    }
    return stripTransientFields(planned);
  });
}

export function updateStopByIdentity(
  stops: PlaceValue[],
  target: Partial<PlaceValue>,
  patch: Partial<PlaceValue>,
): { stops: PlaceValue[]; previousStop: PlaceValue; updatedStop: PlaceValue; index: number } {
  validateStopIdentities(stops, 'A versão atual');
  const targetKey = getStopIdentityKey(target);
  if (!targetKey) throw new RouteStopNotFoundError('Não foi possível identificar a parada.');
  const index = stops.findIndex((item) => getStopIdentityKey(item) === targetKey);
  if (index < 0) throw new RouteStopNotFoundError();
  const previousStop = stops[index];
  const updatedStop = { ...previousStop, ...patch };
  const next = [...stops];
  next[index] = updatedStop;
  validateStopIdentities(next, 'A versão atualizada');
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
