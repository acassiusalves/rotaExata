import type { RouteChangeNotification } from './types';

function normalizeFingerprintValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeFingerprintValue);
  if (!value || typeof value !== 'object') return value;

  const timestampLike = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof timestampLike.toMillis === 'function') {
    return { timestampMillis: timestampLike.toMillis() };
  }
  if (typeof timestampLike.seconds === 'number' && typeof timestampLike.nanoseconds === 'number') {
    return { seconds: timestampLike.seconds, nanoseconds: timestampLike.nanoseconds };
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeFingerprintValue(item)]),
  );
}

export function getRouteChangeNotificationFingerprint(
  notification: Pick<RouteChangeNotification, 'routeId' | 'driverId' | 'changes' | 'createdAt'>,
): string {
  return JSON.stringify(normalizeFingerprintValue({
    routeId: notification.routeId,
    driverId: notification.driverId,
    createdAt: notification.createdAt,
    changes: notification.changes,
  }));
}
