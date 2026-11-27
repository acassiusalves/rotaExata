import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {staffDirectoryCommandSchema} from '../src/lib/staff/directory-contract.ts';

test('staff profile metadata has a UI action and rejects identity and credential changes',()=>{
  const code=readFileSync('src/app/(admin)/permissions/page.tsx','utf8');
  assert.match(code,/Editar perfil/);
  const request={action:'edit_profile',targetId:'10000000-0000-4000-8000-000000000001',revision:2,
    commandId:'20000000-0000-4000-8000-000000000001',phoneRevision:2,sourceRevision:'001790000000.000000001',profile:{name:'Nome autorizado',phone:''}};
  assert.equal(staffDirectoryCommandSchema.safeParse(request).success,true);
  assert.equal(staffDirectoryCommandSchema.safeParse({...request,phoneRevision:undefined}).success,false);
  assert.equal(staffDirectoryCommandSchema.safeParse({...request,sourceRevision:undefined}).success,false);
  assert.equal(staffDirectoryCommandSchema.safeParse({...request,profile:{...request.profile,email:'other@example.test'}}).success,false);
  assert.equal(staffDirectoryCommandSchema.safeParse({...request,password:'fake'}).success,false);
});
