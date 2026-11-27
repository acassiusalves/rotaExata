import { requireStaffActor } from '@/lib/server/staff/actor';
import { previewStaffRouteCodes, repairStaffRouteCodes } from '@/lib/server/staff/history-commands';
import { staffSourceDb } from '@/lib/server/staff/source';
import { historyRepairQuerySchema, historyRepairSchema } from '@/lib/staff/history-contract';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'routes:repair-codes');
    const query=historyRepairQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new EarningsError(422,'staff_invalid_query');
    return privateJson(await previewStaffRouteCodes(staffSourceDb(actor),query.data.cursor));
  } catch(error) {
    return earningsErrorResponse(error);
  }
}

export async function POST(request:Request) {
  try {
    const actor=await requireStaffActor(request,'routes:repair-codes');
    const input=historyRepairSchema.safeParse(await readJsonBody(request,20_000));
    if (!input.success) throw new EarningsError(422,'staff_invalid_command');
    return privateJson(await repairStaffRouteCodes(staffSourceDb(actor),actor,input.data));
  } catch(error) {
    return earningsErrorResponse(error);
  }
}
