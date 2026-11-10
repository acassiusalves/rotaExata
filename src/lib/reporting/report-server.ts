import { createHash } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getReportCapabilities, isReportStatus, normalizeReport, selectReportPage, validReportId,
  type ReportActor, type ReportOriginSystem,
} from './report-contract';

type Database = FirebaseFirestore.Firestore;
type Actor = ReportActor & { name: string; email: string };
type FirestoreData = FirebaseFirestore.DocumentData;

export class ReportRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function authenticateReportActor(
  request: Request,
  db: Database,
  verifyIdToken: (token: string) => Promise<DecodedIdToken>,
): Promise<Actor> {
  const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) throw new ReportRequestError('Entre novamente para acessar os chamados.', 401);
  let identity;
  try {
    identity = await verifyIdToken(token);
  } catch {
    throw new ReportRequestError('Sessão inválida. Entre novamente.', 401);
  }
  const profile = (await db.collection('users').doc(identity.uid).get()).data();
  if (!profile || profile.active === false) throw new ReportRequestError('Acesso negado.', 403);
  return {
    uid: identity.uid,
    role: typeof profile.role === 'string' ? profile.role : 'user',
    email: identity.email ?? profile.email ?? '',
    name: profile.name || profile.displayName || identity.name || identity.email || 'Usuário',
    active: true,
  };
}

export function reportErrorResponse(error: unknown) {
  if (error instanceof ReportRequestError) return Response.json({ error: error.message }, { status: error.status });
  console.error('Falha na operação de chamados', error);
  return Response.json({ error: 'Não foi possível concluir a operação.' }, { status: 500 });
}

export { validReportId } from './report-contract';

export async function readReportCommand(request: Request) {
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // Return a stable API error for malformed requests.
  }
  throw new ReportRequestError('Dados do chamado inválidos.', 400);
}

export async function listReports(db: Database, actor: Actor, request: Request) {
  const collection = db.collection('error_reports');
  const fields = ['originSystem', 'category', 'context.url', 'schemaVersion', 'description', 'improvement', 'user', 'status', 'createdAt'];
  const params = new URL(request.url).searchParams;
  const ownOnly = params.get('scope') === 'mine';
  const manager = actor.role === 'socio' || actor.role === 'gestor';
  const requests = !ownOnly && actor.role === 'admin' ? [collection.select(...fields).get()]
    : [collection.where('user.uid', '==', actor.uid).select(...fields).get()];
  if (!ownOnly && manager) requests.push(collection.where('originSystem', '==', 'rota_exata').select(...fields).get());
  const rows = new Map<string, ReturnType<typeof normalizeReport>>();
  for (const snapshot of await Promise.all(requests)) {
    for (const doc of snapshot.docs) rows.set(doc.id, normalizeReport(doc.id, doc.data()));
  }
  return selectReportPage([...rows.values()], actor, params);
}

export function exposeReport(id: string, data: FirestoreData, actor: Actor) {
  const summary = normalizeReport(id, data);
  const capabilities = getReportCapabilities(actor, summary);
  if (!capabilities.view) throw new ReportRequestError('Chamado não encontrado.', 404);
  return { ...data, ...summary, capabilities };
}

export async function readReportDetail(db: Database, actor: Actor, id: string) {
  if (!validReportId(id)) throw new ReportRequestError('Chamado não encontrado.', 404);
  const data = (await db.collection('error_reports').doc(id).get()).data();
  if (!data) throw new ReportRequestError('Chamado não encontrado.', 404);
  return exposeReport(id, data, actor);
}

function operationId(parts: string[]) {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export async function createReport(
  db: Database, uid: string, origin: Exclude<ReportOriginSystem, 'unknown'>,
  submissionId: string | undefined, data: FirestoreData,
) {
  const collection = db.collection('error_reports');
  const ref = submissionId ? collection.doc(operationId([origin, uid, submissionId])) : collection.doc();
  const limitRef = db.collection('feedback_rate_limits').doc(uid);
  const now = new Date();
  return db.runTransaction(async (tx) => {
    if (submissionId) {
      const existing = (await tx.get(ref)).data();
      if (existing) return { id: ref.id, fingerprint: existing.fingerprint };
    }
    const limit = (await tx.get(limitRef)).data();
    const windowStart = limit?.windowStart instanceof Date ? limit.windowStart : limit?.windowStart?.toDate?.();
    const sameWindow = windowStart && now.getTime() - windowStart.getTime() < 600000;
    const count = sameWindow && typeof limit?.count === 'number' ? limit.count : 0;
    if (count >= 5) throw new ReportRequestError('Muitos chamados enviados em pouco tempo.', 429);
    tx.set(limitRef, { uid, count: count + 1, windowStart: sameWindow ? windowStart : now, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(ref, {
      ...data, originSystem: origin, schemaVersion: 3, status: 'pending',
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id, fingerprint: data.fingerprint };
  });
}

function writeNotification(
  db: Database, tx: FirebaseFirestore.Transaction, origin: ReportOriginSystem, uid: string,
  id: string, event: string, reopened: boolean, role?: string,
) {
  const title = reopened ? 'Chamado reaberto' : 'Chamado resolvido';
  const message = reopened ? 'O autor reabriu um chamado. Abra o chamado para ver o complemento.'
    : 'Seu chamado foi marcado como resolvido.';
  if (origin === 'rota_exata') {
    const operator = role === 'admin' || role === 'socio' || role === 'gestor';
    tx.set(db.collection('notifications').doc(operationId([event, uid])), {
      type: 'system', title, message, read: false, opened: false, driverId: uid,
      reportId: id, timestamp: FieldValue.serverTimestamp(), priority: 'medium',
      link: `${operator ? '/admin/erros' : '/driver/chamados'}?report=${encodeURIComponent(id)}`,
    });
  } else if (origin === 'luna') {
    tx.set(db.collection('notificacoes').doc(operationId([event, uid])), {
      tipo: reopened ? 'sistema' : 'reporte_resolvido', titulo: title, mensagem: message, lida: false, usuarioId: uid,
      reportId: id, createdAt: FieldValue.serverTimestamp(),
      link: `/configuracoes/sistema/erros?report=${encodeURIComponent(id)}`,
    });
  }
}

export async function changeReportStatus(db: Database, actor: Actor, command: Record<string, unknown>) {
  const { reportId, status, action, requestId } = command;
  const reopen = action === 'reopen';
  const details = typeof command.details === 'string' ? command.details.trim() : '';
  if (!validReportId(reportId) || action !== undefined && !reopen || !reopen && !isReportStatus(status) ||
      reopen && (!details || details.length > 5000) || requestId !== undefined && !validReportId(requestId)) {
    throw new ReportRequestError('Dados do chamado inválidos.', 400);
  }
  const next = reopen ? 'pending' : status;
  const ref = db.collection('error_reports').doc(reportId);
  return db.runTransaction(async (tx) => {
    const data = (await tx.get(ref)).data();
    if (!data) throw new ReportRequestError('Chamado não encontrado.', 404);
    const summary = normalizeReport(reportId, data);
    const access = getReportCapabilities(actor, summary);
    if (!access.view) throw new ReportRequestError('Chamado não encontrado.', 404);
    if (!(reopen ? access.reopen : access.manage)) throw new ReportRequestError('Acesso negado.', 403);
    const commandRef = requestId ? ref.collection('operations').doc(operationId([actor.uid, requestId as string])) : null;
    if (commandRef && (await tx.get(commandRef)).exists) return exposeReport(reportId, data, actor);
    if (reopen && summary.status !== 'resolved') throw new ReportRequestError('Somente chamados resolvidos podem ser reabertos.', 409);
    if (summary.status === next) {
      if (commandRef) tx.create(commandRef, { createdAt: FieldValue.serverTimestamp() });
      return exposeReport(reportId, data, actor);
    }
    if (!reopen && (next === 'pending' || summary.status === 'resolved' && next !== 'in_progress')) {
      throw new ReportRequestError('Transição de status não permitida.', 409);
    }
    const origin = summary.trustedOrigin;
    const recipients: { uid: string; role?: string }[] = [];
    if (origin !== 'unknown' && reopen) {
      const roles = origin === 'rota_exata' ? ['admin', 'socio', 'gestor'] : ['admin'];
      const users = await tx.get(db.collection('users').where('role', 'in', roles));
      for (const user of users.docs) if (user.data().active !== false) recipients.push({ uid: user.id, role: user.data().role });
    } else if (origin !== 'unknown' && next === 'resolved' && summary.user.uid) {
      const profile = (await tx.get(db.collection('users').doc(summary.user.uid))).data();
      if (profile && profile.active !== false) recipients.push({ uid: summary.user.uid, role: profile.role });
    }
    const event = operationId([reportId, String((data.statusHistory?.length ?? 0) + 1)]);
    const now = new Date().toISOString();
    const updated = {
      status: next,
      statusHistory: [...(data.statusHistory ?? []), {
        previous: summary.status, next, at: now, actor: { uid: actor.uid, name: actor.name },
        notificationPending: origin === 'unknown' && (reopen || next === 'resolved'),
      }],
      ...(reopen ? {
        reopenHistory: [...(data.reopenHistory ?? []), { details, reopenedAt: now, reopenedBy: { uid: actor.uid, name: actor.name, email: actor.email } }],
        reopenCount: (data.reopenCount ?? 0) + 1,
      } : {}),
    };
    tx.update(ref, { ...updated, updatedAt: FieldValue.serverTimestamp() });
    if (commandRef) tx.create(commandRef, { createdAt: FieldValue.serverTimestamp() });
    for (const recipient of recipients) writeNotification(db, tx, origin, recipient.uid, reportId, event, reopen, recipient.role);
    return exposeReport(reportId, { ...data, ...updated }, actor);
  });
}
