import assert from 'node:assert/strict';
import {test} from 'node:test';
import {driverPushMessage} from '../lib/driver-push.js';

test('I7 emissor consulta a sessão e envia só IDs sem fallback nativo, inclusive revogação',async()=>{
  const bindingId='11111111-1111-4111-8111-111111111111';
  const target='synthetic-native';
  const doc={token:'synthetic-token',sourceUid:target,sessionId:'session-a',proof:'synthetic-proof'};
  const ref={get:async()=>({data:()=>doc})};
  let staged;
  const db={doc:()=>({get:async()=>({data:()=>({mode:'supabase',driverUids:[target]})})}),
    collection:()=>({doc:()=>ref}),
    runTransaction:work=>work({get:ref.get,update:(_r,value)=>{staged=value;}})};
  const legacy={token:doc.token,notification:{title:'private'},data:{routeId:'route-a',body:'private'}};
  const actualFetch=globalThis.fetch;
  const configured=process.env.ROTA_EARNINGS_EVENTS_URL;
  process.env.ROTA_EARNINGS_EVENTS_URL='https://example.test/api/internal/earnings/events';
  let valid=true;
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),'https://example.test/api/driver/push-delivery');
    assert.equal(options.redirect,'error');
    assert.deepEqual(JSON.parse(options.body),{bindingId,proof:doc.proof});
    return {ok:valid};
  };
  try {
    assert.equal(await driverPushMessage(db,target,{role:'driver'},legacy),null);
    const message=await driverPushMessage(db,target,{fcmSessionBindingId:bindingId},legacy);
    assert.ok(message);
    assert.deepEqual(Object.keys(message.data).sort(),['bindingId','boundPush','deliveryId']);
    assert.equal(message.notification,undefined);
    assert.equal(staged.deliveries[message.data.deliveryId].routeId,'route-a');
    valid=false;
    assert.equal(await driverPushMessage(db,target,{fcmSessionBindingId:bindingId},legacy),null);
    assert.equal((await driverPushMessage(db,'operator-other',{role:'admin'},legacy)).data.legacyPush,'1');
  } finally {
    globalThis.fetch=actualFetch;
    if (configured===undefined) delete process.env.ROTA_EARNINGS_EVENTS_URL;
    else process.env.ROTA_EARNINGS_EVENTS_URL=configured;
  }
});
