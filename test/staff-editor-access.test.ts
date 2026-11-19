import assert from 'node:assert/strict';
import test from 'node:test';
import { staffEditorSurface,staffEditorPath,staffPathAllowed } from '../src/lib/staff/access.ts';

test('editor follows the explicit leaf and actual dynamic path rather than only the parent',()=>{
  const actor={role:'gestor' as const,
    policy:{pagePermissions:{'/routes':['admin'],'/routes/organize':['gestor'],'/routes/r-1/acompanhar':['gestor']},inactivePages:[]},
    rotaPolicy:{pagePermissions:{},inactivePages:[]}};
  assert.equal(staffPathAllowed(actor,'/routes/organize'),true);
  assert.equal(staffPathAllowed(actor,'/routes/service/s-1/organize'),true);
  assert.equal(staffPathAllowed(actor,'/routes/r-1/acompanhar'),true);
  assert.equal(staffPathAllowed(actor,'/routes/r-2/acompanhar'),false);
  assert.equal(staffPathAllowed({...actor,policy:{...actor.policy,inactivePages:['/routes']}},'/routes/organize'),false);
  assert.equal(staffPathAllowed({...actor,policy:{...actor.policy,inactivePages:['/routes/service/s-1/organize']}},'/routes/service/s-1/organize'),false);
  assert.deepEqual(staffEditorSurface('/routes/service/s-1/organize'),{view:'service-organize',anchor:'s-1'});
  assert.equal(staffEditorPath({view:'route-follow',anchor:'../r-1'}),null);
});
