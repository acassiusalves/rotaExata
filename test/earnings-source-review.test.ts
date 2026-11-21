import assert from 'node:assert/strict';
import test from 'node:test';
import { factsHash,plannedFingerprint,protectCompletion,routeFacts,sourceSnapshot } from '../functions/src/earnings-source-adapter.ts';
import { sourceReviewDetails,prepareSourceReview } from '../src/lib/server/earnings/source-reviews.ts';
import { sourceReviewConfirmSchema } from '../src/lib/earnings/source-review-contract.ts';

const workedAt='2026-11-20T14:00:00.000Z';
const startedAt='2026-11-20T12:00:00.000Z';
const workedStopAt='2026-11-20T13:00:00.000Z';
const eventId='a'.repeat(64);
const sourceRevision='001795000000.123456780';
const watermark='001795000000.123456782';
const readRevision='001795000000.123456789';
const actor={userId:'10000000-0000-4000-8000-000000000001',sessionId:'20000000-0000-4000-8000-000000000001',scopeId:'70000000-0000-4000-8000-000000000001'};
const route={
  code:'RT-SYNTHETIC',driverId:'demo-driver',status:'completed',completedAt:workedAt,plannedDate:workedAt,
  origin:{lat:-16.67,lng:-49.26},distanceMeters:1200,stops:[{
    id:'first',lat:-16.68,lng:-49.27,city:'Goiânia',isLunnaOrder:false,deliveryStatus:'completed',
    completedAt:workedStopAt,customerName:'Synthetic private name',address:'Synthetic private address',
    phone:'555-0100',photoUrl:'https://example.invalid/private.jpg',
  }],
};

function fixture(kind:'uf'|'attest') {
  const data=structuredClone(route);
  if (kind==='attest') Object.assign(data.stops[0],{state:'GO'});
  const confirmation={status:'completed',visited:null,workedAt:workedStopAt};
  const start={driverUid:route.driverId,startedAt,plan:plannedFingerprint(data),
    confirmations:kind==='uf' ? {'id:first':confirmation}:{}};
  const proof={start,completion:kind==='uf' ? protectCompletion({...data,earningsSourceStart:start},'driver-server-v1'):null};
  const facts=routeFacts(sourceSnapshot(data,proof));
  const context={
    eventId,sourceRevision,watermark,factsFingerprint:factsHash(facts),facts,routeId:'synthetic-route',
    routeReference:route.code,driverName:'Motorista de teste',sourceProject:'demo-rotaexata-sql',
    eventType:'snapshot' as const,sourceTime:workedAt,reason:kind==='uf' ? 'unmatched_zone':'source_unproven',
    workedAt,issueFrom:'2026-11-19T00:00:00.000Z',blockedReason:null,
    rule:{id:'30000000-0000-4000-8000-000000000001',version:1,engineVersion:1,effectiveAt:'2026-11-19T00:00:00.000Z',
      definition:{mode:'zone',attemptBasisPoints:2000,zones:[{cities:[{name:'Goiânia',uf:'GO'}],radiusMeters:7000,priceCents:500}]}},
  };
  return {context,source:{data,proof,readRevision,proofRevision:readRevision}};
}

const explanation={stopId:'id:first',evidence:'Comprovante de teste',reason:'Conferência sintética para testar a rota'};
const uf={kind:'complete_uf' as const,stops:[{...explanation,uf:'GO'}]};
const attest={kind:'attest_outcomes' as const,stops:[explanation]};

test('read-only source review previews UF under a proven completion and exposes only necessary fields',()=>{
  const {context,source}=fixture('uf');
  const original=structuredClone({context,source});
  const detail=sourceReviewDetails(context,source);
  assert.deepEqual(detail.stops.map(stop=>[stop.id,stop.number]),[['id:first',1]]);
  assert.equal(detail.action,'complete_uf');
  const output=prepareSourceReview(actor,context,source,uf);
  assert.equal(output.quote.totalCents,500);
  assert.match(output.previewDigest,/^[a-f0-9]{64}$/);
  assert.deepEqual({context,source},original);
  assert.doesNotMatch(JSON.stringify(detail),/Synthetic private|555-0100|example.invalid|driverUid|fingerprint|confirmations/);
  assert.notEqual(output.previewDigest,prepareSourceReview(actor,context,{...source,readRevision:'001795000000.123456790'},uf).previewDigest);
  assert.notEqual(output.previewDigest,prepareSourceReview(actor,{...context,watermark:'001795000000.123456790'},source,uf).previewDigest);
  assert.notEqual(output.previewDigest,prepareSourceReview(actor,context,{...source,proofRevision:'001795000000.123456790'},uf).previewDigest);
  assert.throws(()=>prepareSourceReview(actor,context,source,{...uf,stops:[{...uf.stops[0],uf:'SP'}]}));
  assert.throws(()=>prepareSourceReview(actor,context,{...source,proof:{...source.proof,completion:null}},uf));
});

test('attestation accepts only missing map entries with frozen facts and preserves source evidence',()=>{
  const {context,source}=fixture('attest');
  assert.equal(sourceReviewDetails(context,source).action,'attest_outcomes');
  const output=prepareSourceReview(actor,context,source,attest);
  assert.equal(output.quote.totalCents,500);
  assert.equal(context.facts.evidence,null);
  assert.equal(source.proof.completion,null);
  for (const entry of [null,{},false,{status:'failed',workedAt:workedStopAt,visited:false}]) {
    const proof={...source.proof,start:{...source.proof.start,confirmations:{'id:first':entry}}};
    assert.throws(()=>prepareSourceReview(actor,context,{...source,proof},attest));
  }
  for(const confirmations of [null,new Date(),{'id:unknown':{status:'completed',visited:null,workedAt:workedStopAt}}]) {
    assert.throws(()=>prepareSourceReview(actor,context,{...source,proof:{...source.proof,start:{...source.proof.start,confirmations}}},attest));
  }
  assert.throws(()=>prepareSourceReview(actor,context,{...source,data:{...source.data,completedAt:workedStopAt}},attest));
});

test('technical tombstone opens without a live route and write contract rejects forged facts',()=>{
  const {context}=fixture('uf');
  const tombstone={...context,eventType:'deleted' as const,reason:'source_deleted',facts:{},workedAt:null,
    routeReference:context.routeId,driverName:null,rule:null};
  assert.deepEqual(sourceReviewDetails(tombstone,null).stops,[]);
  assert.equal(sourceReviewDetails(tombstone,null).action,null);
  assert.throws(()=>prepareSourceReview(actor,tombstone,null,uf));

  const input={eventId,watermark,decision:uf,previewDigest:'b'.repeat(64),requestId:'40000000-0000-4000-8000-000000000001'};
  assert.equal(sourceReviewConfirmSchema.safeParse(input).success,true);
  for (const extra of [{driverId:'other'},{ruleId:'made-up'},{valueCents:500},{facts:{evidence:'driver-server-v1'}}]) {
    assert.equal(sourceReviewConfirmSchema.safeParse({...input,...extra}).success,false);
  }
});

test('finance form derives only the admitted operation and requires evidence for each displayed stop',async()=>{
  const { sourceReviewFormInput }=await import('../src/lib/earnings/source-review-contract.ts');
  for(const kind of ['uf','attest'] as const) {
    const {context,source}=fixture(kind);
    const detail=sourceReviewDetails(context,source);
    const form=new FormData();
    form.set('reason-0',explanation.reason);
    form.set('evidence-0',explanation.evidence);
    form.set('uf-0','GO');
    form.set('valueCents','1');
    assert.deepEqual(sourceReviewFormInput(detail,form),{eventId,watermark,decision:kind==='uf' ? uf:attest});
    form.delete('evidence-0');
    assert.throws(()=>sourceReviewFormInput(detail,form));
  }
});
