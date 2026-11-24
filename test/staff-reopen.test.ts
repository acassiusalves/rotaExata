import {test} from 'node:test';
import assert from 'node:assert/strict';
import {defaultStaffPolicy,staffOperationAllowed} from '../src/lib/staff/access.ts';
import {historyReopenSchema} from '../src/lib/staff/history-contract.ts';
import {serviceStatsAfterReopen} from '../src/lib/staff/service-after-reopen.ts';

const revision='001700000000.000000000';
const commandId='f673df4e-d057-4f61-bf2a-37ff2a39105c';
const valid={routeId:'r',revision,commandId,reason:'Parada pendente'};

test('reopen contract requires revision, idempotency key and a justified reason',()=>{
  assert.equal(historyReopenSchema.safeParse(valid).success,true);
  assert.equal(historyReopenSchema.safeParse({...valid,revision:undefined}).success,false);
  assert.equal(historyReopenSchema.safeParse({...valid,commandId:'nao-e-uuid'}).success,false);
  assert.equal(historyReopenSchema.safeParse({routeId:'r',revision,commandId}).success,false);
  assert.equal(historyReopenSchema.safeParse({...valid,reason:'  abc '}).success,false);
  assert.equal(historyReopenSchema.safeParse({...valid,reason:'x'.repeat(501)}).success,false);
});

test('reopen contract trims the reason and rejects fields the client must not choose',()=>{
  assert.equal(historyReopenSchema.parse({...valid,reason:'  Parada pendente  '}).reason,'Parada pendente');
  assert.equal(historyReopenSchema.safeParse({...valid,userId:'forged'}).success,false);
  assert.equal(historyReopenSchema.safeParse({...valid,status:'in_progress'}).success,false);
});

test('reopen is restricted to admin and socio and follows the history page policy',()=>{
  const policy=defaultStaffPolicy;
  const manager={role:'gestor' as const,policy,rotaPolicy:policy};
  assert.equal(staffOperationAllowed(manager,'route:reopen'),false);
  assert.equal(staffOperationAllowed({...manager,role:'socio'},'route:reopen'),true);
  assert.equal(staffOperationAllowed({...manager,role:'admin'},'route:reopen'),true);
  const restricted={...manager,role:'admin' as const,rotaPolicy:{...policy,inactivePages:['/history/rotas']}};
  assert.equal(staffOperationAllowed(restricted,'route:reopen'),false);
});

const finished=(id:string)=>({id,status:'completed',stops:[
  {deliveryStatus:'completed'},{deliveryStatus:'failed'},{deliveryStatus:'completed',unlinkedAt:'x'},
]});

test('a route that resumes in progress puts its service back in progress',()=>{
  const stats=serviceStatsAfterReopen([finished('a'),finished('b')],'b','in_progress');
  assert.deepEqual(stats,{status:'in_progress',completedRoutes:1,completedDeliveries:1});
});

test('a route reopened as dispatched leaves a service with a finished sibling partial',()=>{
  const stats=serviceStatsAfterReopen([finished('a'),finished('b')],'b','dispatched');
  assert.deepEqual(stats,{status:'partial',completedRoutes:1,completedDeliveries:1});
});

test('a service whose only route was reopened goes back to dispatched with no completions',()=>{
  const stats=serviceStatsAfterReopen([finished('a')],'a','dispatched');
  assert.deepEqual(stats,{status:'dispatched',completedRoutes:0,completedDeliveries:0});
});

test('another sibling already in progress keeps the service in progress',()=>{
  const stats=serviceStatsAfterReopen([{id:'a',status:'in_progress',stops:[]},finished('b')],'b','dispatched');
  assert.equal(stats.status,'in_progress');
  assert.equal(stats.completedRoutes,0);
});

test('auto-completed siblings count as finished and tolerate missing stops',()=>{
  const stats=serviceStatsAfterReopen([{id:'a',status:'completed_auto'},finished('b')],'b','dispatched');
  assert.deepEqual(stats,{status:'partial',completedRoutes:1,completedDeliveries:0});
});
