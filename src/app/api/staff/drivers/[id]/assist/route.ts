import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { openDriverAssist } from '@/lib/server/staff/driver-assist';
import { staffSourceDb } from '@/lib/server/staff/source';
import { routeDocumentId } from '@/lib/staff/route-contract';
import { MIN_REOPEN_REASON_LENGTH } from '@/lib/route-reopen';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export const runtime='nodejs';
const command=z.object({reason:z.string().trim().min(MIN_REOPEN_REASON_LENGTH).max(500)}).strict();

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await requireStaffActor(request,'driver:operate');
    const id=routeDocumentId.safeParse((await params).id);
    const body=command.safeParse(await readJsonBody(request,3000));
    if (!id.success || !body.success) throw new EarningsError(422,'staff_invalid_command');
    const assist=await openDriverAssist(staffSourceDb(actor),actor,id.data,body.data.reason);
    return privateJson({grantId:assist.grantId,driverName:assist.driverName,expiresAt:assist.expiresAt});
  } catch(error) {return earningsErrorResponse(error);}
}
