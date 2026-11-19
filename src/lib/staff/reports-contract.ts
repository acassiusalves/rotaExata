import { z } from 'zod';
import { routeDocumentId, staffWriteFields } from './route-contract.ts';
import { driverTimestamp } from '../driver/runtime-contract.ts';

export const reportStatuses = ['dispatched', 'in_progress', 'completed', 'completed_auto'] as const;
export const aiPaymentMethods = ['cartao_credito', 'cartao_debito', 'pix'];

const instant = z.string().datetime({offset:true}).max(35);
export const reportSelectionSchema = z.object({
  view:z.enum(['general','numbers']),
  clock:z.enum(['planned','completed']),
  start:instant,
  end:instant,
  cursor:z.string().max(300).optional(),
}).strict().refine(input => Date.parse(input.start)<Date.parse(input.end) &&
  (input.view==='general' || input.clock==='planned'));
export type ReportSelection = z.infer<typeof reportSelectionSchema>;

const stop = z.object({
  index:z.number().int().min(0).max(20_000),
  id:z.string().min(1).max(500).optional(),
}).strict();
export type ReportStopRef = z.infer<typeof stop>;

const payment = z.object({
  id:z.string().min(1).max(150),
  method:z.enum(['dinheiro','pix','cartao_credito','cartao_debito','boleto','pago_na_loja','outro']),
  value:z.number().finite().min(0).max(100_000_000),
  installments:z.number().int().min(1).max(99).optional(),
  pixType:z.enum(['qrcode','cnpj']).optional(),
}).strict().refine(item=>item.value>0 || item.method==='pago_na_loja');
const editValues = z.discriminatedUnion('status',[
  z.object({status:z.literal('completed'),payments:z.array(payment).min(1).max(50),adminEditReason:z.string().trim().min(1).max(4000)}).strict(),
  z.object({status:z.literal('failed'),failureReason:z.string().trim().min(1).max(500),adminEditReason:z.string().trim().min(1).max(4000)}).strict(),
]);
export type ReportEditValues = z.infer<typeof editValues>;
const target = {...staffWriteFields,routeId:routeDocumentId};
const refs = (max:number)=>z.array(stop).min(1).max(max)
  .refine(items=>new Set(items.map(item=>item.index)).size===items.length);
export const reportCommandSchema = z.discriminatedUnion('kind',[
  z.object({...target,kind:z.literal('edit'),stop,values:editValues}).strict(),
  z.object({...target,kind:z.literal('reconcile'),stops:refs(400),reconciled:z.boolean()}).strict(),
]);
export const reportAiRouteSchema = z.object({...target,stops:refs(10)}).strict();
export const reportAiSchema = z.object({routes:z.array(reportAiRouteSchema).min(1).max(10)}).strict()
  .refine(input=>new Set(input.routes.map(route=>route.routeId)).size===input.routes.length &&
    input.routes.reduce((count,route)=>count+route.stops.length,0)<=10);
export type ReportCommand = z.infer<typeof reportCommandSchema>;
export type ReportAiRoute = z.infer<typeof reportAiRouteSchema>;
export type ReportAiResult = {
  routeId:string;stopIndex:number;customerName?:string;expectedValue:number;extractedValue:number;
  success:boolean;reconciled:boolean;difference:number;error?:string;
};

export function reportRouteDate(route:{plannedDate?:unknown;stops?:Array<{completedAt?:unknown}>},selection:ReportSelection) {
  const planned=driverTimestamp(route.plannedDate);
  const date=selection.clock==='planned' ? planned :
    (route.stops??[]).map(stop=>driverTimestamp(stop?.completedAt)).reduce<string|null>(
      (latest, instant)=>instant && (!latest || instant>latest) ? instant:latest,null);
  if (!planned || !date) return null;
  const ms=Date.parse(date);
  return ms>=Date.parse(selection.start) && ms<Date.parse(selection.end) ? date:null;
}

export function reportEvidenceInput(stop:{deliveryStatus?:unknown;photoUrl?:unknown;payments?:unknown;expectedValue?:unknown;reconciled?:unknown}) {
  if (stop.deliveryStatus!=='completed' || stop.reconciled===true || typeof stop.photoUrl!=='string' || !stop.photoUrl) return null;
  const payment = Array.isArray(stop.payments) ? stop.payments.find(item=>aiPaymentMethods.includes(item?.method)) : null;
  if (!payment) return null;
  const expectedValue=typeof stop.expectedValue==='number' ? stop.expectedValue:payment.value;
  if (typeof expectedValue!=='number' || !Number.isFinite(expectedValue) || expectedValue<=0) return null;
  return {photoUrl:stop.photoUrl,expectedValue};
}
