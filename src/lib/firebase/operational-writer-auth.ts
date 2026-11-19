import { EarningsError } from '../server/earnings/transport.ts';

type WriterIdentity = { uid: string; provider?: string };
type WriterProfile = { role?: string; active?: boolean; disabled?: boolean; mustChangePassword?: boolean };
type Authority = {
  verify: (token: string) => Promise<WriterIdentity>;
  readProfile: (uid: string) => Promise<WriterProfile | undefined>;
  isRetired?: (uid:string)=>Promise<boolean>;
};

async function firebaseAuthority(): Promise<Authority> {
  const { adminAuth,adminDb } = await import('./admin.ts');
  if (!adminAuth || !adminDb) throw new EarningsError(503,'route_authority_unavailable');
  return {
    verify: async token => {
      const identity = await adminAuth.verifyIdToken(token,true);
      return {uid:identity.uid,provider:identity.firebase.sign_in_provider};
    },
    readProfile: async uid => (await adminDb.collection('users').doc(uid).get()).data(),
    isRetired: async uid => {
      const transition=(await adminDb.doc('rotaAuthTransition/driver').get()).data();
      return transition?.mode==='supabase' && (!Array.isArray(transition.driverUids) || transition.driverUids.includes(uid));
    },
  };
}

/** Route writers still use the operational Firebase account. Migration to native
 * Supabase moves the writer deliberately and checks the canonical scope. */
export async function authorizeOperationalWriter(request: Request,authority?: Authority) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length>16384) throw new EarningsError(401,'route_unauthorized');
  const auth = authority ?? await firebaseAuthority();
  let identity: WriterIdentity;
  try { identity = await auth.verify(token); }
  catch { throw new EarningsError(401,'route_unauthorized'); }
  if (identity.provider==='custom') throw new EarningsError(403,'route_access_denied');
  const profile = await auth.readProfile(identity.uid);
  if (!profile || !['admin','socio','gestor'].includes(profile.role ?? '') ||
      profile.active===false || profile.disabled===true || profile.mustChangePassword) {
    throw new EarningsError(403,'route_access_denied');
  }
  if (await auth.isRetired?.(identity.uid)) throw new EarningsError(403,'route_access_denied');
  return identity.uid;
}
