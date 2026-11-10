import { reportRequestContext } from '@/lib/reporting/report-auth';
import { readReportDetail, reportErrorResponse } from '@/lib/reporting/report-server';

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const { db, actor } = await reportRequestContext(request);
    const { reportId } = await params;
    return Response.json({ report: await readReportDetail(db, actor, reportId) });
  } catch (error) {
    return reportErrorResponse(error);
  }
}
