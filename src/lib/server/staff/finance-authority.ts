import { nativeStaffEnabled } from '../../staff/mode.ts';
import { requireEarningsActor,resolveEarningsActor,verifyNativeSession,type EarningsAction } from '../earnings/actor.ts';
import { resolveStaffActor } from './actor.ts';

type StaffEarningsAction=Exclude<EarningsAction,'statement'|'route:operate'>;

export async function requireStaffEarningsActor(request:Request,action:StaffEarningsAction) {
  if (!nativeStaffEnabled) return requireEarningsActor(request,action);
  const identity=await verifyNativeSession(request);
  await resolveStaffActor(identity,action.startsWith('rule:')?'finance:rules':'finance:payments');
  return resolveEarningsActor(identity,action);
}
