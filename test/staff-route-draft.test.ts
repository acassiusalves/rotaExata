import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staffRouteDraftSchema } from '../src/lib/staff/route-contract.ts';

test('draft inputs preserve planned data and reject route/stop execution fields',()=>{
  const place={id:'test',placeId:'origin',address:'Rua A',lat:-16.67,lng:-49.25,timeWindowStart:'08:30'};
  const input={
    commandId:'20000000-0000-4000-8000-000000000001',name:'Teste CSV',origin:place,
    stops:[{...place,id:'stop',orderNumber:'P0123',notes:'Campainha'}],plannedDate:'2026-11-19T13:00:00.000Z',
    routeDate:'2026-11-19T12:00:00.000Z',routeTime:'10:00',
  };
  assert.equal(staffRouteDraftSchema.parse(input).stops[0].orderNumber,'P0123');
  assert.equal(staffRouteDraftSchema.safeParse({...input,status:'completed'}).success,false);
  assert.equal(staffRouteDraftSchema.safeParse({...input,driverId:'elsewhere'}).success,false);
  assert.equal(staffRouteDraftSchema.safeParse({...input,stops:[{...place,deliveryStatus:'completed'}]}).success,false);
  assert.equal(staffRouteDraftSchema.safeParse({...input,stops:[{...place,lat:100}]}).success,false);
});
