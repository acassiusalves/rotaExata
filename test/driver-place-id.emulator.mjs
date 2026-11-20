import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const project='demo-rotaexata-driver';
const authOrigin='http://127.0.0.1:61421';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8181');
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST,'127.0.0.1:9198');
assert.ok(process.env.ROTA_DRIVER_TEST_FIXTURE_DIR,'local GoTrue fixture directory required');
const fixture=name=>JSON.parse(readFileSync(join(process.env.ROTA_DRIVER_TEST_FIXTURE_DIR,name),'utf8'));
const settings=fixture('credentials.json');
const identities=fixture('browser-fixtures.json');
assert.equal(settings.API_URL,authOrigin);
assert.equal(identities.sourceProject,project);
Object.assign(process.env,{
  FIREBASE_PROJECT_ID:project,FIREBASE_STORAGE_BUCKET:project+'.appspot.com',
  NEXT_PUBLIC_ROTA_DRIVER_AUTH:'supabase',
  NEXT_PUBLIC_SUPABASE_URL:authOrigin,NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:settings.PUBLISHABLE_KEY,
  SUPABASE_EARNINGS_SECRET_KEY:settings.SERVICE_ROLE_KEY,
  ROTA_EARNINGS_SOURCE_PROJECT:project,ROTA_EARNINGS_SCOPE_ID:identities.scopeId,
});
const { getStorage }=await import('firebase-admin/storage');
const admin=await import('../src/lib/firebase/admin.ts');
const runtime=await import('../src/lib/server/driver/runtime.ts');
const contract=await import('../src/lib/driver/runtime-contract.ts');
const db=admin.adminDb;
const bucket=getStorage(admin.adminApp).bucket(process.env.FIREBASE_STORAGE_BUCKET);
const marker='TESTE-PLACE-ID';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jXeUAAAAASUVORK5CYII=';

async function localSession(kind) {
  const account=identities.users.find(row=>row.kind===kind);
  const response=await fetch(authOrigin+'/auth/v1/token?grant_type=password',{
    method:'POST',headers:{apikey:settings.PUBLISHABLE_KEY,'content-type':'application/json'},
    body:JSON.stringify({email:account.email,password:account.password}),
  });
  assert.equal(response.status,200);
  return {subject:account.legacySubject,token:(await response.json()).access_token};
}

function runtimeRequest(token,params,body) {
  const headers={authorization:'Bearer '+token};
  return runtime.serveDriverRuntime(new Request('http://localhost/api/driver/runtime'+(params ?? ''),body ? {
    method:'POST',headers:{...headers,'content-type':'application/json'},body:JSON.stringify(body),
  }:{headers}),'native');
}

async function assertResponse(res,status,code) {
  const body=await res.json();
  assert.equal(res.status,status,code ? 'expected '+code+'; got '+body?.code:'server returned '+body?.code);
  if (code) assert.equal(body.code,code);
  return body;
}

test('native upload and confirmation accept opaque Google Place IDs',{timeout:30_000},async t=>{
  const driver=await localSession('driver-a');
  const other=await localSession('driver-b');
  for (const account of [driver,other]) {
    const profile=db.collection('users').doc(account.subject);
    const seeded=await db.runTransaction(async tx=>{
      if ((await tx.get(profile)).exists) return false;
      tx.create(profile,{role:'driver',active:true,name:marker});
      return true;
    });
    if (seeded) t.after(()=>profile.delete());
  }
  for (const length of [171,259,603]) {
    const route=db.collection('routes').doc();
    const stop={id:'fixture-stop',orderNumber:marker+'-'+length,placeId:'ChIJ'+'A'.repeat(length-4),lat:0,lng:0};
    const mediaId=[];
    const commands=[];
    let attempt;
    const proof=db.collection('rotaEarningRouteEvidence').doc(route.id);
    await route.create({name:marker,status:'in_progress',driverId:driver.subject,stops:[stop]});
    try {
      const query='?resource=routes&id='+route.id;
      const {route:initial}=await assertResponse(await runtimeRequest(driver.token,query),200);
      assert.equal(initial.stops[0].placeId,stop.placeId);
      const targetStop={id:stop.id,orderNumber:stop.orderNumber,placeId:stop.placeId};
      const upload={kind:'upload',routeId:route.id,targetStop,mediaKind:'attempt',data:image};
      const command={action:'confirm',routeId:route.id,targetStop,requestId:randomUUID(),
        expectedRevision:initial.stops[0].driverRevision,media:{},patch:{
          deliveryStatus:'failed',notes:marker,failureReason:'Cliente recusou',wentToLocation:false,
          payments:null,deliveredItemIds:null,photoUrl:null,attemptPhotoUrl:null,
        }};
      const confirm=input=>runtimeRequest(driver.token,null,{kind:'route',command:input});
      await t.test('upload, '+length+' characters', async()=>{
        attempt=await assertResponse(await runtimeRequest(driver.token,null,upload),200);
        mediaId.push(attempt.id);
        assert.match(attempt.url,/^\/api\/driver\/media\//);
        const receipt=await db.doc('driverDeliveryMedia/'+attempt.id).get();
        assert.equal(receipt.get('uid'),driver.subject);
        assert.equal(receipt.get('routeId'),route.id);
        assert.equal(receipt.get('stopKey'),'order:'+stop.orderNumber.toLowerCase());
      });
      await t.test('non-visited refusal, '+length+' characters', async()=>{
        commands.push(command.requestId);
        const result=await assertResponse(await confirm(command),200);
        assert.equal(result.updatedStop.deliveryStatus,'failed');
        assert.equal(result.updatedStop.placeId,stop.placeId);
        assert.equal((await assertResponse(await confirm(command),200)).updatedStop.deliveryStatus,'failed');
      });
      if (length===171) await t.test('visited refusal uses the photo uploaded for the same driver and stop',async()=>{
        assert.ok(attempt);
        const {route:latest}=await assertResponse(await runtimeRequest(driver.token,query),200);
        const requestId=randomUUID();
        commands.push(requestId);
        const result=await assertResponse(await confirm({...command,requestId,
          expectedRevision:latest.stops[0].driverRevision,media:{attempt:attempt.id},
          patch:{...command.patch,wentToLocation:true,attemptPhotoUrl:attempt.url},
        }),200);
        assert.equal(result.updatedStop.wentToLocation,true);
        assert.equal(result.updatedStop.attemptPhotoUrl,attempt.url);
        assert.equal(result.updatedStop.placeId,stop.placeId);
      });
      if (length===603) await t.test('reject invalid type, stale or missing revision, missing proof, and different owner',async()=>{
        const {route:latest}=await assertResponse(await runtimeRequest(driver.token,query),200);
        const valid={...command,requestId:randomUUID(),expectedRevision:latest.stops[0].driverRevision};
        const wrongType={...targetStop,placeId:17};
        await assertResponse(await runtimeRequest(driver.token,null,{...upload,targetStop:wrongType}),422,'route_invalid_request');
        await assertResponse(await confirm({...valid,targetStop:wrongType}),400,'route_invalid_request');
        await assertResponse(await confirm({...valid,expectedRevision:undefined}),400,'route_invalid_request');
        await assertResponse(await confirm({...valid,expectedRevision:'a'.repeat(64)}),409,'route_stop_changed');
        await assertResponse(await confirm({...valid,patch:{...valid.patch,wentToLocation:true}}),422,'route_invalid_media');
        await assertResponse(await runtimeRequest(other.token,query),404,'route_not_found');
        await assertResponse(await runtimeRequest(other.token,null,{kind:'route',command:valid}),403,'route_access_denied');
        await assertResponse(await runtimeRequest(driver.token,null,{...upload,data:'x'.repeat(3_900_000)}),413,'earnings_request_too_large');
        await assertResponse(await confirm({...valid,patch:{...valid.patch,notes:'x'.repeat(70_000)}}),413,'earnings_request_too_large');
      });
    } finally {
      const audit=await db.collection('activity_log').where('routeId','==',route.id).get();
      await Promise.all([route.delete(),proof.delete(),
        ...audit.docs.map(doc=>doc.ref.delete()),
        ...commands.map(id=>db.doc('driverRouteCommands/'+createHash('sha256').update(JSON.stringify([driver.subject,route.id,id])).digest('hex')).delete()),
        ...mediaId.flatMap(id=>[
          db.doc('driverDeliveryMedia/'+id).delete(),
          bucket.file(contract.driverMediaObject(route.id,'order:'+stop.orderNumber.toLowerCase(),'attempt',id)).delete({ignoreNotFound:true}),
        ]),
      ]);
    }
  }
});
