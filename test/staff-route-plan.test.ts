import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staffPlanBatchSchema } from '../src/lib/staff/route-plan-contract.ts';

const base={
  commandId:'70000000-0000-4000-8000-000000000001',
  existingPlans:[{
    routeId:'route-one',expectedStatus:'draft',baseStops:[{id:'s1'}],
    plannedStops:[{id:'s1',address:'Teste',lat:-16.6,lng:-49.2,_originalStopKey:'id:s1'}],
    metadata:{status:'dispatched',driverId:'d1'},
  }],
};

test('transport accepts plan and assignment but excludes financial, session and execution facts',()=>{
  assert.equal(staffPlanBatchSchema.safeParse(base).success,true);
  for (const metadata of [{status:'completed'},{serviceId:'other'},{driverInfo:{name:'fake'}},
      {earningsSourceStart:{driverUid:'fake'}},{driverId:'target',completedAt:'fake'}]) {
    assert.equal(staffPlanBatchSchema.safeParse({...base,existingPlans:[{...base.existingPlans[0],metadata}]}).success,false);
  }
  assert.equal(staffPlanBatchSchema.safeParse({...base,existingPlans:[
    {...base.existingPlans[0],plannedStops:[{id:'s1',deliveryStatus:'completed'}]},
  ]}).success,false);
  assert.equal(staffPlanBatchSchema.safeParse({...base,existingPlans:[base.existingPlans[0],base.existingPlans[0]]}).success,false);
});
