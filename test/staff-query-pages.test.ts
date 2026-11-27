import assert from 'node:assert/strict';
import test from 'node:test';
import { collectStaffPages,staffPollDelay } from '../src/lib/staff/query-pages.ts';

test('staff requests walk every page and retain the latest projection without duplicating totals',async()=>{
  const rows=await collectStaffPages(async cursor=>cursor ?
    {items:[{id:'b',value:3},{id:'c',value:5}],cursor:null} :
    {items:[{id:'a',value:1},{id:'b',value:2}],cursor:'second'});
  assert.deepEqual(rows.map(row=>row.value),[1,3,5]);
  await assert.rejects(collectStaffPages(async()=>({items:[],cursor:'same'})));
  assert.ok(staffPollDelay(8000,1)>8000);
  assert.equal(staffPollDelay(8000,20),60_000);
});
