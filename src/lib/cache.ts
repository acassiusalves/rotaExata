/**
 * Cache simples em memória com TTL
 * Para produção com múltiplas instâncias, considere usar Redis/Upstash
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const cacheStore = new Map<string, CacheEntry<unknown>>();

// Limpar entradas expiradas periodicamente (evitar memory leak)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of cacheStore.entries()) {
      if (now > entry.expiresAt) {
        cacheStore.delete(key);
      }
    }
  }, 60000); // Limpa a cada minuto
}

/**
 * Obtém um valor do cache
 */
export function cacheGet<T>(key: string): T | null {
  const entry = cacheStore.get(key) as CacheEntry<T> | undefined;

  if (!entry) {
    return null;
  }

  // Verificar se expirou
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }

  return entry.value;
}

/**
 * Armazena um valor no cache
 * @param key - Chave do cache
 * @param value - Valor a armazenar
 * @param ttlSeconds - Tempo de vida em segundos (padrão: 5 minutos)
 */
export function cacheSet<T>(key: string, value: T, ttlSeconds: number = 300): void {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + (ttlSeconds * 1000),
  });
}

/**
 * Remove um valor do cache
 */
export function cacheDelete(key: string): void {
  cacheStore.delete(key);
}

/**
 * Limpa todo o cache
 */
export function cacheClear(): void {
  cacheStore.clear();
}

/**
 * Gera uma chave de cache baseada em coordenadas de origem e destino
 */
export function routeCacheKey(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): string {
  // Arredondar para 5 casas decimais (~1m de precisão)
  const precision = 5;
  const oLat = origin.lat.toFixed(precision);
  const oLng = origin.lng.toFixed(precision);
  const dLat = destination.lat.toFixed(precision);
  const dLng = destination.lng.toFixed(precision);

  return `route:${oLat},${oLng}:${dLat},${dLng}`;
}

/**
 * Gera uma chave de cache para rotas otimizadas (múltiplos stops)
 */
export function optimizedRouteCacheKey(
  origin: { lat: number; lng: number },
  stops: Array<{ lat: number; lng: number }>
): string {
  const precision = 4; // Menor precisão para rotas complexas

  const parts = [
    `optimized:${origin.lat.toFixed(precision)},${origin.lng.toFixed(precision)}`,
    ...stops.map(s => `${s.lat.toFixed(precision)},${s.lng.toFixed(precision)}`)
  ];

  return parts.join(':');
}

/**
 * Wrapper para executar função com cache
 */
export async function withCache<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  // Verificar cache
  const cached = cacheGet<T>(key);
  if (cached !== null) {
    return cached;
  }

  // Executar função e cachear resultado
  const result = await fn();
  cacheSet(key, result, ttlSeconds);

  return result;
}
