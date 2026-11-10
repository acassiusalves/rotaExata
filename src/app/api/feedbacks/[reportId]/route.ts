import { reportRequestContext } from '@/lib/reporting/report-auth';
import { readReportDetail, reportErrorResponse } from '@/lib/reporting/report-server';

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const { db, actor } = await reportRequestContext(request);
    const { reportId } = await params;
    const ownOnly = new URL(request.url).searchParams.get('scope') === 'mine';
    return Response.json({ report: await readReportDetail(db, actor, reportId, ownOnly) });
  } catch (error) {
    return reportErrorResponse(error);
  }
}
