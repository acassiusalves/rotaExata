import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeEnvelope, routeFacts, plannedFingerprint, protectCompletion, sourceSnapshot } from '../lib/earnings-source-adapter.js';

const stop = { id: 'stop-1', lat: 0, lng: 0, city: 'Goiânia', state: 'GO', customerName: 'Never synced' };
const route = { driverId: 'driver-a', distanceMeters: 12500, status: 'in_progress', stops: [stop] };
const workedAt = '2026-11-18T14:30:00.000Z';

describe('durable finance event', () => {
  it('derives stable revision and signature independent from GPS and client-only details', () => {
    const old = { seconds: 1795000000, nanoseconds: 10 };
    const result = makeEnvelope('demo-rotaexata-driver', 'r1', old, 'snapshot', route);
    assert.equal(result.sourceRevision, '001795000000.000000010');
    assert.equal(result.factsFingerprint, makeEnvelope('demo-rotaexata-driver','r1',old,'snapshot', {
      ...route, currentLocation: { lat: 12, lng: 8 }, stops: [{ ...stop, customerName: 'Different' }],
    }).factsFingerprint);
    assert.ok(!JSON.stringify(result).includes('Never synced'));
  });
  it('requires exact server-confirmed stop outcomes and an unchanged assignment for a proof', () => {
    const started = { ...route, earningsSourceStart: { driverUid: 'driver-a', plan: plannedFingerprint(route), confirmations: {} } };
    const closed = { ...started, status: 'completed', completedAt: workedAt, stops: [{ ...stop, deliveryStatus: 'completed', completedAt: workedAt }] };
    assert.equal(protectCompletion(closed, 'driver-server-v1'), undefined);
    closed.earningsSourceStart.confirmations = { 'id:stop-1': { status: 'completed', visited: null, workedAt } };
    const marker = protectCompletion(closed, 'driver-server-v1');
    assert.ok(marker);
    assert.equal(routeFacts({ ...closed, earningsSourceCompletion: marker }).evidence, 'driver-server-v1');
    assert.equal(routeFacts({ ...closed, driverId: 'driver-b', earningsSourceCompletion: marker }).evidence, null);
  });
});

it('holds the dispatch distance sentinel and preserves administrative completion in the next month', () => {
  const finalized = { ...route, status:'completed', completedAt:'2026-12-01T03:02:00.000Z',
    encodedPolyline:'', duration:'0s', distanceMeters:0,
    stops:[{ ...stop, deliveryStatus:'completed',completedAt:'2026-12-01T02:58:00.000Z' }] };
  assert.equal(routeFacts(finalized).distanceMeters,null);
  const related = { ...finalized, earningsSourceStart:{ driverUid:'driver-a',plan:plannedFingerprint(finalized),
    confirmations:{ 'id:stop-1':{ status:'completed',visited:null,workedAt:'2026-12-01T02:58:00.000Z' } } } };
  assert.equal(routeFacts(sourceSnapshot(related,{start:related.earningsSourceStart})).evidence,null);
  const marker=protectCompletion(related,'admin-server-v1');
  assert.ok(marker);
  const evidence = routeFacts({...related,earningsSourceCompletion:marker});
  assert.equal(evidence.workedAt,'2026-12-01T03:02:00.000Z');
  assert.equal(evidence.evidence,'admin-server-v1');
});
