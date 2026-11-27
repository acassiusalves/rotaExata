import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postSupportStatement } from '../src/lib/server/earnings/support-statement.ts';

const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const scopeId = '70000000-0000-4000-8000-000000000001';
const issuer = 'http://localhost/auth/v1';
const emptyPolicy = {pagePermissions:{},inactivePages:[]};
const body = {sourceUid:'legacy-driver-a',month:'2026-11',reason:'  Conferir rota  '};
const actor = {userId,sessionId,scopeId,name:'Admin',revision:1,policyRevision:1,
  application:'lunna',role:'admin',sourceProject:'demo-rotaexata-sql',policy:emptyPolicy};
const statement = {rows:[],totals:{},progress:[],nextCursor:null,
  target:{sourceUid:body.sourceUid,driverId:'10000000-0000-4000-8000-000000000002',name:'Motorista A'}};

function request(input:unknown = body, claims:Record<string,unknown> = {}) {
  const payload = Buffer.from(JSON.stringify({sub:userId,session_id:sessionId,iss:issuer,
    exp:1900000000,aud:'authenticated',role:'authenticated',aal:'aal2',...claims})).toString('base64url');
  return new Request('http://localhost/api/financeiro/motoristas/extrato',{
    method:'POST',headers:{authorization:'Bearer e30.'+payload+'.test','content-type':'application/json'},
    body:JSON.stringify(input),
  });
}

function fixture(staff:unknown = actor, finance:unknown = actor, policy = emptyPolicy) {
  const identity = {issuer,scopeId,now:()=>1800000000000,verify:async()=>({id:userId,factors:[{status:'verified'}]})};
  let reads = 0;
  return {
    staff:{...identity,sourceProject:actor.sourceProject,resolve:async()=>staff,readPolicy:async()=>policy},
    finance:{...identity,resolve:async()=>finance},
    read:async(authorized:unknown, params:unknown)=>{
      reads++;
      assert.equal((authorized as typeof actor).sessionId,sessionId);
      assert.deepEqual(params,{p_source_uid:body.sourceUid,p_month:'2026-11-01',p_status:'pending',
        p_after_date:'2026-11-19T12:00:00+00:00',p_after_id:userId,p_limit:75,p_reason:'Conferir rota'});
      return statement;
    },
    reads:()=>reads,
  };
}

test('returns a private statement for the verified admin and forwards the complete page',async()=>{
  const f=fixture();
  const response=await postSupportStatement(request({...body,status:'pending',after:'2026-11-19T12:00:00+00:00',afterId:userId,limit:75}),f);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store, private');
  assert.equal(response.headers.get('vary'),'Authorization');
  assert.deepEqual(await response.json(),statement);
  assert.equal(f.reads(),1);
});

test('rejects roles, stale sessions, missing MFA, cross-scope authority and page restrictions before reading',async()=>{
  const denied = [
    [fixture({...actor,role:'socio'}),request(),403],
    [fixture({...actor,role:'gestor'}),request(),403],
    [fixture({...actor,role:'driver'}),request(),403],
    [fixture(),request(body,{aal:'aal1'}),403],
    [fixture({errorCode:'platform_session_revoked'}),request(),401],
    [fixture(actor,{errorCode:'platform_session_revoked'}),request(),401],
    [fixture(actor,{...actor,scopeId:userId}),request(),403],
    [fixture(actor,{...actor,role:'socio'}),request(),403],
    [fixture({...actor,policy:{...emptyPolicy,inactivePages:['/drivers']}}),request(),403],
    [fixture(actor,actor,{...emptyPolicy,inactivePages:['/financeiro']}),request(),403],
  ] as const;
  for(const [f,req,status] of denied) {
    const response=await postSupportStatement(req,f);
    assert.equal(response.status,status);
    assert.equal(response.headers.get('cache-control'),'no-store, private');
    assert.deepEqual(Object.keys(await response.json()),['code']);
    assert.equal(f.reads(),0);
  }
});

test('rejects invalid strict inputs without reading a statement',async()=>{
  for(const patch of [
    {scopeId}, {reason:'  '},{reason:'a'.repeat(1001)},{sourceUid:'a/b'},{sourceUid:'..'},{sourceUid:'a'.repeat(129)},
    {month:'2026-13'},{month:'1899-12'},{month:'2200-02'},{afterId:userId},{after:'2026-11-19T12:00:00Z'},
    {status:'processing'},{limit:101},{limit:'25'},
  ]) {
    const f=fixture();
    const response=await postSupportStatement(request({...body,...patch}),f);
    assert.equal(response.status,422,JSON.stringify(patch));
    assert.deepEqual(await response.json(),{code:'earnings_invalid_request'});
    assert.equal(f.reads(),0);
  }
});

test('rejects timestamps PostgreSQL cannot parse before requesting a statement',async()=>{
  for (const after of [
    '2026-11-19T12:00:00+16:00', '2026-11-19T12:00:00-16:00', '2026-11-19T12:00:00+99:99',
    '2026-11-19T12:00:00+00:90', '2026-11-19T12:00:00+0060', '2026-02-29T12:00:00Z',
    '0000-01-01T12:00:00Z',
  ]) {
    const f=fixture();
    const response=await postSupportStatement(request({...body,after,afterId:userId}),f);
    assert.equal(response.status,422,after);
    assert.deepEqual(await response.json(),{code:'earnings_invalid_request'});
    assert.equal(f.reads(),0);
  }
});

test('passes valid cursor timestamps through with their offset and microseconds intact',async()=>{
  for (const after of [
    '2026-11-19T12:00:00+15:59', '2026-11-19T12:00:00Z', '2024-02-29T12:00:00.123456-15:59',
    '2026-11-19T12:00:00.123456+1559',
  ]) {
    let forwarded:unknown;
    const response=await postSupportStatement(request({...body,after,afterId:userId}),{
      ...fixture(),
      read:async(_actor,params)=>{
        forwarded=params.p_after_date;
        return statement;
      },
    });
    assert.equal(response.status,200,after);
    assert.equal(forwarded,after);
  }
});
