import { requireStaffEarningsActor } from '@/lib/server/staff/finance-authority';
import { previewRule } from '@/lib/server/earnings/rules';
import { privateJson } from '@/lib/server/earnings/store';
import { earningsErrorResponse, readJsonBody } from '@/lib/server/earnings/transport';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    await requireStaffEarningsActor(request,'rule:read');
    const result = previewRule(await readJsonBody(request,600000));
    return privateJson(result,'issues' in result ? 422 : 200);
  } catch (error) { return earningsErrorResponse(error); }
}
