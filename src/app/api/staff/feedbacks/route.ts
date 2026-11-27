import {privateJson} from '@/lib/server/earnings/store';
import {EarningsError,earningsErrorResponse,readJsonBody} from '@/lib/server/earnings/transport';
import {requireStaffActor} from '@/lib/server/staff/actor';
import {changeStaffFeedback,listStaffFeedback,submitStaffFeedback} from '@/lib/server/staff/feedbacks';
import {staffSourceDb} from '@/lib/server/staff/source';
import {staffFeedbackCommandSchema,staffFeedbackListSchema,staffFeedbackSubmissionSchema} from '@/lib/staff/feedback-contract';
import {nativeStaffEnabled} from '@/lib/staff/mode';

export const runtime='nodejs';

async function context(request:Request) {
  if (!nativeStaffEnabled) throw new EarningsError(404,'staff_unavailable');
  const actor=await requireStaffActor(request,'feedbacks:manage');
  return {actor,db:staffSourceDb(actor)};
}

export async function GET(request:Request) {
  try {
    const {actor,db}=await context(request);
    const query=staffFeedbackListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new EarningsError(422,'staff_feedback_invalid_filter');
    return privateJson(await listStaffFeedback(db,actor,query.data));
  } catch (error) { return earningsErrorResponse(error); }
}

export async function PATCH(request:Request) {
  try {
    const {actor,db}=await context(request);
    const command=staffFeedbackCommandSchema.safeParse(await readJsonBody(request,12_000));
    if (!command.success) throw new EarningsError(422,'staff_feedback_invalid_command');
    return privateJson(await changeStaffFeedback(db,actor,command.data));
  } catch (error) { return earningsErrorResponse(error); }
}

export async function POST(request:Request) {
  try {
    const {actor,db}=await context(request);
    const submission=staffFeedbackSubmissionSchema.safeParse(await readJsonBody(request,262_144));
    if (!submission.success) throw new EarningsError(422,'staff_feedback_invalid_submission');
    return privateJson(await submitStaffFeedback(db,actor,submission.data));
  } catch (error) { return earningsErrorResponse(error); }
}
