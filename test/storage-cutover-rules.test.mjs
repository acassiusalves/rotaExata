import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { renderStorageCutover } from '../scripts/render-storage-cutover.ts';

assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,'127.0.0.1:9198','Use only the isolated Storage emulator');
const projectId='demo-rotaexata-storage-cutover';
const bucket='gs://'+projectId+'.appspot.com';
const baseline=readFileSync(new URL('fixtures/storage-live-2026-11-18.rules',import.meta.url),'utf8');
const retired='synthetic-driver-a';
const image=new Uint8Array([137,80,78,71,13,10,26,10]);
const metadata={contentType:'image/png'};
const original='delivery-photos/synthetic-route/original.png';

function environment(rules) {
  return initializeTestEnvironment({projectId,storage:{host:'127.0.0.1',port:9198,rules}});
}

test('Storage fecha a coorte de tokens antigos e restaura a política anterior no rollback',async()=>{
  let env=await environment(baseline);
  try {
    const legacy=env.authenticatedContext(retired).storage(bucket);
    await assertSucceeds(legacy.ref(original).put(image,metadata));
    await assertSucceeds(legacy.ref(original).getMetadata());
    await env.cleanup();
    env=await environment(renderStorageCutover(baseline,{driverUids:[retired,'synthetic-driver-b']}));
    for (const uid of [retired,'synthetic-driver-b']) {
      const driver=env.authenticatedContext(uid).storage(bucket);
      await assertFails(driver.ref(original).getMetadata());
      await assertFails(driver.ref('delivery-photos/synthetic-route/driver-new.png').put(image,metadata));
    }
    const operator=env.authenticatedContext('synthetic-operator').storage(bucket);
    const anonymous=env.unauthenticatedContext().storage(bucket);
    await assertSucceeds(operator.ref(original).getMetadata());
    await assertSucceeds(operator.ref('delivery-photos/synthetic-route/operator.png').put(image,metadata));
    await assertFails(operator.ref('delivery-photos/synthetic-route/wrong-mime.bin').put(image,{contentType:'application/octet-stream'}));
    await assertFails(operator.ref('delivery-photos/synthetic-route/limit.png').put(new Uint8Array(5*1024*1024),metadata));
    await assertFails(anonymous.ref(original).getMetadata());
    await assertFails(anonymous.ref('delivery-photos/synthetic-route/anon.png').put(image,metadata));
    await assertFails(operator.ref('delivery-attempt-photos/synthetic-route/undeclared.png').put(image,metadata));
    await env.withSecurityRulesDisabled(async context=>{
      await assertSucceeds(context.storage(bucket).ref('delivery-photos/synthetic-route/stop/server.png').put(image,metadata));
    });

    await env.cleanup();
    env=await environment(baseline);
    const restored=env.authenticatedContext(retired).storage(bucket);
    await assertSucceeds(restored.ref(original).getMetadata());
    await assertSucceeds(restored.ref('delivery-photos/synthetic-route/rollback.png').put(image,metadata));
  } finally {
    await env.cleanup();
  }
});
