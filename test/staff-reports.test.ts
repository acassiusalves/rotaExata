import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportSelectionSchema,reportCommandSchema,reportEvidenceInput,reportRouteDate} from '../src/lib/staff/reports-contract.ts';
import {defaultStaffPolicy,staffOperationAllowed} from '../src/lib/staff/access.ts';
import {historyResendSchema,historyRepairSchema} from '../src/lib/staff/history-contract.ts';

const revision='001700000000.000000000';
const commandId='f673df4e-d057-4f61-bf2a-37ff2a39105c';

test('report commands accept only the fields for their action and enforce unique stop indices',()=>{
  const command={kind:'reconcile',routeId:'r',revision,commandId,reconciled:true,stops:[{index:0,id:'s'}]};
  assert.equal(reportCommandSchema.safeParse(command).success,true);
  assert.equal(reportCommandSchema.safeParse({...command,userId:'forged'}).success,false);
  assert.equal(reportCommandSchema.safeParse({...command,stops:[...command.stops,...command.stops]}).success,false);
  assert.equal(reportCommandSchema.safeParse({...command,stops:[{index:0,id:'s',photoUrl:'file:///secret'}]}).success,false);
});

test('completed reports use the latest actual stop completion, with an exclusive end instant',()=>{
  const selection=reportSelectionSchema.parse({view:'general',clock:'completed',start:'2026-11-01T03:00:00.000Z',end:'2026-11-02T03:00:00.000Z'});
  const route={plannedDate:'2026-11-01T03:00:00.000Z',stops:[
    {completedAt:'2026-11-01T04:00:00.000Z'},{completedAt:'2026-11-02T03:00:00.000Z'},
  ]};
  assert.equal(reportRouteDate(route,selection),null);
  assert.equal(reportRouteDate({...route,stops:route.stops.slice(0,1)},selection),'2026-11-01T04:00:00.000Z');
  assert.equal(reportRouteDate(route,{...selection,clock:'planned'}),'2026-11-01T03:00:00.000Z');
});

test('AI derives its inputs from a completed stop with an eligible payment and a photo',()=>{
  const proof={deliveryStatus:'completed',photoUrl:'/api/driver/media/id',payments:[{method:'pix',value:59}],expectedValue:60};
  assert.deepEqual(reportEvidenceInput(proof),{photoUrl:'/api/driver/media/id',expectedValue:60});
  assert.equal(reportEvidenceInput({...proof,deliveryStatus:'failed'}),null);
  assert.equal(reportEvidenceInput({...proof,reconciled:true}),null);
  assert.equal(reportEvidenceInput({...proof,payments:[{method:'dinheiro',value:59}]}),null);
});

test('maintenance and resend contracts require revision and idempotency key',()=>{
  assert.equal(historyResendSchema.safeParse({routeId:'r',revision,commandId}).success,true);
  assert.equal(historyResendSchema.safeParse({routeId:'r',commandId}).success,false);
  assert.equal(historyRepairSchema.safeParse({commandId,routes:[{id:'r',revision}]}).success,true);
  assert.equal(historyRepairSchema.safeParse({commandId,routes:[{id:'r',revision},{id:'r',revision}]}).success,false);
});

test('report commands follow page policy and code repair/resend keep their staff role restrictions',()=>{
  const policy=defaultStaffPolicy;
  const manager={role:'gestor' as const,policy,rotaPolicy:policy};
  assert.equal(staffOperationAllowed(manager,'reports:edit'),true);
  assert.equal(staffOperationAllowed(manager,'route:resend'),false);
  assert.equal(staffOperationAllowed({...manager,role:'socio'},'route:resend'),true);
  assert.equal(staffOperationAllowed({...manager,role:'socio'},'routes:repair-codes'),false);
  assert.equal(staffOperationAllowed({...manager,role:'admin'},'routes:repair-codes'),true);
  const restricted={...manager,rotaPolicy:{...policy,inactivePages:['/reports/general','/history/rotas']}};
  assert.equal(staffOperationAllowed(restricted,'reports:reconcile'),false);
  assert.equal(staffOperationAllowed(restricted,'reports:numbers'),true);
  assert.equal(staffOperationAllowed({...restricted,role:'admin'},'route:resend'),false);
  assert.equal(staffOperationAllowed(restricted,'history:driver'),true);
});
