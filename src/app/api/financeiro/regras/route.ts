import { requireEarningsActor } from '@/lib/server/earnings/actor';
import { loadRule, publishRule } from '@/lib/server/earnings/rules';
import { privateJson } from '@/lib/server/earnings/store';
import { earningsErrorResponse, readJsonBody } from '@/lib/server/earnings/transport';

export const runtime = 'nodejs';
export async function GET(request: Request) {
  try {
    return privateJson(await loadRule(await requireEarningsActor(request,'rule:read')));
  } catch (error) { return earningsErrorResponse(error); }
}
export async function PATCH(request: Request) {
  try {
    const actor = await requireEarningsActor(request,'rule:publish');
    const result = await publishRule(actor,await readJsonBody(request,70000));
    return privateJson(result, result && typeof result === 'object' && 'issues' in result ? 422 : 200);
  } catch (error) { return earningsErrorResponse(error); }
}
