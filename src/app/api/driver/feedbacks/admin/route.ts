import { reportRequestContext } from '@/lib/reporting/report-auth';
import { changeReportStatus, listReports, readReportCommand, reportErrorResponse } from '@/lib/reporting/report-server';

export async function GET(request: Request) {
  try {
    const { db, actor } = await reportRequestContext(request,'native',request.method==='PATCH');
    return Response.json(await listReports(db, actor, request));
  } catch (error) {
    return reportErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const { db, actor } = await reportRequestContext(request,'native',request.method==='PATCH');
    const command = await readReportCommand(request);
    return Response.json({ success: true, report: await changeReportStatus(db, actor, command) });
  } catch (error) {
    return reportErrorResponse(error);
  }
}
