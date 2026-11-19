import { requireStaffActor } from '@/lib/server/staff/actor';
import { patchStaffSettings,readStaffSettings } from '@/lib/server/staff/settings';
import { staffSourceDb } from '@/lib/server/staff/source';
import { staffSettingsCommand } from '@/lib/staff/settings-contract';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'settings:manage');
    return privateJson(await readStaffSettings(staffSourceDb(actor)));
  } catch(error) {return earningsErrorResponse(error);}
}

export async function PATCH(request:Request) {
  try {
    const actor=await requireStaffActor(request,'settings:manage');
    const body=staffSettingsCommand.safeParse(await readJsonBody(request,12_000));
    if (!body.success) throw new EarningsError(422,'staff_invalid_settings');
    return privateJson(await patchStaffSettings(staffSourceDb(actor),actor,body.data));
  } catch(error) {return earningsErrorResponse(error);}
}
