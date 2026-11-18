import { FieldPath } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireEarningsActor } from '@/lib/server/earnings/actor';
import { performDriverRouteAction } from '@/lib/server/earnings/firestore-route-actions';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError, earningsErrorResponse } from '@/lib/server/earnings/transport';

export const runtime = 'nodejs';
const docId = z.string().min(1).max(150).regex(/^[^/]+$/);
const selectors = z.object({ id: docId.optional(), after: docId.optional(), view: z.enum(['active','history']).default('active') }).strict();
const operational = ['dispatched','in_progress'];
const history = ['completed','completed_auto'];

function projectRoute(doc: FirebaseFirestore.DocumentSnapshot) {
  const data = doc.data()!;
  return {
    id: doc.id, code: data.code ?? null, name: data.name ?? null, status: data.status, plannedDate: data.plannedDate ?? null,
    distanceMeters: data.distanceMeters ?? null, duration: data.duration ?? null, pendingChanges: Boolean(data.pendingChanges),
    stops: (Array.isArray(data.stops) ? data.stops : []).map(stop => ({
      id: stop.id, pointCode: stop.pointCode, placeId: stop.placeId, address: stop.address, customerName: stop.customerName,
      lat: stop.lat, lng: stop.lng, deliveryStatus: stop.deliveryStatus, wentToLocation: stop.wentToLocation,
    })),
  };
}

export async function GET(request: Request) {
  try {
    const actor = await requireEarningsActor(request,'route:operate');
    if (!adminDb) throw new EarningsError(503,'route_unavailable');
    const selection = selectors.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!selection.success) throw new EarningsError(422,'route_invalid_query');
    const { id,after,view } = selection.data;
    const routes = adminDb.collection('routes');
    if (id) {
      const route = await routes.doc(id).get();
      if (!route.exists || route.data()?.driverId !== actor.sourceUid) throw new EarningsError(404,'route_not_found');
      return privateJson({ route: projectRoute(route) });
    }
    let query = routes.where('driverId','==',actor.sourceUid).where('status','in',view === 'active' ? operational : history)
      .orderBy(FieldPath.documentId()).limit(51);
    if (after) query = query.startAfter(after);
    const snapshot = await query.get();
    const page = snapshot.docs.slice(0,50);
    return privateJson({ routes: page.map(projectRoute), nextCursor: snapshot.size>50 ? page[49].id : null });
  } catch (error) { return earningsErrorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const actor = await requireEarningsActor(request,'route:operate');
    return await performDriverRouteAction(request,actor.sourceUid!);
  } catch (error) { return earningsErrorResponse(error); }
}
