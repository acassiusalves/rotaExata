import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeSessionRequest } from '../src/lib/earnings/session-request.ts';

const token='current';
const session=new AbortController();
function dependencies(options: Partial<Parameters<typeof nativeSessionRequest>[2]> = {}) {
  return {
    token:async()=>token,
    authorizeWrite:()=>true,
    isCurrent:()=>true,
    sessionSignal:session.signal,
    fetch:async(_:RequestInfo|URL,init?:RequestInit)=>{
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer current');
      assert.equal(init?.redirect,'error');
      return Response.json({ok:true});
    },
    ...options,
  };
}

test('uses only same-origin API destinations for the bearer',async()=>{
  assert.deepEqual(await nativeSessionRequest('/api/staff/session',undefined,dependencies()),{ok:true});
  for (const path of ['https://host.invalid/api/staff/session','//host.invalid/api','/api/../../outside','/api/\\a']) {
    await assert.rejects(nativeSessionRequest(path,undefined,dependencies()),{status:400});
  }
});

test('blocks replies from a previous session even when fetch raced logout or ignored abort',async()=>{
  let current=true;
  const promise=nativeSessionRequest('/api/staff/session',undefined,dependencies({
    isCurrent:()=>current,
    fetch:async()=>{
      current=false;
      return Response.json({previous:true});
    },
  }));
  await assert.rejects(promise,{status:401});
});

test('aborts on session change and rejects writes while assurance refreshes',async()=>{
  await assert.rejects(nativeSessionRequest('/api/staff/routes',{method:'POST'},
    dependencies({authorizeWrite:()=>false})),{status:409});
  const replaced=new AbortController();
  await assert.rejects(nativeSessionRequest('/api/staff/routes',undefined,dependencies({
    sessionSignal:replaced.signal,
    fetch:async(_path,init)=>{
      assert.equal(init?.signal?.aborted,false);
      replaced.abort();
      assert.equal(init?.signal?.aborted,true);
      return Response.json({previous:true});
    },
  })),{status:401});
});
