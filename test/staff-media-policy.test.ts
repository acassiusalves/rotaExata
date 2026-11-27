import assert from 'node:assert/strict';
import { test } from 'node:test';
import { staffPhotoViewForPath, staffRouteCanReadPhoto } from '../src/lib/staff/media-policy.ts';

const path='/api/driver/media/00000000-0000-4000-8000-000000000001';
const now=new Date('2026-11-20T02:59:00Z');
const prior={status:'completed',plannedDate:'2026-11-18T15:00:00Z',stops:[{photoUrl:path}]};
const current={...prior,status:'in_progress',plannedDate:'2026-11-19T13:00:00Z'};

test('requires a known staff page and a receipt path still linked to a route in that view',()=>{
  assert.equal(staffPhotoViewForPath('/routes/monitoring'),'monitor');
  assert.equal(staffPhotoViewForPath('/admin/erros'),null);
  assert.equal(staffRouteCanReadPhoto(current,path,'dashboard',now),true);
  assert.equal(staffRouteCanReadPhoto(prior,path,'dashboard',now),false);
  assert.equal(staffRouteCanReadPhoto(prior,path,'monitor',now),false);
  assert.equal(staffRouteCanReadPhoto(prior,path,'report',now),true);
  assert.equal(staffRouteCanReadPhoto({status:'in_progress',stops:[]},path,'monitor',now),false);
  assert.equal(staffRouteCanReadPhoto(undefined,path,'route',now),false);
});
