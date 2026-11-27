import assert from 'node:assert/strict';
import test from 'node:test';
import { retainAuthorizedStaffData } from '../src/lib/staff/query-refresh.ts';
import { EarningsRequestError } from '../src/lib/earnings/session-request.ts';

test('online temporary failures retain data and explicit access failures or offline do not',()=>{
  for (const err of [new EarningsRequestError(503,'staff_unavailable'),new TypeError('Failed to fetch')]) {
    assert.equal(retainAuthorizedStaffData(err,true),true);
    assert.equal(retainAuthorizedStaffData(err,false),false);
  }
  assert.equal(retainAuthorizedStaffData(new EarningsRequestError(401,'staff_unauthorized'),true),false);
  assert.equal(retainAuthorizedStaffData(new EarningsRequestError(403,'staff_access_denied'),true),false);
});
