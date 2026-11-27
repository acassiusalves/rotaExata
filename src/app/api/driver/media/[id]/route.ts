import {nativeStaffEnabled} from '@/lib/staff/mode';
import {driverAuthority} from '@/lib/server/driver/authority';
import {driverAssistAuthority} from '@/lib/server/staff/driver-assist-authority';
import {authorizeOperationalWriter} from '@/lib/firebase/operational-writer-auth';
import {readDeliveryPhoto} from '@/lib/server/driver/media';
import {EarningsError,earningsErrorResponse} from '@/lib/server/earnings/transport';
import {privateJson} from '@/lib/server/earnings/store';

export const runtime='nodejs';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const mode=request.headers.get('x-rota-media-mode');
    let sourceUid:string|undefined;
    if (mode==='operator') {
      if (nativeStaffEnabled) throw new EarningsError(410,'rota_staff_native_required');
      await authorizeOperationalWriter(request);
    }
    else if (mode==='assist') sourceUid=(await driverAssistAuthority(request)).sourceUid;
    else {
      const actor=await driverAuthority(request,mode==='legacy-driver'?'legacy':'native');
      sourceUid=actor.sourceUid;
    }
    return privateJson({src:await readDeliveryPhoto((await params).id,{sourceUid})});
  } catch(error) { return earningsErrorResponse(error); }
}
