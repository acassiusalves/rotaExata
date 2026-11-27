import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { legacyRotaStaffAllowed } from '../lib/legacy-staff-cutover.js';

test('the Rota staff phase disables only Rota-exclusive legacy callable entry points',()=>{
  assert.equal(legacyRotaStaffAllowed(undefined),true);
  assert.equal(legacyRotaStaffAllowed({mode:'firebase'}),true);
  assert.equal(legacyRotaStaffAllowed({mode:'supabase'}),false);
  const source=readFileSync(new URL('../src/index.ts',import.meta.url),'utf8');
  const fenced=['inviteUser','deleteUser','resetUserPassword','updateDriverProfile','deleteRoute','updateRouteName',
    'updateRouteDriver','duplicateRoute','completeRoute','sendCustomNotification','forceLogoutDriver',
    'forceCleanupOfflineDrivers','generateDriverImpersonationToken','resendRouteToDriver','forceCompleteService'];
  for (const name of fenced) {
    const handler=source.split('export const '+name+' = onCall(')[1]?.split('export const ')[0];
    assert.match(handler ?? '',/await assertLegacyRotaStaffEnabled\(req\);/,name);
  }
  const shared=source.split('export const notifyRouteChanges = onCall(')[1].split('export const ')[0];
  assert.doesNotMatch(shared,/assertLegacyRotaStaffEnabled/);
});
