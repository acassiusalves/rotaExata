import assert from 'node:assert/strict';
import test from 'node:test';
import { provisionDriver,finishDriverOnboarding,driverDispatchPatch,driverProjectionPatch } from '../src/lib/server/driver/onboarding-workflow.ts';
import type { DriverProvision,ProvisionStep } from '../src/lib/driver/provisioning-contract.ts';

const pending:DriverProvision={
  commandId:'11111111-1111-4111-8111-111111111111',userId:'22222222-2222-4222-8222-222222222222',
  name:'Motorista sintético',email:'native-driver@example.test',sourceProject:'demo-rotaexata-driver',phone:'11911112222',state:'reserved',revision:0,
};

test('Auth timeout is reconciled by reserved UUID and marker, without using another account with the same email',async()=>{
  let created=0;
  let lookup=0;
  const owned={id:pending.userId,email:pending.email,app_metadata:{rota_driver_provisioning:pending.commandId}};
  const effects:string[]=[];
  const result=await provisionDriver(pending,{
    lookup:async()=> ++lookup===1 ? null : owned,
    create:async()=>{created++;throw new Error('response lost');},
    project:async(_,state)=>{effects.push(state);},
    prepare:async(row)=>({...row,state:'awaiting_access',revision:row.revision+1}),
  });
  assert.equal(created,1);
  assert.equal(lookup,2);
  assert.equal(result.state,'awaiting_access');
  assert.deepEqual(effects,['pending']);
  await assert.rejects(()=>provisionDriver(pending,{
    lookup:async()=>({...owned,app_metadata:{}}),
    create:async()=>assert.fail('existing account'),
    project:async()=>assert.fail('mismatched identity'),
    prepare:async()=>assert.fail('mismatched identity'),
  }),{code:'driver_provision_identity_conflict'});
});

test('the source stays out of dispatch until canonical activation and resumes an interrupted publish without password update',async()=>{
  const calls:string[]=[];
  let row={...pending,state:'awaiting_access' as const,revision:1,passwordSet:false};
  const statuses:Record<ProvisionStep,DriverProvision['state']>={activate:'publishing',publish:'assignable',settle:'complete'};
  let current:DriverProvision & {passwordSet:boolean}=row;
  let failOnce=true;
  const authority={
    changePassword:async()=>{calls.push('password');current={...current,passwordSet:true};},
    project:async(_:DriverProvision,state:string)=>{
      calls.push(state);
      if (state==='assignable' && failOnce) {failOnce=false;throw new Error('source offline');}
    },
    progress:async(action:ProvisionStep,input:DriverProvision)=>{
      assert.equal(input.revision,current.revision);
      calls.push(action);
      current={...current,state:statuses[action],revision:current.revision+1};
      return current;
    },
  };
  await assert.rejects(()=>finishDriverOnboarding(row,'Senha-nunca-persistida',authority),/source offline/);
  assert.equal(current.state,'assignable');
  const result=await finishDriverOnboarding(current,undefined,authority);
  assert.equal(result.state,'complete');
  assert.deepEqual(calls,['password','activate','ready','publish','assignable','assignable','settle']);
});

test('activation with no password proof cannot touch the source or canonical membership',async()=>{
  await assert.rejects(()=>finishDriverOnboarding({...pending,state:'awaiting_access',passwordSet:false},undefined,{
    changePassword:async()=>assert.fail(),
    project:async()=>assert.fail(),
    progress:async()=>assert.fail(),
  }),{code:'driver_provision_password_required'});
});

test('only owned pending projections become discoverable and access commands fence assignment across retries',()=>{
  const base=driverProjectionPatch(pending,'pending',undefined)!;
  assert.equal(base.role,undefined);
  assert.equal(base.nativeDriverDispatchEnabled,false);
  assert.throws(()=>driverProjectionPatch(pending,'ready',{...base,nativeDriverProvisioningId:'mismatch'}),{code:'driver_provision_source_conflict'});
  const ready={...base,...driverProjectionPatch(pending,'ready',base)};
  const projected={...ready,...driverProjectionPatch(pending,'assignable',ready)};
  assert.equal(projected.role,'driver');
  assert.equal(projected.nativeDriverDispatchEnabled,true);
  const blocked={...projected,...driverDispatchPatch(projected,pending.commandId,1,false)};
  assert.equal(blocked.nativeDriverDispatchEnabled,false);
  assert.equal(blocked.nativeDriverDispatchFence,2);
  const reopened={...blocked,...driverDispatchPatch(blocked,pending.commandId,2,true)};
  assert.equal(reopened.nativeDriverDispatchEnabled,true);
  assert.equal(driverDispatchPatch(reopened,pending.commandId,2,true),null);
  const blockedAgain={...reopened,...driverDispatchPatch(reopened,pending.commandId,3,false)};
  assert.throws(()=>driverDispatchPatch(blockedAgain,pending.commandId,2,true),{code:'driver_account_revision_conflict'});
});
