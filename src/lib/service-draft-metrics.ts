import type { PlaceValue, RouteInfo } from './types';

type Metrics = Pick<RouteInfo, 'distanceMeters' | 'duration' | 'encodedPolyline'>;
type Stored = Partial<Metrics> & {status?: string};
const empty: Metrics = {distanceMeters: 0, duration: '0s', encodedPolyline: ''};

export function storedRouteMetrics(stored: Stored, previous: Metrics, stops: PlaceValue[]): Metrics {
  if (stored.status === 'draft' && !stops.length) return empty;
  return {
    distanceMeters: stored.distanceMeters ?? previous.distanceMeters,
    duration: stored.duration ?? previous.duration,
    encodedPolyline: stored.encodedPolyline ?? previous.encodedPolyline,
  };
}

export function routeGeometryKey(origin: PlaceValue, stops: PlaceValue[]) {
  return JSON.stringify([origin, ...stops].map(point => [point.lat, point.lng]));
}

// Keep calculations local to this subscription. A later snapshot supersedes any pending response.
export function draftMetricReader(compute: (origin: PlaceValue, stops: PlaceValue[]) => Promise<Metrics | null>) {
  const current = new Map<string, {key: string; result: Promise<Metrics | null>}>();
  return {
    clear(id: string) { current.delete(id); },
    async read(id: string, stored: Stored, origin: PlaceValue, stops: PlaceValue[]) {
      if (stored.status !== 'draft' || !stops.length || stored.encodedPolyline ||
          stored.distanceMeters !== 0 || ![origin,...stops].every(p => Number.isFinite(p.lat) && Number.isFinite(p.lng))) {
        current.delete(id);
        return null;
      }
      const key = routeGeometryKey(origin, stops);
      let entry = current.get(id);
      if (entry?.key !== key) {
        entry = {key, result: compute(origin, stops)};
        current.set(id, entry);
      }
      const metrics = await entry.result;
      if (current.get(id) !== entry) return null;
      if (!metrics?.encodedPolyline) {
        current.delete(id);
        return null;
      }
      return {distanceMeters: metrics.distanceMeters, duration: metrics.duration, encodedPolyline: metrics.encodedPolyline};
    },
  };
}
