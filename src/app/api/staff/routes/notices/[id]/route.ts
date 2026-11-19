import { requireStaffActor } from '@/lib/server/staff/actor';
import { dispatchStaffRouteNotice } from '@/lib/server/staff/route-notices';
import { staffSourceDb } from '@/lib/server/staff/source';
import { EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await requireStaffActor(request,'route:notify');
    const {id}=await params;
    if (!/^[a-f0-9]{64}$/.test(id)) throw new EarningsError(404,'staff_notice_not_found');
    const push=await dispatchStaffRouteNotice(staffSourceDb(actor),id);
    return privateJson({ok:true,push});
  } catch(error) {return earningsErrorResponse(error);}
}
