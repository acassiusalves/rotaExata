import {z} from 'zod';
import type {ReportSummary,ReportStatus} from '../reporting/report-contract';

const id=z.string().regex(/^[\w-]{1,120}$/).refine(value=>!/^__.*__$/.test(value));
export const staffFeedbackId=id;
const text=(max:number)=>z.string().trim().min(1).max(max);
export const staffFeedbackSubmissionSchema=z.object({
  submissionId:id,category:z.enum(['error','improvement']),description:text(5000).optional(),
  improvement:z.object({goal:text(2000),currentProcess:text(2000),blocker:text(2000)}).strict().nullable().optional(),
  url:z.string().max(4000).optional(),userAgent:z.string().max(1500).optional(),resolution:z.string().max(100).optional(),
  logs:z.array(z.unknown()).max(10).optional(),
}).strict();

const identity={reportId:id,revision:z.string().regex(/^\d{1,12}\.\d{1,9}$/),requestId:z.string().uuid()};
export const staffFeedbackCommandSchema=z.union([
  z.object({...identity,status:z.enum(['in_progress','resolved'])}).strict(),
  z.object({...identity,action:z.literal('reopen'),details:text(5000)}).strict(),
]);

export const staffFeedbackListSchema=z.object({
  origin:z.enum(['','luna','rota_exata','unknown']).optional(),
  category:z.enum(['','error','improvement']).optional(),status:z.enum(['','pending','in_progress','resolved']).optional(),
  author:z.string().trim().max(200).optional(),search:z.string().trim().max(200).optional(),
  from:z.string().regex(/^(?:\d{4}-\d{2}-\d{2})?$/).optional(),to:z.string().regex(/^(?:\d{4}-\d{2}-\d{2})?$/).optional(),
  cursor:z.string().max(1200).optional(),
}).strict();

export type StaffFeedbackSubmission=z.infer<typeof staffFeedbackSubmissionSchema>;
export type StaffFeedbackCommand=z.infer<typeof staffFeedbackCommandSchema>;
export type StaffFeedbackList=z.infer<typeof staffFeedbackListSchema>;
export type StaffFeedbackSummary=ReportSummary & {capabilities:{view:boolean;manage:boolean;reopen:boolean}};
export type StaffFeedbackDetail=StaffFeedbackSummary & {
  revision:string; reopenHistory:{details:string;reopenedAt:string|null}[];
  statusHistory:{next:ReportStatus;at:string|null;actor:{name:string}}[];
  context?:{url?:string;resolution?:string;userAgent?:string}; logs?:unknown[];
};
