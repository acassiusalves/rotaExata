import { z } from 'zod';
import { factsHash,firestoreRevision,plannedFingerprint,protectCompletion,routeFacts,sourceSnapshot,timestampIso } from '../../../../functions/src/earnings-source-adapter.ts';
import { calculateEarnings,municipalityIdentity,normalizeRouteFacts,normalizeRule,type EarningsRule } from '../../earnings/domain.ts';
import type {
  SourceReviewAction,SourceReviewConfirmInput,SourceReviewDecision,SourceReviewDetail,SourceReviewPreview,
  SourceReviewPreviewInput,SourceReviewResult,SourceReviewRow,sourceReviewListQuery,
} from '../../earnings/source-review-contract.ts';
import type { EarningsActor } from './actor.ts';
import { assessRoute } from './issuance.ts';
import { actorRpc } from './store.ts';
import { EarningsError } from './transport.ts';

const date = z.string().datetime({offset:true});
const contextSchema = z.object({
  eventId:z.string(),routeId:z.string().min(1).max(150).refine(id=>!id.includes('/') && id!=='.' && id!=='..'),
  routeReference:z.string(),driverName:z.string().nullable(),sourceProject:z.string(),
  eventType:z.enum(['snapshot','deleted','gap']),reason:z.string().nullable(),
  sourceTime:date,workedAt:date.nullable(),issueFrom:date.nullable(),blockedReason:z.string().nullable(),
  facts:z.record(z.unknown()),factsFingerprint:z.string(),sourceRevision:z.string(),watermark:z.string(),
  rule:z.object({id:z.string().uuid(),definition:z.unknown(),version:z.number(),engineVersion:z.number(),effectiveAt:date}).nullable(),
});
type Context = z.infer<typeof contextSchema>;
type Source = {
  data:Record<string,unknown>; proof:Record<string,unknown>;
  readRevision:string; proofRevision:string;
};
type PublicActor = Pick<EarningsActor,'scopeId'|'userId'|'sessionId'>;
type FactStop = ReturnType<typeof routeFacts>['stops'][number];
type Candidate = { action:SourceReviewAction; stops:FactStop[]; facts:ReturnType<typeof routeFacts>; rule:EarningsRule };

function reviewBlock(reason:string):{blockedReason:string} { return {blockedReason:reason}; }
function record(value:unknown):Record<string,unknown>|null {
  if (!value || typeof value!=='object') return null;
  const prototype=Object.getPrototypeOf(value);
  return prototype===Object.prototype || prototype===null ? value as Record<string,unknown>:null;
}

function missingConfirmations(source:Source,facts:ReturnType<typeof routeFacts>) {
  if (source.proof.completion!=null) return null;
  const start=record(source.proof.start);
  const entries=record(start?.confirmations);
  const startedAt=timestampIso(start?.startedAt);
  if (!start || !entries || !startedAt || !facts.workedAt || !facts.driverUid || facts.driverUid!==start.driverUid ||
      start.plan!==plannedFingerprint(source.data) || startedAt>facts.workedAt) return null;

  const ids=new Set(facts.stops.map(stop=>stop.id));
  if (Object.keys(entries).some(id=>!ids.has(id))) return null;
  const missing:FactStop[]=[];
  for (const stop of facts.stops) {
    if (!stop.id || stop.status==='open' || !stop.completedAt ||
        stop.completedAt<startedAt || stop.completedAt>facts.workedAt ||
        (stop.status==='failed' && typeof stop.visited!=='boolean')) return null;
    if (!Object.hasOwn(entries,stop.id)) {
      missing.push(stop);
      continue;
    }
    const recorded=record(entries[stop.id]);
    if (!recorded || recorded.status!==stop.status || recorded.visited!==stop.visited ||
        recorded.workedAt!==stop.completedAt) return null;
  }
  return missing.length ? missing:null;
}

function reviewCandidate(context:Context,source:Source|null):Candidate|{blockedReason:string} {
  if (context.eventType!=='snapshot') return reviewBlock('technical_event');
  if (context.blockedReason) return reviewBlock(context.blockedReason);
  if (context.reason!=='source_unproven' && !/^unmatched_zone(,unmatched_zone)*$/.test(context.reason ?? '')) {
    return reviewBlock('unsupported_reason');
  }
  if (!source) return reviewBlock('source_missing');
  const proof=routeFacts(sourceSnapshot(source.data,source.proof));
  if (factsHash(proof)!==context.factsFingerprint || factsHash(context.facts)!==context.factsFingerprint) {
    return reviewBlock('source_changed');
  }
  if (!context.rule || context.rule.engineVersion!==1 || !context.issueFrom || !proof.workedAt ||
      Date.parse(proof.workedAt)<Date.parse(context.rule.effectiveAt)) return reviewBlock('no_rule_at_work_time');

  const facts=normalizeRouteFacts(proof);
  const rule=normalizeRule(context.rule.definition);
  if (Array.isArray(facts) || Array.isArray(rule)) return reviewBlock('unsupported_facts');
  const assessment=assessRoute(proof,context.issueFrom,context.eventType);

  if (context.reason==='source_unproven') {
    if (proof.status!=='completed' || proof.evidence!==null || assessment.kind!=='review' || assessment.reason!=='source_unproven') {
      return reviewBlock('unsupported_proof');
    }
    const stops=missingConfirmations(source,proof);
    if (!stops) return reviewBlock('unsupported_proof');
    if (stops.length>30) return reviewBlock('too_many_stops');
    if (Array.isArray(calculateEarnings(facts,rule))) return reviewBlock('unsupported_facts');
    return {action:'attest_outcomes',stops,facts:proof,rule};
  }

  if (assessment.kind!=='eligible' || !proof.evidence) return reviewBlock('unsupported_proof');
  const rebuilt=protectCompletion({...source.data,earningsSourceStart:source.proof.start},proof.evidence);
  if (!rebuilt || rebuilt.digest!==record(source.proof.completion)?.digest) return reviewBlock('unsupported_proof');
  const issues=calculateEarnings(facts,rule);
  if (!Array.isArray(issues) || issues.some(issue=>issue.code!=='unmatched_zone' || !issue.stopId)) {
    return reviewBlock('unsupported_facts');
  }
  const ids=new Set(issues.map(issue=>issue.stopId));
  const stops=proof.stops.filter(stop=>ids.has(stop.id ?? ''));
  if (!stops.length || stops.some(stop=>!stop.city || stop.state || stop.status==='open')) return reviewBlock('unsupported_facts');
  if (stops.length>30) return reviewBlock('too_many_stops');
  return {action:'complete_uf',stops,facts:proof,rule};
}

function reviewStops(candidate:Candidate):SourceReviewDetail['stops'] {
  return candidate.stops.map(stop=>({
    id:stop.id!,number:candidate.facts.stops.indexOf(stop)+1,
    status:stop.status==='failed'?'failed':'completed',visited:stop.visited,city:stop.city,
  }));
}

export function sourceReviewDetails(context:Context,source:Source|null):SourceReviewDetail {
  const {eventId,routeReference,driverName,workedAt,sourceTime,eventType,reason,watermark}=context;
  const candidate=reviewCandidate(context,source);
  return {
    eventId,routeReference,driverName,workedAt,sourceTime,eventType,reason,watermark,ruleVersion:context.rule?.version ?? null,
    ...('blockedReason' in candidate ? {...candidate,action:null,stops:[]} :
      {blockedReason:null,action:candidate.action,stops:reviewStops(candidate)}),
  };
}

function matchingUf(rule:EarningsRule,city:string,uf:string) {
  const municipality=municipalityIdentity(city,uf,true);
  return !municipality.conflict && rule.zones.some(zone=>zone.cities.some(c=>c.name===municipality.name && c.uf===municipality.uf));
}

export function prepareSourceReview(actor:PublicActor,context:Context,source:Source|null,decision:SourceReviewDecision) {
  const candidate=reviewCandidate(context,source);
  if (!source || !context.rule || 'blockedReason' in candidate) {
    if ('blockedReason' in candidate && candidate.blockedReason==='source_changed') throw new EarningsError(409,'earnings_review_revision_conflict');
    throw new EarningsError(422,'earnings_invalid_review');
  }
  const changesById = new Map(decision.stops.map(entry=>[entry.stopId,entry]));
  if (decision.kind!==candidate.action || changesById.size!==decision.stops.length ||
      candidate.stops.length!==changesById.size || candidate.stops.some(stop=>!changesById.has(stop.id!))) {
    throw new EarningsError(422,'earnings_invalid_review');
  }

  const stops = candidate.facts.stops.map(stop=>{
    const change=changesById.get(stop.id ?? '');
    if (!change || !('uf' in change)) return stop;
    if (!stop.city || !matchingUf(candidate.rule,stop.city,change.uf)) throw new EarningsError(422,'earnings_invalid_review_uf');
    return {...stop,state:change.uf};
  });
  const facts=normalizeRouteFacts({...candidate.facts,stops});
  if (Array.isArray(facts)) throw new EarningsError(422,'earnings_invalid_review');
  const quote=calculateEarnings(facts,candidate.rule);
  if (Array.isArray(quote)) throw new EarningsError(422,'earnings_invalid_review_uf');
  const basis={
    sourceRevision:context.sourceRevision,watermark:context.watermark,factsFingerprint:context.factsFingerprint,
    ruleId:context.rule.id,ruleVersion:context.rule.version,readRevision:source.readRevision,proofRevision:source.proofRevision,proofDigest:factsHash(source.proof),
  };
  const previewDigest=factsHash({scopeId:actor.scopeId,userId:actor.userId,eventId:context.eventId,basis,decision,quote});
  return {basis,quote,previewDigest};
}

async function readContext(actor:EarningsActor,eventId:string) {
  return contextSchema.parse(await actorRpc(actor,'rota_earnings_source_review_context',{p_event_id:eventId}));
}

async function readReviewSource(context:Context):Promise<Source|null> {
  if (context.eventType!=='snapshot' || context.blockedReason ||
      (context.reason!=='source_unproven' && !/^unmatched_zone(,unmatched_zone)*$/.test(context.reason ?? ''))) return null;
  const {adminApp,adminDb}=await import('../../firebase/admin.ts');
  if (!adminDb || context.sourceProject!==process.env.ROTA_EARNINGS_SOURCE_PROJECT || context.sourceProject!==adminApp?.options.projectId) {
    throw new EarningsError(503,'earnings_unavailable');
  }
  const db=adminDb;
  const [route,proof]=await db.runTransaction(tx=>tx.getAll(
    db.collection('routes').doc(context.routeId),db.collection('rotaEarningRouteEvidence').doc(context.routeId),
  ),{readOnly:true});
  const data=route.data();
  const evidence=proof.data();
  if (!data || !evidence || !route.updateTime || !proof.updateTime) return null;
  return {data,proof:evidence,readRevision:firestoreRevision(route.updateTime),proofRevision:firestoreRevision(proof.updateTime)};
}

export function listSourceReviews(actor:EarningsActor,query:z.infer<typeof sourceReviewListQuery>) {
  return actorRpc<{rows:SourceReviewRow[];nextCursor:{workedAt:string;id:string}|null}>(actor,'rota_earnings_source_review_list',{
    p_month:query.month+'-01',p_after_date:query.after ?? null,p_after_id:query.afterId ?? null,p_limit:25,
  });
}

export async function readSourceReview(actor:EarningsActor,eventId:string) {
  const context=await readContext(actor,eventId);
  return sourceReviewDetails(context,await readReviewSource(context));
}

function checkWatermark(context:Context,input:SourceReviewPreviewInput) {
  if (context.watermark!==input.watermark) throw new EarningsError(409,'earnings_review_revision_conflict');
}

export async function previewSourceReview(actor:EarningsActor,input:SourceReviewPreviewInput):Promise<SourceReviewPreview> {
  const context=await readContext(actor,input.eventId);
  checkWatermark(context,input);
  const prepared=prepareSourceReview(actor,context,await readReviewSource(context),input.decision);
  const stops=context.facts.stops as {id:string}[];
  return {
    previewDigest:prepared.previewDigest,ruleVersion:context.rule!.version,totalCents:prepared.quote.totalCents,
    items:prepared.quote.items.map(item=>({
      component:item.component,cents:item.cents,stopNumber:item.stopId ? stops.findIndex(stop=>stop.id===item.stopId)+1:null,
    })),
  };
}

export async function confirmSourceReview(actor:EarningsActor,input:SourceReviewConfirmInput) {
  const {requestId,...request}=input;
  const args={p_request_id:requestId,p_request_body:request};
  const receipt=await actorRpc<SourceReviewResult|null>(actor,'rota_earnings_source_review_receipt',args);
  if (receipt) return receipt;
  const context=await readContext(actor,input.eventId);
  checkWatermark(context,input);
  const prepared=prepareSourceReview(actor,context,await readReviewSource(context),input.decision);
  if (prepared.previewDigest!==input.previewDigest) throw new EarningsError(409,'earnings_review_revision_conflict');
  return actorRpc<SourceReviewResult>(actor,'rota_earnings_source_review_confirm',{
    ...args,p_expected:prepared.basis,p_quote:prepared.quote,
  });
}
