import { z } from 'zod';
import { earningsScopeId, verifyNativeSession, type ActorAuthority } from '../earnings/actor.ts';
import { EarningsError, earningsRpc, earningsSupabaseUrl, verifySupabaseUser } from '../earnings/transport.ts';
import { defaultStaffPolicy, staffOperationAllowed, staffPolicySchema, staffRoles, type StaffOperation, type StaffPolicy } from '../../staff/access.ts';

const uuid=z.string().uuid();
const identitySchema=z.object({
  userId:uuid,
  sessionId:uuid,
  scopeId:uuid,
  name:z.string(),
  role:z.enum(staffRoles),
  application:z.literal('lunna'),
  revision:z.number().int().nonnegative().safe(),
  policyRevision:z.number().int().nonnegative().safe(),
  policy:staffPolicySchema,
  sourceProject:z.string().regex(/^[a-z0-9-]{3,63}$/),
  sourceUid:z.string().min(1).max(128).refine(value=>!value.includes('/')).optional(),
});

export type StaffActor = z.infer<typeof identitySchema> & { rotaPolicy: StaffPolicy };
export type StaffAuthority = Pick<ActorAuthority,'issuer'|'scopeId'|'now'|'verify'> & {
  sourceProject:string;
  resolve:(identity:{ userId:string; sessionId:string; scopeId:string })=>Promise<unknown>;
  readPolicy:()=>Promise<unknown>;
};

function defaultAuthority():StaffAuthority {
  const sourceProject=process.env.ROTA_EARNINGS_SOURCE_PROJECT;
  if (!sourceProject) throw new EarningsError(503,'staff_unavailable');
  return {
    issuer:earningsSupabaseUrl()+'/auth/v1',
    scopeId:earningsScopeId(),
    sourceProject,
    verify:verifySupabaseUser,
    resolve:({userId,sessionId,scopeId})=>earningsRpc('rota_staff_resolve_actor',{
      p_user_id:userId,p_session_id:sessionId,p_scope_id:scopeId,
    }),
    readPolicy:async()=>{
      const {adminDb,adminApp}=await import('../../firebase/admin.ts');
      if (!adminDb || adminApp?.options.projectId!==sourceProject) throw new EarningsError(503,'staff_unavailable');
      const snap=await adminDb.doc('settings/permissions').get();
      const data=snap.data();
      return data ? { pagePermissions:data.permissions, inactivePages:data.inactivePages ?? [] } : defaultStaffPolicy;
    },
  };
}

export async function requireStaffActor(request:Request,operation:StaffOperation,authority?:StaffAuthority):Promise<StaffActor> {
  const auth=authority ?? defaultAuthority();
  const identity=await verifyNativeSession(request,auth);
  const result=await auth.resolve({userId:identity.userId,sessionId:identity.sessionId,scopeId:auth.scopeId});
  const code=(result as {errorCode?:unknown}|null)?.errorCode;
  if (code==='platform_session_revoked') throw new EarningsError(401,'staff_unauthorized');
  if (code==='platform_directory_unavailable') throw new EarningsError(503,'staff_unavailable');
  if (code==='platform_password_change_required') throw new EarningsError(403,code);
  if (code) throw new EarningsError(403,'staff_access_denied');

  const parsed=identitySchema.safeParse(result);
  if (!parsed.success) {
    if ((result as {role?:unknown}|null)?.role==='driver') throw new EarningsError(403,'staff_access_denied');
    throw new EarningsError(503,'staff_unavailable');
  }
  const actor=parsed.data;
  if (actor.userId!==identity.userId || actor.sessionId!==identity.sessionId ||
      actor.scopeId!==auth.scopeId || actor.sourceProject!==auth.sourceProject) {
    throw new EarningsError(403,'staff_access_denied');
  }

  let rotaPolicy:StaffPolicy;
  try {
    rotaPolicy=staffPolicySchema.parse(await auth.readPolicy());
  } catch {
    throw new EarningsError(503,'staff_unavailable');
  }
  const authorized={...actor,rotaPolicy};
  if (!staffOperationAllowed(authorized,operation)) throw new EarningsError(403,'staff_access_denied');
  return authorized;
}
