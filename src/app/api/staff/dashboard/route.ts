import { readStaffCursor } from '@/lib/server/staff/query-page';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { listMonitoredRoutes } from '@/lib/server/staff/route-monitor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { privateJson } from '@/lib/server/earnings/store';
import { earningsErrorResponse } from '@/lib/server/earnings/transport';

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'dashboard:read');
    return privateJson(await listMonitoredRoutes(staffSourceDb(actor),'dashboard',readStaffCursor(request)));
  } catch(error) {return earningsErrorResponse(error);}
}
