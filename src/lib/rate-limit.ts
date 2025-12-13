/**
 * Rate Limiter simples baseado em memória
 * Para produção com múltiplas instâncias, considere usar Redis/Upstash
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Limpar entradas expiradas periodicamente (evitar memory leak)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000); // Limpa a cada minuto
}

export interface RateLimitConfig {
  /** Número máximo de requisições permitidas */
  maxRequests: number;
  /** Janela de tempo em segundos */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetIn: number; // segundos
}

/**
 * Verifica e aplica rate limiting
 * @param identifier - Identificador único (ex: IP, userId)
 * @param config - Configuração do rate limit
 * @returns Resultado da verificação
 */
export function rateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const { maxRequests, windowSeconds } = config;
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const resetTime = now + windowMs;

  const existing = rateLimitStore.get(identifier);

  // Se não existe entrada ou expirou, criar nova
  if (!existing || now > existing.resetTime) {
    rateLimitStore.set(identifier, {
      count: 1,
      resetTime,
    });
    return {
      success: true,
      remaining: maxRequests - 1,
      resetIn: windowSeconds,
    };
  }

  // Incrementar contador
  existing.count += 1;
  const remaining = Math.max(0, maxRequests - existing.count);
  const resetIn = Math.ceil((existing.resetTime - now) / 1000);

  // Verificar se excedeu limite
  if (existing.count > maxRequests) {
    return {
      success: false,
      remaining: 0,
      resetIn,
    };
  }

  return {
    success: true,
    remaining,
    resetIn,
  };
}

/**
 * Cria um rate limiter com configuração predefinida
 */
export function createRateLimiter(config: RateLimitConfig) {
  return (identifier: string) => rateLimit(identifier, config);
}

// Configurações padrão para diferentes tipos de endpoints
export const rateLimitConfigs = {
  /** APIs públicas: 30 req/min */
  public: { maxRequests: 30, windowSeconds: 60 },
  /** APIs autenticadas: 100 req/min */
  authenticated: { maxRequests: 100, windowSeconds: 60 },
  /** APIs sensíveis (login, etc): 5 req/min */
  sensitive: { maxRequests: 5, windowSeconds: 60 },
  /** APIs de escrita: 20 req/min */
  write: { maxRequests: 20, windowSeconds: 60 },
} as const;

/**
 * Helper para obter IP do cliente em API routes do Next.js
 */
export function getClientIP(request: Request): string {
  // Tentar headers comuns de proxy
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Fallback
  return 'unknown';
}

/**
 * Cria headers de resposta com informações de rate limit
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetIn),
  };
}
