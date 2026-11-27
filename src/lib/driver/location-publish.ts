type Point = { lat: number; lng: number };

function meters(a: Point, b: Point) {
  const radians = Math.PI / 180;
  const haversine = Math.sin((b.lat - a.lat) * radians / 2) ** 2 +
    Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin((b.lng - a.lng) * radians / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, haversine))));
}

/**
 * Decide quando a posição do motorista deve ser enviada ao servidor.
 *
 * Um envio recusado não pode liberar o seguinte de imediato: o GPS entrega
 * posições várias vezes por segundo e cada falha virava uma nova requisição.
 * E um 404 significa que a rota não aceita mais localização (finalizada ou
 * retirada do motorista), então insistir só gera ruído.
 */
export function locationPublisher(options: { interval: number; distance: number; maxRetries?: number }) {
  const maxRetries = options.maxRetries ?? 3;
  let accepted: { at: number; point: Point } | null = null;
  let attemptedAt = 0;
  let failing = false;
  let retries = 0;
  let halted = false;

  return {
    get halted() { return halted; },
    due(now: number, point: Point, forced = false) {
      if (halted) return false;
      if (forced) return true;
      if (failing) return now - attemptedAt >= options.interval;
      if (!accepted) return true;
      return meters(accepted.point, point) >= options.distance || now - accepted.at >= options.interval;
    },
    attempted(now: number) { attemptedAt = now; },
    succeeded(now: number, point: Point) {
      accepted = { at: now, point };
      failing = false;
      retries = 0;
    },
    failed(error: unknown): 'halt' | 'retry' | 'wait' {
      if ((error as { status?: unknown } | null)?.status === 404) {
        halted = true;
        return 'halt';
      }
      failing = true;
      return retries++ < maxRetries ? 'retry' : 'wait';
    },
    resume() {
      halted = false;
      failing = false;
      retries = 0;
    },
  };
}
