import assert from 'node:assert/strict';
import { test } from 'node:test';
import { availableRouteStops } from '../src/lib/route-stop-utils.ts';
import type { PlaceValue } from '../src/lib/types.ts';
import { draftMetricReader, storedRouteMetrics } from '../src/lib/service-draft-metrics.ts';
import { followRouteKey, reconcileFollowRouteStops } from '../src/lib/follow-route-snapshot.ts';

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

test('individual and service links identify the same persisted route independently of their slot', () => {
  const service = {A:'route-1', B:'route-2'};
  const others = [{key:'C',id:'route-3'}];
  assert.equal(followRouteKey('route-2','route-2',service,others),'A');
  assert.equal(followRouteKey('route-2',undefined,service,others),'B');
  assert.equal(followRouteKey('route-3',undefined,service,others),'C');
});

test('the visible sequence accepts a replacement and a removal even without more points', () => {
  const first = {...a,id:'first'};
  const second = {...b,id:'second'};
  const replacement = {...b,id:'replacement'};
  assert.deepEqual(reconcileFollowRouteStops([first,second],[replacement,second],null).stops,[replacement,second]);
  assert.deepEqual(reconcileFollowRouteStops([replacement,second],[replacement],null).stops,[replacement]);
});

test('snapshot rebasing keeps a pending sequence with the newest proof and flags a structural conflict', () => {
  const first = {...a,id:'first'};
  const second = {...b,id:'second'};
  const pending = [{...second,_wasMoved:true},first];
  const visited = {...second,arrivedAt:new Date(),notes:'Chegou'};
  const compatible = reconcileFollowRouteStops([first,second],[first,visited],pending);
  assert.equal(compatible.conflict,false);
  assert.deepEqual(compatible.pending,[{...visited,_wasMoved:true},first]);
  const replacement = {...b,id:'replacement'};
  const incompatible = reconcileFollowRouteStops([first,second],[replacement,second],pending);
  assert.equal(incompatible.conflict,true);
  assert.deepEqual(incompatible.stops,[replacement,second]);
  assert.equal(incompatible.pending,pending);
});

test('historical proof in a duplicate suppresses the same point and numeric legacy IDs still work', () => {
  const legacy = {...a,id:7} as unknown as PlaceValue;
  const pending = {...a,id:'pending'};
  const historical = {...pending,pointCode:'RT-0050-001',photoUrl:'/api/driver/media/fixture'};
  assert.deepEqual(availableRouteStops([pending,legacy,historical],[]),[legacy]);
});
