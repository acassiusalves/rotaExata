import { ASSIST_HEADER, isAssistGrantId } from '@/lib/driver/assist-policy';
import type { DriverAuthority } from '@/lib/server/driver/authority';
import { EarningsError } from '@/lib/server/earnings/transport';
import { requireStaffActor } from './actor';
import { resolveDriverAssist } from './driver-assist';
import { staffSourceDb } from './source';

/** Sessão do operador + acesso válido → autoridade para ler e agir como o motorista do acesso. */
export async function driverAssistAuthority(request: Request): Promise<DriverAuthority> {
  const actor = await requireStaffActor(request, 'driver:operate');
  const grantId = request.headers.get(ASSIST_HEADER);
  if (!isAssistGrantId(grantId)) throw new EarningsError(403, 'assist_not_found');
  const assist = await resolveDriverAssist(staffSourceDb(actor), actor, grantId);
  return {
    sourceUid: assist.driverUid, userId: actor.userId, scopeId: actor.scopeId, sessionId: actor.sessionId, native: true,
    assist: { grantId, staffUserId: assist.staffUserId, staffSourceUid: assist.staffSourceUid, staffName: assist.staffName,
      driverName: assist.driverName, expiresAt: assist.expiresAt },
  };
}
