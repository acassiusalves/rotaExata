import { driverAuthority } from '@/lib/server/driver/authority';
import { EarningsError } from '@/lib/server/earnings/transport';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { authenticateReportActor, ReportRequestError } from './report-server';

export async function reportRequestContext(request: Request,phase:'native'|'legacy'='legacy',write=false) {
  if (phase==='native') {
    if (!adminDb) throw new ReportRequestError('Serviço de chamados indisponível.',503);
    try {
      const actor=await driverAuthority(request,'native',write);
      const profile=(await adminDb.collection('users').doc(actor.sourceUid).get()).data();
      if (!profile) throw new ReportRequestError('Acesso negado.',403);
      return {db:adminDb,actor:{
        uid:actor.sourceUid,role:'driver',active:true,
        name:typeof profile.displayName==='string' ? profile.displayName : typeof profile.name==='string' ? profile.name : 'Motorista',
        email:typeof profile.email==='string' ? profile.email : '',
      }};
    } catch (error) {
      if (error instanceof EarningsError) throw new ReportRequestError('A sessão precisa de acesso à conta do motorista.',error.status);
      throw error;
    }
  }
  const auth = adminAuth;
  if (!adminDb || !auth) throw new ReportRequestError('Serviço de chamados indisponível.', 503);
  const actor = await authenticateReportActor(request, adminDb, (token) => auth.verifyIdToken(token));
  return { db: adminDb, actor };
}
