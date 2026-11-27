import { reportRequestContext } from '@/lib/reporting/report-auth';
import { readReportDetail, reportErrorResponse } from '@/lib/reporting/report-server';

export async function GET(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  try {
    const { db, actor } = await reportRequestContext(request,'native',request.method==='PATCH');
    const { reportId } = await params;
    const ownOnly = true;
    return Response.json({ report: await readReportDetail(db, actor, reportId, ownOnly) });
  } catch (error) {
    return reportErrorResponse(error);
  }
}
