import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlaceValue } from '../src/lib/types.ts';
import { draftMetricReader, storedRouteMetrics } from '../src/lib/service-draft-metrics.ts';

const point = (lat: number) => ({lat, lng: -49.25} as PlaceValue);
const origin = point(-16.7), a = point(-16.66), b = point(-16.64);
const missing = {status:'draft', distanceMeters:0, duration:'0s', encodedPolyline:''};
const old = {distanceMeters:5730, duration:'600s', encodedPolyline:'two-stops'};
const remaining = {distanceMeters:2180, duration:'240s', encodedPolyline:'one-stop'};

test('an empty draft displays zero distance, time and no polyline immediately', async () => {
  assert.deepEqual(storedRouteMetrics(missing, old, []), {distanceMeters:0, duration:'0s', encodedPolyline:''});
  const reader = draftMetricReader(async () => assert.fail('empty draft called router'));
  assert.equal(await reader.read('A', missing, origin, []), null);
});
test('recalculates only the remaining itinerary and reuses its result on a repeated snapshot', async () => {
  let calls = 0;
  const reader = draftMetricReader(async (from, stops) => {
    calls++;
    assert.equal(from, origin);
    assert.deepEqual(stops, [b]);
    return remaining;
  });
  for (let i = 0; i < 2; i++) assert.deepEqual(await reader.read('A', missing, origin, [b]), remaining);
  assert.equal(calls, 1);
});
test('a late calculation cannot restore a removed or replaced draft itinerary', async () => {
  const pending = Promise.withResolvers<typeof remaining>();
  const reader = draftMetricReader(async () => pending.promise);
  const obsolete = reader.read('A', missing, origin, [a]);
  assert.equal(await reader.read('A', missing, origin, []), null);
  pending.resolve(remaining);
  assert.equal(await obsolete, null);
});
