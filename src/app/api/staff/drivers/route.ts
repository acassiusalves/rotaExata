import { requireStaffActor } from '@/lib/server/staff/actor';
import { readStaffCursor } from '@/lib/server/staff/query-page';
import { readStaffDrivers,readStaffDriverAssignments } from '@/lib/server/staff/drivers';
import { staffSourceDb } from '@/lib/server/staff/source';
import { EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'drivers:list');
    const db=staffSourceDb(actor);
    const view=new URL(request.url).searchParams.get('view');
    const cursor=readStaffCursor(request);
    if (view!==null && view!=='assignments') throw new EarningsError(422,'staff_invalid_query');
    return privateJson(view==='assignments' ? await readStaffDriverAssignments(db,cursor):await readStaffDrivers(db,cursor));
  } catch(error) {return earningsErrorResponse(error);}
}
