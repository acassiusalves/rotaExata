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
  assert.equal(current.state,'complete');
  const result=await finishDriverOnboarding(current,undefined,authority);
  assert.equal(result.state,'complete');
  assert.deepEqual(calls,['password','activate','ready','publish','settle','assignable','assignable']);
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


test('canonical settlement must complete before the first discoverable projection is written',async()=>{
  const projections:string[]=[];
  const awaitingPublication:DriverProvision={...pending,state:'assignable',revision:3};
  await assert.rejects(()=>finishDriverOnboarding({...awaitingPublication,passwordSet:true},undefined,{
    changePassword:async()=>assert.fail(),
    project:async(_,stage)=>{projections.push(stage);},
    progress:async()=>{throw new Error('settle not committed');},
  }),/settle not committed/);
  assert.deepEqual(projections,[]);
});

test('initial publication respects a durable block before the Source role exists',()=>{
  const original=driverProjectionPatch(pending,'pending',undefined)!;
  const ready={...original,...driverProjectionPatch(pending,'ready',original)};
  const blocked={...ready,...driverDispatchPatch(ready,pending.commandId,1,false)};
  const exposed={...blocked,...driverProjectionPatch(pending,'assignable',blocked)};
  assert.equal(exposed.role,'driver');
  assert.equal(exposed.nativeDriverDispatchEnabled,false);
  assert.equal(exposed.nativeDriverDispatchFence,2);
});

test('a refreshed account exposes a safe explicit recovery path without remembering a command',async()=>{
  const workflow=await import('../src/lib/server/driver/onboarding-workflow.ts');
  const inspected=workflow.driverDispatchRecovery;
  const restore=workflow.restoreDriverDispatchPatch;
  assert.equal(typeof inspected,'function');
  assert.equal(typeof restore,'function');
  const suppressed={nativeDriverProvisioningId:pending.commandId,nativeDriverReady:true,role:'driver',
    nativeDriverDispatchEnabled:false,nativeDriverDispatchFence:2};
  // A build that closed PostgreSQL correctly, then lost Source on reactivation.
  assert.equal(inspected(suppressed,pending.commandId,3,true),'restore');
  assert.deepEqual(restore(suppressed,pending.commandId,3),{nativeDriverDispatchEnabled:true,nativeDriverDispatchFence:3});
  assert.equal(inspected({...suppressed,nativeDriverDispatchFence:4},pending.commandId,3,true),'finish_block');
  assert.throws(()=>restore({...suppressed,nativeDriverDispatchFence:4},pending.commandId,3),{code:'driver_account_revision_conflict'});
  assert.equal(inspected(suppressed,pending.commandId,2,false),'blocked');
});
