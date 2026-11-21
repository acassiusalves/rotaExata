import { z } from 'zod';
import type { EarningsItem } from './domain.ts';

const eventId = z.string().min(1).max(250);
const revision = z.string().regex(/^\d{12}\.\d{9}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const stop = {
  stopId:z.string().min(1).max(150),
  reason:z.string().trim().min(1).max(600),
  evidence:z.string().trim().min(1).max(300),
};
export const brazilianStates = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
] as const;
const decision = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('complete_uf'),stops:z.array(z.object({...stop,uf:z.enum(brazilianStates)}).strict()).min(1).max(30)}).strict(),
  z.object({kind:z.literal('attest_outcomes'),stops:z.array(z.object(stop).strict()).min(1).max(30)}).strict(),
]).refine(input=>new Set(input.stops.map(entry=>entry.stopId)).size===input.stops.length);
const review = {eventId,watermark:revision,decision};
export const sourceReviewPreviewSchema = z.object(review).strict();
export const sourceReviewConfirmSchema = z.object({...review,previewDigest:digest,requestId:z.string().uuid()}).strict();
export const sourceReviewDetailQuery = z.object({eventId}).strict();
export const sourceReviewListQuery = z.object({
  month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  after:z.string().datetime({offset:true}).optional(),afterId:eventId.optional(),
}).strict().refine(input=>Boolean(input.after)===Boolean(input.afterId));

export type SourceReviewDecision = z.infer<typeof decision>;
export type SourceReviewPreviewInput = z.infer<typeof sourceReviewPreviewSchema>;
export type SourceReviewConfirmInput = z.infer<typeof sourceReviewConfirmSchema>;
export type SourceReviewAction = SourceReviewDecision['kind'];
export type SourceReviewRow = {
  eventId:string; routeReference:string; driverName:string|null; workedAt:string|null;
  sourceTime:string; eventType:'snapshot'|'deleted'|'gap'; reason:string|null;
};
export type SourceReviewDetail = SourceReviewRow & {
  watermark:string; action:SourceReviewAction|null; blockedReason:string|null; ruleVersion:number|null;
  stops:{
    id:string; number:number; status:'completed'|'failed'; visited:boolean|null; city:string|null;
    reference:{kind:'order'|'point';code:string}|null;
  }[];
};
export type SourceReviewPreview = {
  previewDigest:string; totalCents:number; ruleVersion:number; driverName:string|null;
  items:{ component:EarningsItem['component']; cents:number; stopNumber:number|null }[];
};
export type SourceReviewResult = {earningId:string; status:'pending'; totalCents:number};

export function sourceReviewFormInput(detail:SourceReviewDetail,data:FormData):SourceReviewPreviewInput {
  const stops=detail.stops.map((stop,index)=>({
    stopId:stop.id,
    reason:data.get('reason-'+index),
    evidence:data.get('evidence-'+index),
    ...(detail.action==='complete_uf' ? {uf:data.get('uf-'+index)}:{}),
  }));
  return sourceReviewPreviewSchema.parse({
    eventId:detail.eventId,watermark:detail.watermark,decision:{kind:detail.action,stops},
  });
}
