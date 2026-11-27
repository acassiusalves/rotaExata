import { requireStaffEarningsActor } from '@/lib/server/staff/finance-authority';
import { applyPaymentCommand, inspectStatement, readPayment, readPeriod } from '@/lib/server/earnings/payments';
import { privateJson } from '@/lib/server/earnings/store';
import { earningsErrorResponse, readJsonBody } from '@/lib/server/earnings/transport';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const actor = await requireStaffEarningsActor(request,'payment:read');
    const id = new URL(request.url).searchParams.get('id');
    return privateJson(id ? await readPayment(actor,id) : await readPeriod(actor,request,false));
  } catch (error) { return earningsErrorResponse(error); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireStaffEarningsActor(request,'payment:write');
    return privateJson(await applyPaymentCommand(actor,await readJsonBody(request,8000)));
  } catch (error) { return earningsErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireStaffEarningsActor(request,'payment:read');
    return privateJson(await inspectStatement(actor,await readJsonBody(request,8000)));
  } catch (error) { return earningsErrorResponse(error); }
}
