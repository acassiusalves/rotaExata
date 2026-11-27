import { nativeStaffEnabled } from '@/lib/staff/mode';
import { resolveStaffActor } from '@/lib/server/staff/actor';
import { z } from 'zod';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import { earningsScopeId,verifyNativeSession } from '@/lib/server/earnings/actor';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse,earningsRpc,readJsonBody,updateSupabasePassword } from '@/lib/server/earnings/transport';
import { projectDriverDispatch,readDriverDispatchState } from './onboarding';
import { changeDriverPassword } from './account-password';
import { driverAccountSchema,driverAccountCommand } from '@/lib/driver/account-contract';

const dispatchGuard=z.object({provisioningId:z.string().uuid(),sourceProject:z.string(),revision:z.number().int().nonnegative().safe()});
const accountRecord=driverAccountSchema.extend({nativeSource:dispatchGuard.omit({revision:true}).extend({lastActivationRevision:dispatchGuard.shape.revision}).optional()});
const passwordCommand=z.object({password:z.string().min(8).max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72)}).strict();

function accountResult<T>(payload:unknown,schema:z.ZodType<T>) {
  const code=(payload as {errorCode?:unknown}|null)?.errorCode;
  if (code==='platform_session_revoked') throw new EarningsError(401,'earnings_unauthorized');
  if (code==='platform_access_denied' || code==='platform_delegated_session_denied' || code==='platform_email_unverified' ||
      code==='platform_password_change_required') throw new EarningsError(403,'earnings_access_denied');
  if (code==='driver_account_revision_conflict' || code==='driver_account_command_conflict' || code==='driver_account_source_disabled')
    throw new EarningsError(409,code);
  if (code==='driver_provision_source_conflict') throw new EarningsError(409,code);
  if (code==='driver_account_invalid_command') throw new EarningsError(422,code);
  const parsed=schema.safeParse(payload);
  if (!parsed.success) throw new EarningsError(503,'earnings_unavailable');
  return parsed.data;
}

function assertDriverPhase() {
  if (!nativeDriverEnabled) throw new EarningsError(404,'route_not_found');
}

export async function serveDriverAccounts(request:Request) {
  try {
    assertDriverPhase();
    const actor=await verifyNativeSession(request);
    if (nativeStaffEnabled) await resolveStaffActor(actor,'drivers:accounts');
    const command=request.method==='POST' ? driverAccountCommand.safeParse(await readJsonBody(request,4096)) : null;
    if (command && !command.success) throw new EarningsError(422,'driver_account_invalid_command');
    const body=command?.data;
    const args={p_user_id:actor.userId,p_session_id:actor.sessionId,p_scope_id:earningsScopeId()};
    const readGuard=async (action:string)=>{
      if (!body) return null;
      return accountResult(await earningsRpc('rota_driver_dispatch_preflight',{
        ...args,p_target_id:body.targetId,p_action:action,p_revision:body.revision,p_command_id:body.commandId,
      }),dispatchGuard.nullable());
    };
    if (body?.action==='restore_dispatch') {
      const guard=await readGuard(body.action);
      if (!guard) throw new EarningsError(403,'earnings_access_denied');
      await projectDriverDispatch(body.targetId,guard,'restore');
      await readGuard('restore_dispatch_applied');
      return privateJson({ok:true});
    }
    const guard=body && (body.action==='set_active' || body.action==='set_inactive') ? await readGuard(body.action) : null;
    if (guard && body?.action==='set_inactive') await projectDriverDispatch(body.targetId,guard,false);
    const result=await earningsRpc('rota_driver_accounts',{
      ...args,
      p_target_id:body?.targetId ?? null,p_action:body?.action ?? null,p_expected_revision:body?.revision ?? null,p_command_id:body?.commandId ?? null,
    });
    if (!body) {
      const {accounts}=accountResult(result,z.object({accounts:z.array(accountRecord)}));
      return privateJson({accounts:await Promise.all(accounts.map(async ({nativeSource,...account})=>{
        if (!nativeSource) return account;
        const {lastActivationRevision,...source}=nativeSource;
        const dispatchState=await readDriverDispatchState(account.userId,{...source,revision:lastActivationRevision},account.active);
        return {...account,dispatchState};
      }))});
    }
    const account=accountResult(result,driverAccountSchema);
    if (guard && body.action==='set_active') await projectDriverDispatch(body.targetId,guard,true);
    return privateJson(account);
  } catch (error) { return earningsErrorResponse(error); }
}

export async function serveDriverPassword(request:Request) {
  try {
    if (!nativeDriverEnabled && process.env.NEXT_PUBLIC_ROTA_EARNINGS_ENABLED!=='true') throw new EarningsError(404,'route_not_found');
    const actor=await verifyNativeSession(request);
    const command=passwordCommand.safeParse(await readJsonBody(request,1024));
    if (!command.success) throw new EarningsError(422,'driver_password_weak');
    const result=await changeDriverPassword(command.data.password,{
      updatePassword:password=>updateSupabasePassword(actor.token,actor.userId,password),
      state:async revision=>accountResult(await earningsRpc('rota_driver_password_change',{
        p_user_id:actor.userId,p_session_id:actor.sessionId,p_scope_id:earningsScopeId(),p_expected_revision:revision,
      }),driverAccountSchema),
    });
    return privateJson({mustChangePassword:result.mustChangePassword});
  } catch (error) { return earningsErrorResponse(error); }
}
