const REDACTED = '[redacted]';

const SENSITIVE_KEY_PATTERN =
  /(authorization|bearer|cookie|token|secret|password|senha|api[_-]?key|private[_-]?key|credential|refresh[_-]?token|access[_-]?token)/i;

const BEARER_PATTERN = /bearer\s+[a-z0-9._~+/=-]+/gi;
const TOKEN_LIKE_PATTERN = /\b[A-Za-z0-9_-]{32,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;

type SanitizeOptions = {
  maxDepth?: number;
  maxArrayLength?: number;
  maxStringLength?: number;
};

const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  maxDepth: 4,
  maxArrayLength: 50,
  maxStringLength: 4000,
};

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...[truncated]` : value;
}

function sanitizeString(value: string, maxLength: number) {
  return truncate(value.replace(BEARER_PATTERN, REDACTED).replace(TOKEN_LIKE_PATTERN, REDACTED), maxLength);
}

export function sanitizeUnknown(value: unknown, options: SanitizeOptions = {}, depth = 0): unknown {
  const resolved = { ...DEFAULT_OPTIONS, ...options };

  if (value == null) return value;

  if (typeof value === 'string') {
    return sanitizeString(value, resolved.maxStringLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name, 120),
      message: sanitizeString(value.message, resolved.maxStringLength),
      stack: value.stack ? sanitizeString(value.stack, resolved.maxStringLength) : undefined,
    };
  }

  if (depth >= resolved.maxDepth) {
    return '[max-depth]';
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, resolved.maxArrayLength)
      .map((item) => sanitizeUnknown(item, resolved, depth + 1));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(record).slice(0, resolved.maxArrayLength)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = REDACTED;
        continue;
      }

      sanitized[key] = sanitizeUnknown(item, resolved, depth + 1);
    }

    return sanitized;
  }

  return String(value);
}

function arrayToIndexedMap(items: unknown[]) {
  return items.reduce<Record<string, unknown>>((acc, item, index) => {
    acc[String(index)] = item;
    return acc;
  }, {});
}

export function sanitizeForFirestore(value: unknown, options: SanitizeOptions = {}, depth = 0, insideArray = false): unknown {
  const resolved = { ...DEFAULT_OPTIONS, ...options };

  if (value === undefined) return null;
  if (value === null) return null;

  if (typeof value === 'string') {
    return sanitizeString(value, resolved.maxStringLength);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return Number.isFinite(value) || typeof value === 'boolean' ? value : String(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Error) {
    return {
      name: sanitizeString(value.name, 120),
      message: sanitizeString(value.message, resolved.maxStringLength),
      stack: value.stack ? sanitizeString(value.stack, resolved.maxStringLength) : undefined,
    };
  }

  if (depth >= resolved.maxDepth) {
    return '[max-depth]';
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, resolved.maxArrayLength)
      .map((item) => sanitizeForFirestore(item, resolved, depth + 1, true));

    if (insideArray) {
      return {
        __type: 'array',
        length: value.length,
        items: arrayToIndexedMap(items),
      };
    }

    return items;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(record).slice(0, resolved.maxArrayLength)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        sanitized[key] = REDACTED;
        continue;
      }

      sanitized[key] = sanitizeForFirestore(item, resolved, depth + 1, insideArray);
    }

    return sanitized;
  }

  return String(value);
}

export function sanitizeText(value: unknown, maxLength = 4000) {
  if (typeof value !== 'string') return '';
  return sanitizeString(value.trim(), maxLength);
}
