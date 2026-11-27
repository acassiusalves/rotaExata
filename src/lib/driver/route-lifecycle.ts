import { activeDriverStop } from './runtime-contract.ts';

export type FinishReadiness = { ready: boolean; routeStatus: string | null; activeStops: number; resolvedStops: number };

/** Regra de "Finalizar": rota em andamento com pelo menos 80% das paradas ativas resolvidas. */
export function finishReadiness(status: unknown, stops: unknown): FinishReadiness {
  const active = (Array.isArray(stops) ? stops : []).filter(activeDriverStop);
  const resolvedStops = active.filter(stop => {
    const outcome = stop && typeof stop === 'object' ? (stop as { deliveryStatus?: unknown }).deliveryStatus : undefined;
    return outcome === 'completed' || outcome === 'failed';
  }).length;
  return {
    ready: status === 'in_progress' && active.length > 0 && resolvedStops * 5 >= active.length * 4,
    routeStatus: typeof status === 'string' ? status : null,
    activeStops: active.length,
    resolvedStops,
  };
}

type RouteActionLog = {
  action: string; routeId: string; uid: string; httpStatus: number; code: string;
  assistGrantId?: string; detail?: Record<string, unknown>; error?: unknown;
};

/** Linha de log de um comando de rota recusado ou que falhou. Só ids, códigos e contagens. */
export function routeActionLogLine({ detail, error, ...entry }: RouteActionLog) {
  const failure = error === undefined ? undefined : error instanceof Error
    ? { name: error.name, message: error.message.slice(0, 300), code: (error as { code?: unknown }).code }
    : { name: typeof error, message: String(error).slice(0, 300) };
  return '[driver-route] ' + JSON.stringify({ ...entry, ...detail, ...(failure ? { error: failure } : {}) });
}
