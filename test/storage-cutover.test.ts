import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderStorageCutover } from '../scripts/render-storage-cutover.ts';

const baseline = readFileSync(new URL('fixtures/storage-live-2026-11-18.rules', import.meta.url),'utf8');

test('compõe deterministicamente o bloqueio de leitura e escrita sobre a release ativa', () => {
  const rules=renderStorageCutover(baseline,{driverUids:['synthetic-driver-b','synthetic-driver-a']});
  assert.equal(rules,renderStorageCutover(baseline,{driverUids:['synthetic-driver-a','synthetic-driver-b']}));
  assert.match(rules,/request\.auth\.uid in \["synthetic-driver-a","synthetic-driver-b"\]/);
  assert.match(rules,/allow read: if isDeliveryPhotoClient\(\);/);
  assert.match(rules,/allow write: if isDeliveryPhotoClient\(\)\n\s+&& request\.resource\.size < 5 \* 1024 \* 1024/);
  assert.match(rules,/request\.resource\.contentType\.matches\('image\/\.\*'\)/);
  assert.doesNotMatch(rules,/firestore\.|delivery-attempt-photos/);
});

test('rejeita release divergente e manifesto vazio, ambíguo ou com UID fora do formato aceito', () => {
  assert.throws(()=>renderStorageCutover(baseline+'\n',{driverUids:['synthetic-driver']}),/baseline/);
  for (const manifest of [
    {driverUids:[]},
    {driverUids:['synthetic-driver','synthetic-driver']},
    {driverUids:['synthetic-driver"\n']},
    {driverUids:[42]},
    {driverUids:['synthetic-driver'],unrelated:true},
  ]) assert.throws(()=>renderStorageCutover(baseline,manifest),/manifesto/);
});
