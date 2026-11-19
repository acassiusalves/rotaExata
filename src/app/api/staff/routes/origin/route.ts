import { requireStaffActor } from '@/lib/server/staff/actor';
import { projectStaffPlace } from '@/lib/server/staff/route-projection';
import { staffSourceDb } from '@/lib/server/staff/source';
import { earningsErrorResponse } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'route:create');
    const snap=await staffSourceDb(actor).doc('settings/defaultOrigin').get();
    return privateJson({origin:snap.get('origin') ? projectStaffPlace(snap.get('origin')):null});
  } catch(error) {return earningsErrorResponse(error);}
}
