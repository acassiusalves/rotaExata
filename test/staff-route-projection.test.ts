import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectStaffRoute, projectDispatchChoice, projectStaffService } from '../src/lib/server/staff/route-projection.ts';

test('projects only operational route and stop fields, preserving timestamp, ID and Lunna data',()=>{
  const source={
    id:'spoofed',name:'Rota',plannedDate:new Date('2026-11-19T10:00:00.123Z'),distanceMeters:8500,
    origin:{id:'origin',lat:1,lng:2,address:'Origem',unknown:'private'},
    stops:[{id:'stop',city:'Goiânia - GO',orderNumber:'P0123',unlinkedAt:new Date('2026-11-19T12:00:00Z'),
      payments:[{method:'pix',value:15,unknown:'private'}],driverPin:'private',items:[{id:'sku',description:'Item',quantity:2,secret:'private'}]}],
    driverInfo:{name:'Pessoa',vehicle:{type:'Carro',plate:'AAA0000',secret:'private'},secret:'private'},
    earningsSourceStart:{proof:'private'},fcmtoken:'private',
  };
  const row=projectStaffRoute('server-id',source);
  assert.equal(row.id,'server-id');
  assert.equal(row.plannedDate,'2026-11-19T10:00:00.123Z');
  assert.equal(row.origin?.address,'Origem');
  assert.equal(row.stops[0]?.city,'Goiânia - GO');
  assert.equal(row.stops[0]?.unlinkedAt,'2026-11-19T12:00:00.000Z');
  assert.equal(row.stops[0]?.items?.[0]?.description,'Item');
  assert.equal(JSON.stringify(row).includes('private'),false);
  assert.equal(source.id,'spoofed');
});

test('does not disclose dispatch fields for pending native profiles',()=>{
  assert.equal(projectDispatchChoice('pending',{role:'driver',nativeDriverProvisioningId:'test',nativeDriverReady:true}),null);
  assert.equal(projectDispatchChoice('staff',{role:'admin'}),null);
  const choice=projectDispatchChoice('driver',{role:'driver',displayName:'Driver',lastSeenAt:new Date('2026-11-19T10:00:00Z'),fcmToken:'private'});
  assert.equal(choice?.name,'Driver');
  assert.equal(choice?.lastSeenAt,'2026-11-19T10:00:00.000Z');
  assert.equal(JSON.stringify(choice).includes('private'),false);
});

test('uses distinct service list and planning projections without private fields',()=>{
  const input={code:'LN-001',stats:{totalRoutes:2,completedRoutes:1,completedDeliveries:1,unknown:'private'},allStops:[{id:'a',orderNumber:'P01',secret:'private'}],secret:'private'};
  assert.equal(projectStaffService('A', input, false).allStops,undefined);
  const planned=projectStaffService('A', input, true);
  assert.equal(planned.allStops?.[0]?.orderNumber,'P01');
  assert.equal(planned.stats?.totalRoutes,2);
  assert.equal(JSON.stringify(planned).includes('private'),false);
});

test('service board projects only the pre-dispatch fields needed by search',()=>{
  const service=projectStaffService('A',{allStops:[
    {customerName:'Cliente',address:'Rua',phone:'62910000000',orderNumber:'PED900',notes:'private',items:[{id:'item'}]},
  ]},false);
  assert.deepEqual(service.searchStops,[{customerName:'Cliente',address:'Rua',phone:'62910000000',orderNumber:'PED900'}]);
});
