import { adminAuth,adminDb } from '@/lib/firebase/admin';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import { requireEarningsActor } from '@/lib/server/earnings/actor';
import { EarningsError } from '@/lib/server/earnings/transport';

export type DriverAuthority = { sourceUid: string; userId: string; scopeId?: string; sessionId?:string; readOnly?: boolean; native:boolean };

export async function driverAuthority(request: Request, phase:'native'|'legacy', write=false):Promise<DriverAuthority> {
  if (phase==='native') {
    if (!nativeDriverEnabled) throw new EarningsError(404,'route_not_found');
    const actor=await requireEarningsActor(request,'route:operate');
    if (!adminDb || !process.env.ROTA_EARNINGS_SOURCE_PROJECT ||
        process.env.FIREBASE_PROJECT_ID!==process.env.ROTA_EARNINGS_SOURCE_PROJECT) {
      throw new EarningsError(503,'route_unavailable');
    }
    return { sourceUid:actor.sourceUid!,userId:actor.userId,scopeId:actor.scopeId,sessionId:actor.sessionId,native:true };
  }
  if (nativeDriverEnabled) throw new EarningsError(403,'route_access_denied');
  const token=request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length>16384) throw new EarningsError(401,'route_unauthorized');
  if (!adminDb || !adminAuth) throw new EarningsError(503,'route_unavailable');
  let identity;
  try { identity=await adminAuth.verifyIdToken(token,true); } catch { throw new EarningsError(401,'route_unauthorized'); }
  const profile=(await adminDb.collection('users').doc(identity.uid).get()).data();
  const readOnly=identity.firebase.sign_in_provider==='custom';
  if (profile?.role!=='driver' || profile.active===false || profile.disabled===true || profile.mustChangePassword || (write && readOnly))
    throw new EarningsError(403,'route_access_denied');
  return { sourceUid:identity.uid,userId:identity.uid,readOnly,native:false };
}
