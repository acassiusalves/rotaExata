import { z } from 'zod';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { earningsScopeId,verifyNativeSession } from '@/lib/server/earnings/actor';
import { earningsRpc,EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

const result=z.object({kind:z.enum(['staff','driver'])});

export async function GET(request:Request) {
  try {
    if (!nativeStaffEnabled) throw new EarningsError(404,'earnings_unavailable');
    const identity=await verifyNativeSession(request);
    const data=await earningsRpc('rota_recovery_account_kind',{
      p_user_id:identity.userId,p_session_id:identity.sessionId,p_scope_id:earningsScopeId(),
    }) as {errorCode?:string};
    if (data?.errorCode==='platform_session_revoked') throw new EarningsError(401,'earnings_unauthorized');
    if (data?.errorCode) throw new EarningsError(403,'earnings_access_denied');
    return privateJson(result.parse(data));
  } catch(error) {return earningsErrorResponse(error);}
}
