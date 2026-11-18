import { requireEarningsActor } from '@/lib/server/earnings/actor';
import { readPeriod } from '@/lib/server/earnings/payments';
import { privateJson } from '@/lib/server/earnings/store';
import { earningsErrorResponse } from '@/lib/server/earnings/transport';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    const actor = await requireEarningsActor(request,'statement');
    return privateJson(await readPeriod(actor,request,true));
  } catch (error) { return earningsErrorResponse(error); }
}
