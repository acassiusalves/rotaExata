import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { authenticateReportActor, ReportRequestError } from './report-server';

export async function reportRequestContext(request: Request) {
  const auth = adminAuth;
  if (!adminDb || !auth) throw new ReportRequestError('Serviço de chamados indisponível.', 503);
  const actor = await authenticateReportActor(request, adminDb, (token) => auth.verifyIdToken(token));
  return { db: adminDb, actor };
}
