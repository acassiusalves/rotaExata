import { requireStaffActor } from '@/lib/server/staff/actor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { applyStaffReportCommand, readStaffReport } from '@/lib/server/staff/reports';
import { reportCommandSchema, reportSelectionSchema } from '@/lib/staff/reports-contract';
import { EarningsError, earningsErrorResponse, readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function GET(request:Request) {
  try {
    const selection=reportSelectionSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!selection.success) throw new EarningsError(422,'staff_invalid_query');
    const actor=await requireStaffActor(request,selection.data.view==='general'?'reports:general':'reports:numbers');
    return privateJson(await readStaffReport(staffSourceDb(actor),selection.data));
  } catch (error) {
    return earningsErrorResponse(error);
  }
}

export async function PATCH(request:Request) {
  try {
    const command=reportCommandSchema.safeParse(await readJsonBody(request,48_000));
    if (!command.success) throw new EarningsError(422,'staff_invalid_command');
    const actor=await requireStaffActor(request,command.data.kind==='edit'?'reports:edit':'reports:reconcile');
    return privateJson(await applyStaffReportCommand(staffSourceDb(actor),actor,command.data));
  } catch (error) {
    return earningsErrorResponse(error);
  }
}
