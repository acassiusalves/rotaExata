import { randomUUID } from 'node:crypto';
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { ASSIST_TTL_MS, assistGrantProblem } from '../../driver/assist-policy';
import { EarningsError } from '../earnings/transport';

export type AssistOperator = { userId: string; sessionId: string; name: string; sourceUid?: string; role?: string };
export type DriverAssist = {
  grantId: string; driverUid: string; driverName: string;
  staffUserId: string; staffSourceUid: string; staffName: string; expiresAt: string;
};

const grants = (db: Firestore) => db.collection('rotaStaffDriverAssists');
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);

/** Abre um acesso de 60 minutos ao app de um motorista e registra quem abriu e por quê. */
export async function openDriverAssist(
  db: Firestore, actor: AssistOperator, driverUid: string, reason: string, now = Date.now(),
): Promise<DriverAssist> {
  const driver = await db.collection('users').doc(driverUid).get();
  if (!driver.exists || driver.get('role') !== 'driver') throw new EarningsError(404, 'staff_driver_not_found');
  const driverName = text(driver.get('displayName')) ?? text(driver.get('name')) ?? 'Motorista';
  const grantId = randomUUID();
  const createdAt = Timestamp.fromMillis(now);
  const expiresAt = Timestamp.fromMillis(now + ASSIST_TTL_MS);
  const staffSourceUid = actor.sourceUid ?? actor.userId;
  const batch = db.batch();
  batch.create(grants(db).doc(grantId), {
    staffUserId: actor.userId, staffSessionId: actor.sessionId, staffSourceUid, staffName: actor.name,
    driverUid, driverName, reason, createdAt, expiresAt, endedAt: null,
  });
  batch.create(db.collection('activity_log').doc('staff-assist-' + grantId), {
    timestamp: createdAt, eventType: 'driver_assist_started', entityType: 'driver', entityId: driverUid,
    category: 'LOGISTICS', canonicalUserId: actor.userId, userId: staffSourceUid, userName: actor.name, userRole: actor.role ?? null,
    action: 'App do motorista aberto pelo painel', metadata: { grantId, reason, driverName, expiresAt },
  });
  await batch.commit();
  return { grantId, driverUid, driverName, staffUserId: actor.userId, staffSourceUid, staffName: actor.name,
    expiresAt: expiresAt.toDate().toISOString() };
}

/** Devolve o acesso se ele ainda vale para este operador e esta sessão. */
export async function resolveDriverAssist(
  db: Firestore, actor: { userId: string; sessionId: string }, grantId: string, now = Date.now(),
): Promise<DriverAssist> {
  const data = (await grants(db).doc(grantId).get()).data();
  const problem = assistGrantProblem(data ? {
    staffUserId: data.staffUserId, staffSessionId: data.staffSessionId,
    expiresAtMs: (data.expiresAt as Timestamp).toMillis(), endedAtMs: (data.endedAt as Timestamp | null)?.toMillis() ?? null,
  } : undefined, actor, now);
  if (problem || !data) throw new EarningsError(403, problem ?? 'assist_not_found');
  return { grantId, driverUid: data.driverUid, driverName: data.driverName, staffUserId: data.staffUserId,
    staffSourceUid: data.staffSourceUid, staffName: data.staffName, expiresAt: (data.expiresAt as Timestamp).toDate().toISOString() };
}

/** Encerra o acesso. Repetir a chamada ou encerrar um acesso já vencido não é erro. */
export async function endDriverAssist(db: Firestore, actor: AssistOperator, grantId: string, now = Date.now()) {
  let assist: DriverAssist;
  try { assist = await resolveDriverAssist(db, actor, grantId, now); }
  catch (error) {
    if (error instanceof EarningsError && error.code === 'assist_expired') return;
    throw error;
  }
  const endedAt = Timestamp.fromMillis(now);
  const batch = db.batch();
  batch.update(grants(db).doc(grantId), { endedAt });
  batch.create(db.collection('activity_log').doc('staff-assist-end-' + grantId), {
    timestamp: endedAt, eventType: 'driver_assist_ended', entityType: 'driver', entityId: assist.driverUid,
    category: 'LOGISTICS', canonicalUserId: actor.userId, userId: assist.staffSourceUid, userName: actor.name, userRole: actor.role ?? null,
    action: 'App do motorista encerrado pelo painel', metadata: { grantId },
  });
  await batch.commit();
}
