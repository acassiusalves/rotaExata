import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { plannedFingerprint, protectCompletion, sourceStopKey, timestampIso } from '../../../../functions/src/earnings-source-adapter';
import { getRouteChangeNotificationFingerprint } from '@/lib/route-change-fingerprint';
import { clearRouteChangeFlags, updateStopByIdentity } from '@/lib/route-stop-reconciliation';
import type { PlaceValue, RouteChangeNotification } from '@/lib/types';
import { earningsErrorResponse, readJsonBody } from './transport';

const routeId = z.string().min(1).max(150).regex(/^[^/]+$/);
const stopIdentity = z.object({
  id: z.string().max(150).optional(), pointCode: z.string().max(150).optional(),
  placeId: z.string().max(150).optional(), orderNumber: z.string().max(150).optional(),
});
const nullableText = (size: number) => z.string().max(size).nullable();
const photoUrl = z.string().url().max(4096).startsWith('https://').nullable();
const patch = z.object({
  deliveryStatus: z.enum(['completed','failed']),
  notes: nullableText(4000),
  failureReason: nullableText(500),
  wentToLocation: z.boolean().nullable(),
  payments: z.array(z.object({
    id: z.string().max(150), method: z.string().max(100), value: z.number().finite().nonnegative(),
    installments: z.number().int().min(1).max(100).optional(), pixType: z.enum(['qrcode','cnpj']).optional(),
  })).max(30).nullable(),
  deliveredItemIds: z.array(z.string().max(150)).max(300).nullable(),
  photoUrl,
  attemptPhotoUrl: photoUrl,
}).strict();
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), routeId }).strict(),
  z.object({ action: z.literal('finish'), routeId }).strict(),
  z.object({ action: z.literal('confirm'), routeId, targetStop: stopIdentity, patch }).strict(),
  z.object({ action: z.literal('acknowledge'), routeId, fingerprint: z.string().min(1).max(60000) }).strict(),
]);

export async function performDriverRouteAction(request: Request, uid: string) {
  if (!adminDb) return Response.json({ code: 'route_unavailable' }, { status: 503 });
  let input: z.infer<typeof actions>;
  try {
    const parsed = actions.safeParse(await readJsonBody(request,70000));
    if (!parsed.success) return Response.json({ code: 'route_invalid_request' }, { status: 400 });
    input = parsed.data;
  } catch (error) { return earningsErrorResponse(error); }

  const db = adminDb;
  const routeRef = db.collection('routes').doc(input.routeId);
  const userRef = db.collection('users').doc(uid);
  const evidenceRef = db.collection('rotaEarningRouteEvidence').doc(input.routeId);
  try {
    const result = await db.runTransaction(async tx => {
      const [routeSnap, profile, proof] = await tx.getAll(routeRef,userRef,evidenceRef);
      const data = routeSnap.data();
      const user = profile.data();
      if (!data || data.driverId !== uid || user?.role !== 'driver' || user.active === false || user.disabled === true || user.mustChangePassword) {
        return { status: 403, body: { code: 'route_access_denied' } };
      }
      const stops = (Array.isArray(data.stops) ? data.stops : []) as PlaceValue[];
      const now = Timestamp.now();
      const evidence = proof.data();
      if (input.action === 'start') {
        if (data.status === 'in_progress') return { status: 200, body: { ok: true } };
        if (data.status !== 'dispatched') return { status: 409, body: { code: 'route_invalid_state' } };
        tx.update(routeRef, { status: 'in_progress', startedAt: now, currentStopIndex: 0 });
        tx.set(evidenceRef, { start: { driverUid: uid, plan: plannedFingerprint(data), confirmations: {}, startedAt: now }, completion: null });
        return { status: 200, body: { ok: true } };
      }
      if (input.action === 'acknowledge') {
        const noticeRef = db.collection('routeChangeNotifications').doc(input.routeId);
        const notice = (await tx.get(noticeRef)).data() as RouteChangeNotification | undefined;
        if (!notice || notice.driverId !== uid || getRouteChangeNotificationFingerprint(notice) !== input.fingerprint) {
          return { status: 409, body: { code: 'route_notice_changed' } };
        }
        tx.update(routeRef, { stops: clearRouteChangeFlags(stops), pendingChanges: false, updatedAt: now });
        tx.update(noticeRef, { acknowledged: true, acknowledgedAt: now });
        return { status: 200, body: { ok: true } };
      }
      if (input.action === 'finish') {
        if (data.status === 'completed') return { status: 200, body: { ok: true } };
        const finalized = stops.filter(stop => stop.deliveryStatus === 'completed' || stop.deliveryStatus === 'failed');
        if (data.status !== 'in_progress' || !stops.length || finalized.length * 5 < stops.length * 4) {
          return { status: 409, body: { code: 'route_not_ready' } };
        }
        const closed = { status: 'completed', completedAt: now };
        const completion = protectCompletion({ ...data, ...closed, earningsSourceStart: evidence?.start }, 'driver-server-v1');
        tx.update(routeRef, closed);
        tx.set(evidenceRef, { completion: completion ?? null }, { merge: true });
        return { status: 200, body: { ok: true } };
      }

      const editable = ['dispatched','in_progress','completed','completed_auto'].includes(data.status);
      if (!editable) return { status: 409, body: { code: 'route_invalid_state' } };
      const visited = input.patch.deliveryStatus === 'failed' ? input.patch.wentToLocation : null;
      const driverPatch = { ...input.patch, wentToLocation: visited, completedAt: now } as unknown as Partial<PlaceValue>;
      const mutation = updateStopByIdentity(stops,input.targetStop,driverPatch);
      const prior = mutation.previousStop.deliveryStatus;
      const wasPreviouslyFinalized = prior === 'completed' || prior === 'failed';
      const updatedStop = wasPreviouslyFinalized ? { ...mutation.updatedStop, editedByDriver: true, editedAt: now } : mutation.updatedStop;
      const updatedStops = [...mutation.stops];
      updatedStops[mutation.index] = updatedStop;
      tx.update(routeRef, { stops: updatedStops, currentStopIndex: mutation.index + 1, updatedAt: now });
      if (prior !== 'completed' && input.patch.deliveryStatus === 'completed') tx.update(userRef, { totalDeliveries: FieldValue.increment(1) });

      const key = sourceStopKey(updatedStop as unknown as Record<string, unknown>);
      if (key && evidence?.start?.driverUid === uid && data.status === 'in_progress') {
        const confirmation = { status: input.patch.deliveryStatus, visited, workedAt: timestampIso(now) };
        tx.set(evidenceRef, { start: { ...evidence.start, confirmations: { ...evidence.start.confirmations, [key]: confirmation } } }, { merge: true });
      }
      return { status: 200, body: { updatedStop, stopIndex: mutation.index, wasPreviouslyFinalized } };
    });
    return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && ['RouteStopNotFoundError','RouteStructureConflictError'].includes(error.name)) {
      return Response.json({ code: 'route_stop_changed' }, { status: 409 });
    }
    return Response.json({ code: 'route_unavailable' }, { status: 503 });
  }
}
