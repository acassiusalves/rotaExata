import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveStaffMapsLink } from '../src/lib/server/maps-link.ts';

test('long Maps URLs resolve without the retired legacy route or a remote request',async()=>{
  const url='https://www.google.com/maps/place/example/@-16.6,-49.2,16z';
  assert.deepEqual(await resolveStaffMapsLink(url,async()=>{throw new Error('unexpected provider request');}),
    {lat:-16.6,lng:-49.2,expandedUrl:url});
});

test('redirects may finish only on admitted Maps destinations',async()=>{
  let requests=0;
  await assert.rejects(resolveStaffMapsLink('https://maps.app.goo.gl/synthetic',async()=>{
    requests++;
    return new Response(null,{status:302,headers:{location:'https://example.invalid/redirect'}});
  }),{status:422});
  assert.equal(requests,1);
  const expanded='https://www.google.com.br/maps/place/example/@-16.6,-49.2,16z';
  const result=await resolveStaffMapsLink('https://maps.app.goo.gl/synthetic',async()=>new Response(null,{
    status:302,headers:{location:expanded},
  }));
  assert.equal(result.expandedUrl,expanded);
});
