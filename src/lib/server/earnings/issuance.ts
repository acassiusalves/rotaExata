import { z } from 'zod';
import { factsHash, firestoreRevision } from '../../../../functions/src/earnings-source-adapter.ts';
import { normalizeRouteFacts, normalizeRule, calculateEarnings } from '../../earnings/domain.ts';
import { earningsRpc, EarningsError } from './transport.ts';

const boundedString = (size: number) => z.string().min(1).max(size);
const hex = z.string().regex(/^[0-9a-f]{64}$/);
const evidence = z.enum(['driver-server-v1', 'auto-server-v1', 'admin-server-v1']);
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict();
const factsSchema = z.object({
  driverUid: boundedString(128).nullable(),
  routeCode: boundedString(40).regex(/^[a-z0-9][a-z0-9_-]*$/i).nullable(),
  status: boundedString(40).nullable(),
  workedAt: z.string().datetime().nullable(),
  plannedAt: z.string().date().nullable(),
  forced: z.boolean(),
  origin: point.nullable(),
  distanceMeters: z.number().min(0).max(10000000).nullable(),
  stops: z.array(z.object({
    id: boundedString(150).nullable(),
    status: z.enum(['completed','failed','open']),
    visited: z.boolean().nullable(),
    city: boundedString(120).nullable(),
    state: boundedString(30).nullable(),
    lat: point.shape.lat.nullable(),
    lng: point.shape.lng.nullable(),
    category: boundedString(80).nullable(),
    lunna: z.boolean().nullable(),
    exception: z.enum(['exchange','return','redelivery','moved']).nullable(),
    completedAt: z.string().datetime().nullable(),
  }).strict()).max(1001),
  evidence: evidence.nullable(),
}).strict();

const eventSchema = z.object({
  sourceProject: z.string().regex(/^[a-z0-9-]{3,63}$/),
  logicalRouteId: boundedString(150).regex(/^[^/]+$/),
  eventId: hex,
  sourceRevision: z.string().regex(/^\d{12}\.\d{9}$/),
  eventType: z.enum(['snapshot','deleted','gap']),
  sourceTime: z.string().datetime(),
  schemaVersion: z.literal(1),
  factsFingerprint: hex,
  facts: factsSchema,
}).strict();

type Rpc = (name: string, params: Record<string, unknown>) => Promise<unknown>;

export async function receiveEarningsEvent(input: unknown, sourceProject: string, rpc: Rpc = earningsRpc) {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) throw new EarningsError(422, 'earnings_invalid_event');
  const event = parsed.data;
  if (event.sourceProject !== sourceProject) throw new EarningsError(403, 'earnings_source_denied');
  const [seconds,nanos] = event.sourceRevision.split('.').map(Number);
  if (firestoreRevision({ seconds, nanoseconds: nanos }) !== event.sourceRevision ||
      Date.parse(event.sourceTime) !== seconds * 1000 + Math.floor(nanos / 1e6) ||
      factsHash(event.facts) !== event.factsFingerprint ||
      factsHash([event.sourceProject,event.logicalRouteId,event.sourceRevision,event.eventType]) !== event.eventId) {
    throw new EarningsError(422, 'earnings_invalid_event');
  }
  const result = await rpc('rota_earnings_receive_event', {
    p_source_project: event.sourceProject, p_logical_route_id: event.logicalRouteId, p_event_id: event.eventId,
    p_source_revision: event.sourceRevision, p_source_time: event.sourceTime, p_event_type: event.eventType,
    p_schema_version: event.schemaVersion, p_facts_fingerprint: event.factsFingerprint, p_facts: event.facts,
  });
  const state = (result as { status?: string } | null)?.status;
  if (!state || !['received','duplicate','review','ignored'].includes(state)) throw new EarningsError(503, 'earnings_capture_unavailable');
  return { status: state };
}

type Assessment = { kind: 'eligible' } | { kind: 'review' | 'ineligible'; reason: string };

export function assessRoute(facts: Record<string, unknown>, issueFrom: string, eventType: string): Assessment {
  if (eventType === 'gap') return { kind: 'review', reason: 'source_history_gap' };
  if (eventType === 'deleted') return { kind: 'review', reason: 'source_deleted' };
  if (facts.forced) return { kind: 'review', reason: 'forced_closure' };
  if (facts.status !== 'completed' && facts.status !== 'completed_auto') return { kind: 'ineligible', reason: 'not_completed' };
  if (!facts.workedAt && facts.status === 'completed_auto') return { kind: 'ineligible', reason: 'abandoned' };
  if (typeof facts.workedAt !== 'string' || !Number.isFinite(Date.parse(facts.workedAt))) return { kind: 'review', reason: 'missing_work_time' };
  if (!Number.isFinite(Date.parse(issueFrom))) return { kind: 'review', reason: 'cutover_not_configured' };
  if (Date.parse(facts.workedAt) < Date.parse(issueFrom)) return { kind: 'ineligible', reason: 'before_cutover' };
  if (facts.status === 'completed_auto' ? facts.evidence !== 'auto-server-v1' :
    !['driver-server-v1','admin-server-v1'].includes(String(facts.evidence))) return { kind: 'review', reason: 'source_unproven' };
  if (typeof facts.driverUid !== 'string' || !facts.driverUid) return { kind: 'review', reason: 'driver_unmapped' };
  const stops = facts.stops as { status?: string }[] | undefined;
  if (!Array.isArray(stops) || !stops.length) return { kind: 'review', reason: 'no_outcomes' };
  const resolved = stops.filter(stop => stop?.status === 'completed' || stop?.status === 'failed');
  if (facts.status === 'completed_auto' ? resolved.length !== stops.length : resolved.length * 5 < stops.length * 4) {
    return { kind: 'review', reason: 'partial_work' };
  }
  return { kind: 'eligible' };
}
const claimSchema = z.object({
  sourceProject: boundedString(63), eventId: boundedString(250), leaseId: boundedString(50),
  eventType: z.enum(['snapshot','deleted','gap']), issueFrom: z.string(),
  facts: z.record(z.unknown()),
  rule: z.object({ id: boundedString(50), engineVersion: z.number().int(), definition: z.unknown() }).nullable(),
});

export async function issueRouteEarnings(scopeId: string, rpc: Rpc = earningsRpc) {
  const claimed = await rpc('rota_earnings_claim_event', { p_scope_id: scopeId });
  if (claimed === null) return null;
  const event = claimSchema.parse(claimed);
  const assessment = assessRoute(event.facts,event.issueFrom,event.eventType);
  let outcome = assessment.kind === 'ineligible' ? 'ignored' : 'review';
  let reason = assessment.kind === 'eligible' ? 'no_rule_at_work_time' : assessment.reason;
  let quote = null;
  if (assessment.kind === 'eligible' && event.rule?.engineVersion === 1) {
    const facts = normalizeRouteFacts(event.facts);
    const rule = normalizeRule(event.rule.definition);
    const calculation = Array.isArray(facts) ? facts : Array.isArray(rule) ? rule : calculateEarnings(facts,rule);
    if (Array.isArray(calculation)) reason = calculation.map(issue => issue.code).join(',').slice(0,240);
    else { outcome = 'issue'; reason = ''; quote = calculation; }
  }

  const command = {
    p_scope_id: scopeId, p_source_project: event.sourceProject, p_event_id: event.eventId, p_lease_id: event.leaseId,
    p_outcome: outcome, p_reason: reason || null, p_rule_id: event.rule?.id ?? null, p_quote: quote,
  };
  const result = await rpc('rota_earnings_finish_event', command);
  const state = (result as { status?: string, errorCode?: string } | null)?.status;
  if (!state) {
    const conflict = (result as { errorCode?: string } | null)?.errorCode;
    if (conflict === 'earnings_lease_conflict' || conflict === 'earnings_issuance_paused') return 'retry';
    await rpc('rota_earnings_finish_event', { ...command, p_outcome: 'retry', p_reason: 'writer_rejected', p_quote: null });
    throw new EarningsError(503, 'earnings_issuance_unavailable');
  }
  return state;
}

export async function drainEarningsQueue(limit: number) {
  const scope = z.string().uuid().safeParse(process.env.ROTA_EARNINGS_SCOPE_ID);
  if (!scope.success) throw new EarningsError(503, 'earnings_unavailable');
  let handled = 0;
  for (; handled < limit; handled++) {
    const outcome = await issueRouteEarnings(scope.data);
    if (outcome === null) break;
  }
  return handled;
}
