import assert from 'node:assert/strict';
import {test} from 'node:test';
import {locationRequestDelivery} from '../src/lib/driver/location-request.ts';

test('mantém revisão até ACK mesmo após falha de GPS ou rede',async()=>{
  let revision:string|null='old';
  const seen:string[]=[];
  const next=locationRequestDelivery(async()=>revision,async pending=>{
    seen.push(pending);
    if(seen.length===1) throw new Error('GPS offline');
    return seen.length>2;
  });
  await next();await next();await next();await next();
  assert.deepEqual(seen,['old','old','old']);
  revision='new';
  await next();
  assert.deepEqual(seen,['old','old','old','new']);
});
