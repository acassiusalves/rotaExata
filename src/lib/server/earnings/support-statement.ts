import { z } from 'zod';
import { earningsStatuses, type SupportStatementPage } from '../../driver-statement.ts';
import { staffOperationAllowed } from '../../staff/access.ts';
import { resolveStaffActor, type StaffAuthority } from '../staff/actor.ts';
import { resolveEarningsActor, verifyNativeSession, type ActorAuthority, type EarningsActor } from './actor.ts';
import { actorRpc, privateJson } from './store.ts';
import { EarningsError, earningsErrorResponse, readJsonBody } from './transport.ts';

const inputSchema = z.object({
  sourceUid: z.string().min(1).max(128).refine(value =>
    value.trim() === value && value !== '.' && value !== '..' && !/[\/\\\s\x00-\x1f\x7f]/u.test(value)),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine(value => value >= '1900-01' && value <= '2200-01'),
  status: z.enum(earningsStatuses).optional(),
  after: z.string().datetime({offset:true}).optional(),
  afterId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  reason: z.string().trim().min(1).max(1000).refine(value => !value.includes('\0')),
}).strict().refine(input => (input.after === undefined) === (input.afterId === undefined));

type SupportAuthority = {
  staff: StaffAuthority;
  finance: ActorAuthority;
  read: (actor: EarningsActor, params: Record<string,unknown>) => Promise<SupportStatementPage>;
};

export async function postSupportStatement(request: Request, authority?: SupportAuthority) {
  try {
    const identity = await verifyNativeSession(request,authority?.staff);
    const staff = await resolveStaffActor(identity,'driver:preview',authority?.staff);
    if (staff.role !== 'admin' || !staffOperationAllowed(staff,'finance:payments')) {
      throw new EarningsError(403,'earnings_access_denied');
    }
    const actor = await resolveEarningsActor(identity,'payment:read',authority?.finance);
    if (actor.role !== 'admin' || actor.scopeId !== staff.scopeId) {
      throw new EarningsError(403,'earnings_access_denied');
    }

    const result = inputSchema.safeParse(await readJsonBody(request,8000));
    if (!result.success) throw new EarningsError(422,'earnings_invalid_request');
    const input = result.data;
    const params = {
      p_source_uid: input.sourceUid, p_month: input.month + '-01', p_status: input.status ?? null,
      p_after_date: input.after ?? null, p_after_id: input.afterId ?? null, p_limit: input.limit, p_reason: input.reason,
    };
    const statement = authority
      ? await authority.read(actor,params)
      : await actorRpc<SupportStatementPage>(actor,'rota_earnings_support_statement',params);
    if (statement?.target?.sourceUid !== input.sourceUid) throw new EarningsError(503,'earnings_unavailable');
    return privateJson(statement);
  } catch (error) {
    return earningsErrorResponse(error);
  }
}
