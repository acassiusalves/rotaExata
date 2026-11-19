import { requireStaffActor } from '@/lib/server/staff/actor';
import { readStaffDrivers } from '@/lib/server/staff/drivers';
import { staffSourceDb } from '@/lib/server/staff/source';
import { earningsErrorResponse } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'drivers:list');
    return privateJson(await readStaffDrivers(staffSourceDb(actor)));
  } catch(error) {return earningsErrorResponse(error);}
}
