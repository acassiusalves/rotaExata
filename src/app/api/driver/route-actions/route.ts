import { adminAuth } from '@/lib/firebase/admin';
import { performDriverRouteAction } from '@/lib/server/earnings/firestore-route-actions';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!adminAuth) return Response.json({ code: 'route_unavailable' }, { status: 503 });
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 16384) return Response.json({ code: 'route_unauthorized' }, { status: 401 });
  try {
    const actor = await adminAuth.verifyIdToken(token,true);
    if (actor.firebase.sign_in_provider === 'custom') return Response.json({ code: 'route_access_denied' }, { status: 403 });
    return await performDriverRouteAction(request,actor.uid);
  } catch {
    return Response.json({ code: 'route_unauthorized' }, { status: 401 });
  }
}
