import {privateJson} from '@/lib/server/earnings/store';
import {EarningsError,earningsErrorResponse} from '@/lib/server/earnings/transport';
import {requireStaffActor} from '@/lib/server/staff/actor';
import {readStaffFeedback} from '@/lib/server/staff/feedbacks';
import {staffSourceDb} from '@/lib/server/staff/source';
import {nativeStaffEnabled} from '@/lib/staff/mode';

export const runtime='nodejs';

export async function GET(request:Request,{params}:{params:Promise<{reportId:string}>}) {
  try {
    if (!nativeStaffEnabled) throw new EarningsError(404,'staff_unavailable');
    const actor=await requireStaffActor(request,'feedbacks:manage');
    const {reportId}=await params;
    return privateJson({report:await readStaffFeedback(staffSourceDb(actor),actor,reportId)});
  } catch (error) { return earningsErrorResponse(error); }
}
