import assert from 'node:assert/strict';
import { test } from 'node:test';
import { driverOwnsRoute, driverMediaObject, serializeDriverRoute } from '../src/lib/driver/runtime-contract.ts';

test('driver projection never returns internal evidence, payment notes, or another assignment', () => {
  const route={driverId:'legacy-1',name:'Rota',code:'R1',status:'in_progress',earningsSourceStart:{driverUid:'uid'},stops:[
    {id:'s1',address:'Destino',deliveryStatus:'completed',lat:0,lng:0,internalSecret:'hidden'},
  ]};
  assert.equal(driverOwnsRoute(route,'legacy-2'),false);
  assert.equal(driverOwnsRoute(route,'legacy-1'),true);
  const view=serializeDriverRoute('route-1',route);
  assert.equal(view.stops[0].address,'Destino');
  assert.equal(view.stops[0].lat,0);
  assert.ok(!JSON.stringify(view).includes('internalSecret'));
  assert.ok(!JSON.stringify(view).includes('earningsSourceStart'));
});
test('media identifiers bind the object to the real route and stop', () => {
  assert.equal(driverMediaObject('r1','s1','delivery','e5b9bc74-4460-4d06-b9e4-629b2588011f'),
    'delivery-photos/r1/s1/e5b9bc74-4460-4d06-b9e4-629b2588011f');
  assert.throws(() => driverMediaObject('r1','../s1','delivery','invalid'));
});
