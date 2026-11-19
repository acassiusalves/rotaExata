import { requireStaffActor } from '@/lib/server/staff/actor';
import { patchStaffPermissions,readStaffPermissions } from '@/lib/server/staff/settings';
import { staffSourceDb } from '@/lib/server/staff/source';
import { staffPermissionsCommand } from '@/lib/staff/settings-contract';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'permissions:manage');
    return privateJson(await readStaffPermissions(staffSourceDb(actor)));
  } catch(error) {return earningsErrorResponse(error);}
}

export async function PATCH(request:Request) {
  try {
    const actor=await requireStaffActor(request,'permissions:manage');
    const body=staffPermissionsCommand.safeParse(await readJsonBody(request,30_000));
    if (!body.success) throw new EarningsError(422,'staff_invalid_policy');
    return privateJson(await patchStaffPermissions(staffSourceDb(actor),actor,body.data));
  } catch(error) {return earningsErrorResponse(error);}
}
