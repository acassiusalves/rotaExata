import { requireStaffEarningsActor } from '@/lib/server/staff/finance-authority';
import { listSourceReviews,readSourceReview,previewSourceReview,confirmSourceReview } from '@/lib/server/earnings/source-reviews';
import { sourceReviewDetailQuery,sourceReviewListQuery,sourceReviewPreviewSchema,sourceReviewConfirmSchema } from '@/lib/earnings/source-review-contract';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';

export const runtime = 'nodejs';
export async function GET(request:Request) {
  try {
    const actor=await requireStaffEarningsActor(request,'payment:read');
    const query=Object.fromEntries(new URL(request.url).searchParams);
    if (Object.hasOwn(query,'eventId')) {
      const parsed=sourceReviewDetailQuery.safeParse(query);
      if (!parsed.success) throw new EarningsError(422,'earnings_invalid_review');
      return privateJson(await readSourceReview(actor,parsed.data.eventId));
    }
    const parsed=sourceReviewListQuery.safeParse(query);
    if (!parsed.success) throw new EarningsError(422,'earnings_invalid_review');
    return privateJson(await listSourceReviews(actor,parsed.data));
  } catch (error) { return earningsErrorResponse(error); }
}

export async function POST(request:Request) {
  try {
    const actor=await requireStaffEarningsActor(request,'payment:write');
    const parsed=sourceReviewPreviewSchema.safeParse(await readJsonBody(request,24576));
    if (!parsed.success) throw new EarningsError(422,'earnings_invalid_review');
    return privateJson(await previewSourceReview(actor,parsed.data));
  } catch (error) { return earningsErrorResponse(error); }
}

export async function PATCH(request:Request) {
  try {
    const actor=await requireStaffEarningsActor(request,'payment:write');
    const parsed=sourceReviewConfirmSchema.safeParse(await readJsonBody(request,24576));
    if (!parsed.success) throw new EarningsError(422,'earnings_invalid_review');
    return privateJson(await confirmSourceReview(actor,parsed.data));
  } catch (error) { return earningsErrorResponse(error); }
}
