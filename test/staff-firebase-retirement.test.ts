import assert from 'node:assert/strict';
import test from 'node:test';
import { clearLegacyRotaWebStorage } from '../src/lib/staff/legacy-browser-session.ts';

test('cutover removes only the old Firebase credentials of this Rota build',()=>{
  const stored=new Map([
    ['firebase:authUser:rota-key:[DEFAULT]','expired'],
    ['firebase:redirectUser:rota-key:impersonation-app','expired'],
    ['firebase:pendingRedirect:rota-key:[DEFAULT]','expired'],
    ['firebase:authUser:external-key:[DEFAULT]','untouched'],
    ['firebase:authUser:rota-key:another-app','untouched'],
    ['rotaexata-platform-auth','untouched'],
  ]);
  const storage={removeItem:(key:string)=>{stored.delete(key);}};
  clearLegacyRotaWebStorage(storage,'rota-key');
  assert.deepEqual([...stored.keys()],['firebase:authUser:external-key:[DEFAULT]','firebase:authUser:rota-key:another-app','rotaexata-platform-auth']);
});
