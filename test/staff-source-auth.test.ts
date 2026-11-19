import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refreshStaffSource, type SourceAuthority } from '../src/lib/server/staff/source-auth.ts';

const identity={userId:'10000000-0000-4000-8000-000000000001',sessionId:'20000000-0000-4000-8000-000000000001',
  scopeId:'70000000-0000-4000-8000-000000000001'};
const ready={...identity,sourceProject:'demo-rotaexata-driver',sourceUid:'source-operator',
  authority:'firebase',revision:2,policyRevision:4};

function authority(options:Partial<SourceAuthority>={}):SourceAuthority {
  return {
    context:async()=>ready,
    project:'demo-rotaexata-driver',
    read:async(_subject)=>({
      profile:{role:'manager',active:true},profileRevision:'001790000000.000000001',
      settings:{pagePermissions:{'/routes':['manager','partner']},inactivePages:[]},policyRevision:'001790000000.000000002',
    }),
    apply:async()=>({ok:true}),
    ...options,
  };
}

test('projects only current Source metadata against the exact verified issuer subject',async()=>{
  let subject:string|undefined;
  let payload:unknown;
  const source=authority({read:async uid=>{subject=uid;return authority().read(uid);},
    apply:async command=>{payload=command;return {ok:true};}});
  await refreshStaffSource(identity,source);
  assert.equal(subject,ready.sourceUid);
  assert.deepEqual(payload,{
    project:ready.sourceProject,sourceUid:ready.sourceUid,role:'gestor',sourceProfileRevision:'001790000000.000000001',
    policy:{pagePermissions:{'/routes':['gestor','socio']},inactivePages:[]},sourcePolicyRevision:'001790000000.000000002',
    profileRevision:2,policyRevision:4,
  });
});

test('denies wrong source project, inactive source, driver class and skips reads after authority cut',async()=>{
  await assert.rejects(refreshStaffSource(identity,authority({project:'demo-other'})),{status:403});
  const inactive=await authority().read();
  await assert.rejects(refreshStaffSource(identity,authority({read:async()=>({...inactive,profile:{role:'socio',active:false}})})),{status:403});
  await assert.rejects(refreshStaffSource(identity,authority({read:async()=>({...inactive,profile:{role:'driver',active:true}})})),{status:403});
  await refreshStaffSource(identity,authority({context:async()=>({...ready,authority:'supabase'}),
    read:async()=>{throw new Error('shim crossed authority gate');}}));
});

test('rechecks authority and Source on one revision conflict; closed on unresolved conflicts',async()=>{
  let count=0;
  await refreshStaffSource(identity,authority({apply:async()=>++count===1 ? {errorCode:'platform_version_conflict'}:{ok:true}}));
  assert.equal(count,2);
  await assert.rejects(refreshStaffSource(identity,authority({apply:async()=>({errorCode:'platform_version_conflict'})})),{status:503});
});
