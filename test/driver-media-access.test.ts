import assert from 'node:assert/strict';
import {test} from 'node:test';
import {driverMayReadPhoto,protectedPhotoPath} from '../src/lib/driver/photo-policy.ts';

test('comprovante novo exige titular atual e referência da parada',()=>{
  const photo=protectedPhotoPath('e5b9bc74-4460-4d06-b9e4-629b2588011f');
  const route={driverId:'driver-b',stops:[{photoUrl:photo}]};
  assert.equal(driverMayReadPhoto('driver-a',route,photo),false);
  assert.equal(driverMayReadPhoto('driver-b',route,photo),true);
  assert.equal(driverMayReadPhoto('driver-b',{...route,stops:[{photoUrl:photo,unlinkedAt:'2026-11-18'}]},photo),false);
  assert.doesNotMatch(photo,/https|token=/);
});
