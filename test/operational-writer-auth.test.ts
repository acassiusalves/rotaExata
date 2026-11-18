import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorizeOperationalWriter } from '../src/lib/firebase/operational-writer-auth.ts';

test('an operational writer requires a verified operator and never takes identity from the body', async () => {
  const request = new Request('http://localhost/api/import-lunna-orders',{
    method:'POST',headers:{Authorization:'Bearer verified'},body:JSON.stringify({userId:'forged'}),
  });
  const verify = async () => ({ uid:'verified-actor', provider:'password' });
  const readProfile = async () => ({ role:'gestor',active:true });
  assert.equal(await authorizeOperationalWriter(request,{verify,readProfile}),'verified-actor');
  await assert.rejects(authorizeOperationalWriter(new Request('http://localhost'),{verify,readProfile}),{status:401});
  await assert.rejects(authorizeOperationalWriter(request,{verify,readProfile:async () => ({role:'driver'})}),{status:403});
  await assert.rejects(authorizeOperationalWriter(request,{verify:async () => ({uid:'test',provider:'custom'}),readProfile}),{status:403});
});
