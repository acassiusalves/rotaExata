'use client';

import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { routeRef, serviceRef, serviceRoutes, type useRouteEditor } from './use-route-editor';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { availableRouteStops, dedupeStops, excludedPoolStopKeys, getStopIdentityKey } from '@/lib/route-stop-utils';
import { reconcileFollowRouteStops } from '@/lib/follow-route-snapshot';
import { draftMetricReader, routeGeometryKey, storedRouteMetrics } from '@/lib/service-draft-metrics';

type Editor = ReturnType<typeof useRouteEditor>;
type Drafts = Record<string, PlaceValue[] | null>;
type RouteRow = Partial<RouteInfo> & { revision?: string; unassignedStops?: PlaceValue[]; origin?: PlaceValue };

type FollowOptions = {
  origin?: PlaceValue;
  routeId?: string;
  serviceId?: string;
  watch: Editor['watch'];
  compute: Editor['computeRoute'];
  getKey: (id: string) => string | undefined;
  getRoute: (key: string) => RouteInfo | null;
  updateRoute: (key: string, update: (previous: RouteInfo | null) => RouteInfo | null) => void;
  updateName: (key: string, name: string) => void;
  pending: Drafts;
  setPending: Dispatch<SetStateAction<Drafts>>;
  setPool: Dispatch<SetStateAction<PlaceValue[]>>;
  localRouteStops: PlaceValue[][];
  getBase: (id: string, fallback: PlaceValue[]) => PlaceValue[];
  remember: (id: string, stops: PlaceValue[]) => void;
  conflicts: Map<string, { key: string; base: PlaceValue[] }>;
  onConflict: () => void;
};

export function useFollowRouteSnapshots(options: FollowOptions) {
  const current = useRef(options);
  current.current = options;
  const { origin, routeId, serviceId, watch, compute, pending, conflicts } = options;
  const resumeMetrics = useRef<(() => void) | null>(null);

  useEffect(() => {
    for (const [id, { key }] of conflicts) if (!pending[key]) conflicts.delete(id);
    resumeMetrics.current?.();
  }, [pending, conflicts]);

  useEffect(() => {
    if (!origin || (!routeId && !serviceId)) return;
    const readers: (() => void)[] = [];
    const routes = new Map<string, RouteRow>();
    const metrics = draftMetricReader(compute);
    const waiting = new Map<string, { key: string; calculate: () => void }>();
    let members: PlaceValue[] = [];
    let serviceRoutesLoaded = !serviceId;
    let previousPoolKeys = new Set<string | null>();
    let active = true;

    function updatePool() {
      const assigned = Array.from(routes.values(), row => row.stops ?? []);
      const legacy = Array.from(routes.values()).flatMap(row => row.unassignedStops ?? []);
      const unlinked = excludedPoolStopKeys(members);
      const poolMembers = serviceRoutesLoaded ? members : [];
      const serverPool = availableRouteStops([...poolMembers, ...legacy], assigned, unlinked);
      const before = previousPoolKeys;
      previousPoolKeys = new Set(serverPool.map(getStopIdentityKey));
      const view = current.current;
      view.setPool(previous => availableRouteStops([
        ...serverPool, ...previous.filter(stop => !before.has(getStopIdentityKey(stop))),
      ], [...assigned, ...view.localRouteStops], unlinked));
    }

    function receive(id: string, row: RouteRow) {
      const previousRow = routes.get(id);
      if (row.revision && previousRow?.revision && row.revision < previousRow.revision) return;
      routes.set(id, row);
      const view = current.current;
      const key = view.getKey(id);
      if (!key || !row.stops) return;
      const route = view.getRoute(key);
      if (!route) return;
      if (row.name) view.updateName(key, row.name);
      const incoming = dedupeStops(row.stops.filter(stop => !stop.unlinkedAt));
      const draft = view.pending[key];
      const savedBase = view.getBase(id, route.stops);
      const next = reconcileFollowRouteStops(savedBase, incoming, draft);

      if (next.conflict) {
        if (!view.conflicts.has(id)) {
          view.conflicts.set(id, { key, base: savedBase });
          view.onConflict();
        }
      } else {
        view.conflicts.delete(id);
        if (draft) view.setPending(previous => previous[key] === draft ? { ...previous, [key]: next.pending } : previous);
      }
      view.remember(id, next.stops);
      view.updateRoute(key, previous => previous ? {
        ...previous,
        ...storedRouteMetrics(row, previous, next.stops),
        stops: next.stops,
        status: row.status ?? previous.status,
      } : previous);

      const routeOrigin = row.origin && Number.isFinite(row.origin.lat) ? row.origin : origin!;
      const geometry = routeGeometryKey(routeOrigin, incoming);
      const calculate = () => {
        void metrics.read(id, row, routeOrigin, incoming).then(result => {
          const latest = current.current;
          if (!active || !result || latest.pending[key] || !routes.has(id)) return;
          latest.updateRoute(key, previous => previous?.status === 'draft' &&
            routeGeometryKey(routeOrigin, previous.stops) === geometry ? { ...previous, ...result } : previous);
        }).catch(error => console.error('Erro ao calcular trajeto do rascunho:', error));
      };
      if (draft) {
        metrics.clear(id);
        waiting.set(id, { key, calculate });
      } else {
        waiting.delete(id);
        calculate();
      }
    }

    resumeMetrics.current = () => {
      for (const [id, { key, calculate }] of waiting) {
        if (current.current.pending[key]) continue;
        waiting.delete(id);
        calculate();
      }
    };

    const onError = (error: Error) => console.error('Erro ao sincronizar o planejamento:', error);
    if (routeId) readers.push(watch(routeRef(routeId), doc => {
      if (!doc.exists()) return;
      receive(doc.id, doc.data());
      updatePool();
    }, onError));
    if (serviceId) {
      readers.push(watch(serviceRoutes(serviceId), snapshot => {
        serviceRoutesLoaded = true;
        const changed = snapshot.docChanges();
        for (const { type, doc } of changed) {
          if (type === 'removed') {
            if (doc.id !== routeId) routes.delete(doc.id);
            metrics.clear(doc.id);
            waiting.delete(doc.id);
          } else receive(doc.id, doc.data());
        }
        updatePool();
      }, onError));
      readers.push(watch(serviceRef(serviceId), doc => {
        members = doc.exists() ? doc.data().allStops ?? [] : [];
        updatePool();
      }, onError));
    }
    return () => { active = false; resumeMetrics.current = null; readers.forEach(unsubscribe => unsubscribe()); };
  }, [routeId, serviceId, origin, watch, compute]);
}
