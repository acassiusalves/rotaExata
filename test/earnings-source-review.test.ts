import assert from 'node:assert/strict';
import test from 'node:test';
import { factsHash,plannedFingerprint,protectCompletion,routeFacts,sourceSnapshot } from '../functions/src/earnings-source-adapter.ts';
import { sourceReviewDetails,prepareSourceReview,confirmSourceReview } from '../src/lib/server/earnings/source-reviews.ts';
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
    id:'first',orderNumber:'P-TESTE-1',pointCode:'RT-QA-001',lat:-16.68,lng:-49.27,city:'Goiânia',isLunnaOrder:false,deliveryStatus:'completed',
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
    routeReference:route.code,driverName:'Motorista de teste',driverId:'10000000-0000-4000-8000-000000000002',sourceProject:'demo-rotaexata-sql',
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


test('preview pins the canonical driver privately without exposing the UUID in the public detail',()=>{
  const {context,source}=fixture('uf');
  const detail=sourceReviewDetails(context,source);
  const prepared=prepareSourceReview(actor,context,source,uf);
  assert.equal(prepared.basis.driverId,context.driverId);
  assert.notEqual(prepared.previewDigest,prepareSourceReview(actor,{...context,driverId:'10000000-0000-4000-8000-000000000003'},source,uf).previewDigest);
  assert.equal(Object.hasOwn(detail,'driverId'),false);
});

test('review detail exposes the operational order or point only for the matching active stop',()=>{
  const {context,source}=fixture('uf');
  const detail=sourceReviewDetails(context,source);
  assert.deepEqual(detail.stops[0].reference,{kind:'order',code:'P-TESTE-1'});
  const avulsa={...source,data:{...source.data,stops:[
    {...source.data.stops[0],orderNumber:'Private address, 11'},
    {...source.data.stops[0],orderNumber:'OTHER-ORDER',unlinkedAt:workedAt},
  ]}};
  assert.deepEqual(sourceReviewDetails(context,avulsa).stops[0].reference,{kind:'point',code:'RT-QA-001'});
  assert.doesNotMatch(JSON.stringify(sourceReviewDetails(context,avulsa)),/Private address|555-0100|example.invalid/);
});

test('qualified city outside GO is normalized only for compatible UF pricing and recorded in the review basis',()=>{
  const {context,source}=fixture('uf');
  source.data.stops[0].city='Campinas / SP';
  source.proof.start.plan=plannedFingerprint(source.data);
  source.proof.completion=protectCompletion({...source.data,earningsSourceStart:source.proof.start},'driver-server-v1');
  context.facts=routeFacts(sourceSnapshot(source.data,source.proof));
  context.factsFingerprint=factsHash(context.facts);
  context.rule.definition.zones[0].cities=[{name:'Campinas',uf:'SP'}];
  const original=structuredClone({context,source});
  const prepared=prepareSourceReview(actor,context,source,{kind:'complete_uf',stops:[{...explanation,uf:'SP'}]});
  assert.equal(prepared.quote.totalCents,500);
  assert.deepEqual(prepared.basis.ufEnrichment,[{stopId:'id:first',originalCity:'Campinas / SP',pricedCity:'campinas',uf:'SP'}]);
  assert.deepEqual({context,source},original);
});

test('concurrent identical confirmation rechecks the authenticated receipt after context leaves the queue',async t=>{
  const oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey=process.env.SUPABASE_EARNINGS_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:61421';
  process.env.SUPABASE_EARNINGS_SECRET_KEY='sb_secret_local_test';
  t.after(()=>{
    if(oldUrl===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;
    if(oldKey===undefined) delete process.env.SUPABASE_EARNINGS_SECRET_KEY;
    else process.env.SUPABASE_EARNINGS_SECRET_KEY=oldKey;
  });
  const input={eventId,watermark,decision:uf,previewDigest:'b'.repeat(64),requestId:'40000000-0000-4000-8000-000000000001'};
  const result={earningId:'30000000-0000-4000-8000-000000000004',status:'pending',totalCents:500};
  const calls:string[]=[];
  const {context}=fixture('uf');
  let currentContext:unknown={errorCode:'earnings_review_not_found'};
  let concurrentReceipt:typeof result|null=result;
  t.mock.method(globalThis,'fetch',async (url:string,init:RequestInit)=>{
    const name=new URL(url).pathname.split('/').at(-1)!;
    calls.push(name);
    const body=JSON.parse(String(init.body));
    assert.equal(body.p_user_id,actor.userId);
    assert.equal(body.p_session_id,actor.sessionId);
    assert.equal(body.p_scope_id,actor.scopeId);
    if(name==='rota_earnings_source_review_context') return Response.json(currentContext);
    assert.equal(name,'rota_earnings_source_review_receipt');
    assert.equal(body.p_request_id,input.requestId);
    assert.deepEqual(body.p_request_body,{eventId,watermark,decision:uf,previewDigest:input.previewDigest});
    return Response.json(calls.length===1?null:concurrentReceipt);
  });
  const confirm=()=>confirmSourceReview(actor as Parameters<typeof confirmSourceReview>[0],input);
  for (const updatedContext of [currentContext,{...context,watermark:'001795000000.123456790'}]) {
    currentContext=updatedContext;
    calls.length=0;
    assert.deepEqual(await confirm(),result);
    assert.deepEqual(calls,['rota_earnings_source_review_receipt','rota_earnings_source_review_context','rota_earnings_source_review_receipt']);
  }
  concurrentReceipt=null;
  calls.length=0;
  await assert.rejects(confirm(),{status:409,code:'earnings_review_revision_conflict'});
});
