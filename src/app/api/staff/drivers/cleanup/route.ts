import { requireStaffActor } from '@/lib/server/staff/actor';
import { cleanupStaffDriverPresence } from '@/lib/server/staff/drivers';
import { staffSourceDb } from '@/lib/server/staff/source';
import { earningsErrorResponse } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function POST(request:Request) {
  try {
    const actor=await requireStaffActor(request,'drivers:cleanup');
    return privateJson(await cleanupStaffDriverPresence(staffSourceDb(actor)));
  } catch(error) {return earningsErrorResponse(error);}
}
