import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { patchStaffDriver } from '@/lib/server/staff/drivers';
import { staffSourceDb } from '@/lib/server/staff/source';
import { routeDocumentId } from '@/lib/staff/route-contract';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

const command=z.object({
  revision:z.string().regex(/^[a-f0-9]{64}$/),
  displayName:z.string().trim().min(1).max(150),
  phone:z.string().regex(/^\d{0,15}$/),
  vehicle:z.object({type:z.string().trim().max(40),plate:z.string().trim().max(12).toUpperCase()}).strict(),
}).strict();

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await requireStaffActor(request,'driver:edit');
    const id=routeDocumentId.safeParse((await params).id);
    const body=command.safeParse(await readJsonBody(request,4096));
    if (!id.success || !body.success) throw new EarningsError(422,'staff_invalid_command');
    return privateJson(await patchStaffDriver(staffSourceDb(actor),actor,id.data,body.data));
  } catch(error) {return earningsErrorResponse(error);}
}
