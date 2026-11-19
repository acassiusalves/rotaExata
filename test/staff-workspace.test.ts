import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staffWorkspaceKey,clearStaffWorkspace } from '../src/lib/staff/workspace.ts';

const user='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const scope='70000000-0000-4000-8000-000000000001';
const otherScope='70000000-0000-4000-8000-000000000002';

test('scope and actor isolate drafts and origins; clearing signed-out actor preserves other entries',()=>{
  const origin=staffWorkspaceKey(user,scope,'savedOrigins');
  const draft=staffWorkspaceKey(user,otherScope,'newRouteData');
  const remaining=staffWorkspaceKey(other,scope,'newRouteData');
  assert.notEqual(draft,staffWorkspaceKey(user,scope,'newRouteData'));
  assert.notEqual(draft,remaining);
  const rows=new Set(['newRouteData','savedOrigins',origin,draft,remaining,'other-setting']);
  clearStaffWorkspace({
    get length(){return rows.size;},
    key(index){return [...rows][index] ?? null;},
    removeItem(key){rows.delete(key);},
  },user);
  assert.deepEqual([...rows],[remaining,'other-setting']);
});
