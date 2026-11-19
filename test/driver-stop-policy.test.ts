import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stopConfirmationProblem, confirmationReplay, deliveryDistanceProblem } from '../src/lib/driver/stop-policy.ts';

test('C1 exige comprovante, visita explícita e motivo para uma ação em estado editável',()=>{
  const complete={deliveryStatus:'completed',photoUrl:null,attemptPhotoUrl:null,reason:null,visited:null} as const;
  assert.equal(stopConfirmationProblem('in_progress',complete),'route_invalid_media');
  assert.equal(stopConfirmationProblem('dispatched',{...complete,photoUrl:'https://cdn.example.test/legacy'}),'route_invalid_state');
  assert.equal(stopConfirmationProblem('in_progress',{...complete,photoUrl:'https://cdn.example.test/legacy'}),null);
  const failed={...complete,deliveryStatus:'failed',reason:'Cliente ausente'} as const;
  assert.equal(stopConfirmationProblem('in_progress',failed),'route_invalid_outcome');
  assert.equal(stopConfirmationProblem('in_progress',{...failed,visited:true}),'route_invalid_media');
  assert.equal(stopConfirmationProblem('in_progress',{...failed,visited:false}),null);
  assert.equal(stopConfirmationProblem('in_progress',{...failed,visited:false,reason:' '}),'route_invalid_outcome');
  assert.equal(deliveryDistanceProblem({lat:0,lng:0},{lat:0,lng:1},0.5),'route_delivery_distance');
  assert.equal(deliveryDistanceProblem({lat:0,lng:0},{lat:0,lng:0},0.5),null);
  assert.equal(deliveryDistanceProblem(undefined,{lat:0,lng:0},0.5),'route_delivery_location');
});

test('I5 replay vincula o request ID ao payload e distingue uma edição desatualizada',()=>{
  const previous={digest:'first',response:{stopIndex:1}};
  assert.equal(confirmationReplay(previous,'first','stale','current'),'replay');
  assert.equal(confirmationReplay(previous,'changed','current','current'),'conflict');
  assert.equal(confirmationReplay(undefined,'first','stale','current'),'stale');
  assert.equal(confirmationReplay(undefined,'first','current','current'),'new');
});
