import { createHash } from 'node:crypto';
import { reportRequestContext } from '@/lib/reporting/report-auth';
import { readSubmission } from '@/lib/reporting/report-contract';
import { createReport, reportErrorResponse, ReportRequestError, validReportId } from '@/lib/reporting/report-server';
import { sanitizeForFirestore, sanitizeText } from '@/lib/reporting/sanitize';
import { FeedbackJsonError, readFeedbackJson } from '@/lib/reporting/feedback-json';

export async function POST(request: Request) {
  try {
    const { db, actor } = await reportRequestContext(request);
    const raw = await readFeedbackJson(request);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new ReportRequestError('Dados do chamado inválidos.', 400);
    }
    const body = raw as Record<string, unknown>;
    const submission = readSubmission(body);
    if (!submission || (body.submissionId !== undefined && !validReportId(body.submissionId))) {
      throw new ReportRequestError('Preencha os campos obrigatórios do chamado.', 400);
    }
    const url = typeof body.url === 'string' ? sanitizeText(body.url, 2000) : '';
    const logs = sanitizeForFirestore(Array.isArray(body.logs) ? body.logs.slice(-10) : [], {
      maxDepth: 4, maxArrayLength: 20, maxStringLength: 4000,
    });
    let pathname = '';
    try { pathname = new URL(url).pathname; } catch { /* Legacy context may not have a URL. */ }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify(['rota_exata', submission.category, pathname, Array.isArray(logs) ? logs[0] ?? null : null]))
      .digest('hex').slice(0, 20);
    const saved = await createReport(db, actor.uid, 'rota_exata', body.submissionId as string | undefined, {
      category: submission.category,
      description: sanitizeText(submission.description, 5000),
      improvement: submission.improvement ? sanitizeForFirestore(submission.improvement, { maxStringLength: 2000 }) : null,
      user: { uid: actor.uid, name: actor.name, email: actor.email, role: actor.role },
      context: {
        url, pathname,
        userAgent: typeof body.userAgent === 'string' ? sanitizeText(body.userAgent, 1000) : '',
        resolution: typeof body.resolution === 'string' ? sanitizeText(body.resolution, 80) : '',
      },
      logs,
      fingerprint,
      source: 'floating_feedback_button',
    });
    return Response.json({ success: true, ...saved });
  } catch (error) {
    if (error instanceof FeedbackJsonError) return Response.json({ error: error.message }, { status: error.status });
    return reportErrorResponse(error);
  }
}
