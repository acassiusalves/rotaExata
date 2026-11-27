import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { excludedPoolStopKeys, poolStopKeys } from '../../route-stop-utils.ts';
import type { PlaceValue } from '../../types';

export type PoolVisibility = {
  service: (id: string) => boolean;
  route: (document: DocumentSnapshot) => boolean;
};

export function storedPlaces(document: DocumentSnapshot | undefined, field: string): PlaceValue[] {
  const value = document?.get(field);
  return Array.isArray(value) ? value.filter(stop => stop && typeof stop === 'object') : [];
}

export function servicePoolState(
  target: DocumentSnapshot | undefined, siblings: DocumentSnapshot[], service?: DocumentSnapshot, visibility?: PoolVisibility,
) {
  const members = storedPlaces(service, 'allStops');
  const targetPool = storedPlaces(target, 'unassignedStops');
  const mirrors = siblings.map(doc => ({
    doc, stops: storedPlaces(doc, 'stops'), pool: storedPlaces(doc, 'unassignedStops'),
  }));
  const remainingMembers = new Set(members.filter(stop => !stop.unlinkedAt).flatMap(poolStopKeys));
  const unlinkedKeys: unknown = service?.get('unlinkedPoolStopKeys');
  const removed = Array.isArray(unlinkedKeys) ? unlinkedKeys.filter(key => !remainingMembers.has(key)) : [];
  const excluded = excludedPoolStopKeys([...members, ...mirrors.flatMap(row => row.pool)], removed);
  const readableMembers = !service || !visibility || visibility.service(service.id) ? members : [];
  const candidates = [
    ...readableMembers, ...targetPool,
    ...mirrors.filter(({ doc }) => doc.id !== target?.id && (!visibility || visibility.route(doc))).flatMap(row => row.pool),
  ];
  return { targetPool, members, candidates, mirrors, excluded };
}
