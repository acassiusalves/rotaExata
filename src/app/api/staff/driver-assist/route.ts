import { ASSIST_HEADER,isAssistGrantId } from '@/lib/driver/assist-policy';
import { serveDriverRuntimeAs } from '@/lib/server/driver/runtime';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { endDriverAssist } from '@/lib/server/staff/driver-assist';
import { driverAssistAuthority } from '@/lib/server/staff/driver-assist-authority';
import { staffSourceDb } from '@/lib/server/staff/source';
import { EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export const runtime='nodejs';

async function serve(request:Request) {
  try { return await serveDriverRuntimeAs(request,await driverAssistAuthority(request)); }
  catch(error) {return earningsErrorResponse(error);}
}
export const GET=serve;
export const POST=serve;

export async function DELETE(request:Request) {
  try {
    const actor=await requireStaffActor(request,'driver:operate');
    const grantId=request.headers.get(ASSIST_HEADER);
    if (!isAssistGrantId(grantId)) throw new EarningsError(403,'assist_not_found');
    await endDriverAssist(staffSourceDb(actor),actor,grantId);
    return privateJson({ok:true});
  } catch(error) {return earningsErrorResponse(error);}
}
