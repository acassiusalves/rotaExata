import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staffWorkspaceKey,clearStaffWorkspace,claimStaffWorkspace,receiveWorkspaceOwnerChange } from '../src/lib/staff/workspace.ts';

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

function storage() {
  const rows=new Map<string,string>();
  return {get length(){return rows.size;},key:(index:number)=>[...rows.keys()][index] ?? null,
    getItem:(key:string)=>rows.get(key) ?? null,setItem:(key:string,value:string)=>{rows.set(key,value);},
    removeItem:(key:string)=>{rows.delete(key);}};
}

test('workspace survives involuntary reauthentication but is retired when the actor changes or leaves',()=>{
  const one=storage(),two=storage(),shared=storage();
  const a='operator-a',b='operator-b',scope='scope';
  const draft=staffWorkspaceKey(a,scope,'newRouteData');
  one.setItem(draft,'draft of A');
  two.setItem(draft,'other tab draft of A');
  claimStaffWorkspace(shared,one,a);
  claimStaffWorkspace(shared,one,a);
  assert.equal(one.getItem(draft),'draft of A');
  const oldOwner=claimStaffWorkspace(shared,one,b);
  assert.equal(oldOwner,a);
  receiveWorkspaceOwnerChange(two,oldOwner,b);
  assert.equal(one.getItem(draft),null);
  assert.equal(two.getItem(draft),null);
  const draftB=staffWorkspaceKey(b,scope,'newRouteData');
  two.setItem(draftB,'B');
  receiveWorkspaceOwnerChange(two,b,null);
  assert.equal(two.getItem(draftB),null);
});
