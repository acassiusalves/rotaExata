import assert from 'node:assert/strict';
import { test } from 'node:test';
import { requiredEarningsFactors } from '../src/lib/earnings/mfa.ts';

test('an AAL1 session with an enrolled factor requires a challenge before loading finances', async () => {
  const enrolled = [
    { id:'verified-id',factor_type:'totp',status:'verified' },
    { id:'unused',factor_type:'totp',status:'unverified' },
  ];
  const client = {
    getAuthenticatorAssuranceLevel: async () => ({data:{currentLevel:'aal1',nextLevel:'aal2'},error:null}),
    listFactors: async () => ({data:{all:enrolled},error:null}),
  };
  assert.deepEqual(await requiredEarningsFactors(client),[{id:'verified-id',kind:'totp'}]);
  assert.deepEqual(await requiredEarningsFactors({...client,getAuthenticatorAssuranceLevel:async () =>
    ({data:{currentLevel:'aal2',nextLevel:'aal2'},error:null})}),[]);
});
