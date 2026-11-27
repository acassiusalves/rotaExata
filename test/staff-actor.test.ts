import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requireStaffActor, type StaffAuthority } from '../src/lib/server/staff/actor.ts';
import { allowedStaffPaths, staffReturnPath } from '../src/lib/staff/access.ts';

const issuer = 'http://127.0.0.1:61421/auth/v1';
const userId = '10000000-0000-4000-8000-000000000001';
const sessionId = '20000000-0000-4000-8000-000000000001';
const scopeId = '30000000-0000-4000-8000-000000000001';
const emptyPolicy = { pagePermissions: {}, inactivePages: [] };
const actor = {
  userId, sessionId, scopeId, name: 'Operador', revision: 3, policyRevision: 6,
  application: 'lunna', role: 'gestor', sourceProject: 'demo-rotaexata-driver', sourceUid: 'legacy-operator',
  policy: emptyPolicy,
};
function request(claims: Record<string, unknown> = {}) {
  const payload = Buffer.from(JSON.stringify({
    sub:userId,session_id:sessionId,iss:issuer,exp:1900000000,aud:'authenticated',role:'authenticated',aal:'aal1', ...claims,
  })).toString('base64url');
  return new Request('http://localhost?scopeId=forged&role=admin', { headers:{ authorization:'Bearer e30.' + payload + '.test' } });
}
function authority(resolved: unknown=actor): StaffAuthority {
  return {
    issuer, scopeId, sourceProject:'demo-rotaexata-driver', now:()=>1800000000000,
    verify:async()=>({id:userId}), resolve:async()=>resolved,
    readPolicy:async()=>emptyPolicy,
  };
}

test('uses the verified actor for scoped operations and authorizes the menu consistently', async () => {
  const trusted = await requireStaffActor(request({user_metadata:{role:'admin'}}), 'routes:list', authority());
  assert.equal(trusted.userId,userId);
  assert.equal(trusted.sourceUid,'legacy-operator');
  assert.equal(trusted.role,'gestor');
  assert.equal(allowedStaffPaths(trusted).includes('/routes'),true);
  assert.equal(allowedStaffPaths(trusted).includes('/settings'),false);
  assert.equal(allowedStaffPaths(trusted).includes('/financeiro/regras'),false);
  await assert.rejects(requireStaffActor(request(),'route:complete',authority()), {status:403});
});

test('denies driver, delegated, Firebase and insufficient MFA access', async () => {
  await assert.rejects(requireStaffActor(request(),'routes:list',authority({...actor,role:'driver'})),{status:403});
  await assert.rejects(requireStaffActor(request({client_id:'delegated'}),'routes:list',authority()),{status:403});
  await assert.rejects(requireStaffActor(request({iss:'https://securetoken.google.com/demo-rotaexata-driver'}),'routes:list',authority()),{status:401});
  const withFactor = {...authority(),verify:async()=>({id:userId,factors:[{status:'verified'}]})};
  await assert.rejects(requireStaffActor(request(),'routes:list',withFactor),{status:403});
  assert.equal((await requireStaffActor(request({aal:'aal2'}),'routes:list',withFactor)).sessionId,sessionId);
});

test('denies revoked, wrong scope, wrong source project and disabled profiles', async () => {
  await assert.rejects(requireStaffActor(request(),'routes:list',authority({errorCode:'platform_session_revoked'})),{status:401});
  await assert.rejects(requireStaffActor(request(),'routes:list',authority({...actor,scopeId:userId})),{status:403});
  await assert.rejects(requireStaffActor(request(),'routes:list',authority({...actor,sourceProject:'demo-other'})),{status:403});
  await assert.rejects(requireStaffActor(request(),'routes:list',authority({errorCode:'platform_access_denied'})),{status:403});
});

test('intersects current Rota and canonical policy; a parent restriction or inactive page cannot be bypassed on deep links', async () => {
  const admin = {...actor,role:'admin'};
  const parentInactive = authority({...admin,policy:{pagePermissions:{},inactivePages:['/routes']}});
  await assert.rejects(requireStaffActor(request(),'route:create',parentInactive),{status:403});
  const restricted = {...authority(),readPolicy:async()=>({pagePermissions:{'/routes':['admin']},inactivePages:[]})};
  await assert.rejects(requireStaffActor(request(),'route:edit',restricted),{status:403});
  assert.equal(allowedStaffPaths(await requireStaffActor(request(),'session',restricted)).includes('/routes'),false);
  const outage = {...authority(),readPolicy:async()=>{throw new Error('unavailable');}};
  await assert.rejects(requireStaffActor(request(),'routes:list',outage),{status:503});
});

test('returns only to known staff destinations while preserving filters', () => {
  assert.equal(staffReturnPath('/routes/abc/acompanhar?tab=live'),'/routes/abc/acompanhar?tab=live');
  assert.equal(staffReturnPath('/financeiro/regras'),'/financeiro/regras');
  assert.equal(staffReturnPath('//evil.invalid/adm'),null);
  assert.equal(staffReturnPath('/driver/conta'),null);
  assert.equal(staffReturnPath('/api/staff/session'),null);
});

test('explicit leaf policy overrides the parent role list, but never a disabled ancestor',async()=>{
  const policy={pagePermissions:{'/routes':['admin'],'/routes/new':['gestor']},inactivePages:[]};
  assert.equal((await requireStaffActor(request(),'route:create',authority({...actor,policy}))).role,'gestor');
  await assert.rejects(requireStaffActor(request(),'route:create',authority({...actor,policy:{...policy,inactivePages:['/routes']}})),{status:403});
});
