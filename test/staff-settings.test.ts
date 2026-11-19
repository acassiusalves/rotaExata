import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staffPermissionsCommand,staffSettingsCommand } from '../src/lib/staff/settings-contract.ts';

const policy={expectedRevision:null,pagePermissions:{'/financeiro/pagamentos':['admin','gestor']},inactivePages:[]};
test('policy first creation uses null revision and prevents lockout or configuration outside Rota',()=>{
  assert.equal(staffPermissionsCommand.safeParse(policy).success,true);
  assert.equal(staffPermissionsCommand.safeParse({...policy,inactivePages:['/permissions']}).success,false);
  assert.equal(staffPermissionsCommand.safeParse({...policy,pagePermissions:{'/settings':['socio']}}).success,false);
  assert.equal(staffPermissionsCommand.safeParse({...policy,pagePermissions:{'/users/all':['admin']}}).success,false);
  assert.equal(staffPermissionsCommand.safeParse({...policy,pagePermissions:{'/financeiro/pagamentos':['vendedor','admin']}}).success,false);
});
test('general and origin settings are distinct closed commands',()=>{
  assert.equal(staffSettingsCommand.safeParse({kind:'delivery',expectedRevision:null,enabled:true,maxDistance:0.5}).success,true);
  assert.equal(staffSettingsCommand.safeParse({kind:'delivery',expectedRevision:null,enabled:true,maxDistance:10.1}).success,false);
  assert.equal(staffSettingsCommand.safeParse({kind:'delivery',expectedRevision:null,enabled:true,maxDistance:1,apiKey:'foreign'}).success,false);
});
