import { z } from 'zod';
import { earningsStatuses } from '../../driver-statement.ts';
import type { EarningsActor } from './actor.ts';
import { actorRpc } from './store.ts';
import { EarningsError } from './transport.ts';

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const uuid = z.string().uuid();
const revision = z.number().int().min(1);
const commandHeader = { paymentId: uuid, expectedRevision: revision, requestId: uuid };
const reason = z.string().trim().min(1).max(1000);
const valueCents = z.number().int().safe().nonnegative();
const commandSchema = z.discriminatedUnion('kind',[
  z.object({ ...commandHeader, kind: z.literal('approve'), payload: z.object({}).strict() }).strict(),
  z.object({ ...commandHeader, kind: z.literal('pay'), payload: z.object({
    method: z.enum(['pix','bank_transfer','cash','other']), reference: z.string().trim().min(1).max(200), paidAt: z.string().datetime().nullish(),
  }).strict() }).strict(),
  z.object({ ...commandHeader, kind: z.literal('cancel'), payload: z.object({ reason }).strict() }).strict(),
  z.object({ ...commandHeader, kind: z.literal('adjust_total'), payload: z.object({ reason,valueCents }).strict() }).strict(),
  z.object({ ...commandHeader, kind: z.literal('adjust_stop'), payload: z.object({ reason,valueCents,stopId: z.string().min(1).max(150) }).strict() }).strict(),
]);

export async function applyPaymentCommand(actor: EarningsActor,input: unknown) {
  const result = commandSchema.safeParse(input);
  if (!result.success) throw new EarningsError(422,'earnings_invalid_command');
  const command = result.data;
  return actorRpc(actor,'rota_earnings_payment_command',{
    p_earning_id: command.paymentId, p_expected_revision: command.expectedRevision,
    p_request_id: command.requestId,p_kind: command.kind,p_payload: command.payload,
  });
}

export async function readPeriod(actor: EarningsActor,request: Request,statement: boolean) {
  const url = new URL(request.url);
  const query = z.object({
    month, status: z.enum(earningsStatuses).optional(),
    after: z.string().datetime({ offset: true }).optional(), afterId: uuid.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }).strict().safeParse(Object.fromEntries(url.searchParams));
  if (!query.success || Boolean(query.data.after) !== Boolean(query.data.afterId)) throw new EarningsError(422,'earnings_invalid_period');
  const page = query.data;
  return actorRpc(actor,statement ? 'rota_earnings_read_statement' : 'rota_earnings_read_payments',{
    p_month: page.month + '-01',p_status: page.status ?? null,p_after_date: page.after ?? null,
    p_after_id: page.afterId ?? null,p_limit: page.limit,
  });
}
export async function readPayment(actor: EarningsActor,id: string) {
  if (!uuid.safeParse(id).success) throw new EarningsError(422,'earnings_invalid_payment');
  return actorRpc(actor,'rota_earnings_read_payment',{ p_earning_id: id });
}
export async function inspectStatement(actor: EarningsActor,input: unknown) {
  const result = z.object({ driverId: uuid, month, reason }).strict().safeParse(input);
  if (!result.success) throw new EarningsError(422,'earnings_invalid_request');
  return actorRpc(actor,'rota_earnings_inspect_statement',{
    p_driver_id: result.data.driverId,p_month: result.data.month + '-01',p_reason: result.data.reason,
  });
}
