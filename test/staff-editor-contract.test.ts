import assert from 'node:assert/strict';
import test from 'node:test';
import { staffEditorReadSchema,staffEditorCommandSchema } from '../src/lib/staff/editor-contract.ts';

test('editor only accepts operational selections with bounded parameters',()=>{
  assert.equal(staffEditorReadSchema.safeParse({kind:'orders',numbers:['LNS-01']}).success,true);
  assert.equal(staffEditorReadSchema.safeParse({kind:'orders',numbers:['LNS-01'],collection:'users'}).success,false);
  assert.equal(staffEditorReadSchema.safeParse({kind:'orders',numbers:Array(31).fill('LNS-01')}).success,false);
  assert.equal(staffEditorReadSchema.safeParse({kind:'scheduled',date:'2026-11-19'}).success,true);
  assert.equal(staffEditorReadSchema.safeParse({kind:'scheduled',date:'2026-02-30'}).success,false);
});

test('editor rejects execution fields in a saved arrangement and unknown mutations',()=>{
  const write={kind:'arrange',routeId:'draft-1',revision:'001795000111.000000001',commandId:'b35d9a15-1455-4147-9359-70cfb8761cc7',routes:[]};
  assert.equal(staffEditorCommandSchema.safeParse(write).success,true);
  assert.equal(staffEditorCommandSchema.safeParse({...write,driverId:'employee'}).success,false);
  assert.equal(staffEditorCommandSchema.safeParse({...write,kind:'deleteOrder'}).success,false);
});
