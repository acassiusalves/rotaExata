import { z } from 'zod';
import { earningsScopeId, verifyNativeSession, type ActorAuthority } from '../earnings/actor.ts';
import { firestoreRevision } from '../../../../functions/src/earnings-source-adapter.ts';
import { EarningsError, earningsRpc, earningsSupabaseUrl, verifySupabaseUser } from '../earnings/transport.ts';
import { refreshStaffSource,staffDirectoryError } from './source-auth.ts';
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
  sourceDocumentId:z.string().min(1).max(128).optional(),
  sourceProvisionId:uuid.optional(),
  sourceUid:z.string().min(1).max(128).refine(value=>!value.includes('/')).optional(),
});

export type StaffActor = z.infer<typeof identitySchema> & { rotaPolicy: StaffPolicy; rotaPolicyRevision?:string|null };
export type StaffAuthority = Pick<ActorAuthority,'issuer'|'scopeId'|'now'|'verify'> & {
  sourceProject:string;
  resolve:(identity:{ userId:string; sessionId:string; scopeId:string })=>Promise<unknown>;
  readPolicy:()=>Promise<unknown>;
  refreshSource?:(input:{userId:string;sessionId:string;scopeId:string})=>Promise<void>;
};

function defaultAuthority():StaffAuthority {
  const sourceProject=process.env.ROTA_EARNINGS_SOURCE_PROJECT;
  if (!sourceProject) throw new EarningsError(503,'staff_unavailable');
  return {
    issuer:earningsSupabaseUrl()+'/auth/v1',
    scopeId:earningsScopeId(),
    sourceProject,
    verify:verifySupabaseUser,
    refreshSource:refreshStaffSource,
    resolve:({userId,sessionId,scopeId})=>earningsRpc('rota_staff_resolve_actor',{
      p_user_id:userId,p_session_id:sessionId,p_scope_id:scopeId,
    }),
    readPolicy:async()=>{
      const {adminDb,adminApp}=await import('../../firebase/admin.ts');
      if (!adminDb || adminApp?.options.projectId!==sourceProject) throw new EarningsError(503,'staff_unavailable');
      const snap=await adminDb.doc('settings/permissions').get();
      const data=snap.data();
      return {policy:data ? {pagePermissions:data.permissions,inactivePages:data.inactivePages ?? []}:defaultStaffPolicy,
        revision:snap.updateTime ? firestoreRevision(snap.updateTime):null};
    },
  };
}

export async function requireStaffActor(request:Request,operation:StaffOperation,authority?:StaffAuthority):Promise<StaffActor> {
  const auth=authority ?? defaultAuthority();
  const identity=await verifyNativeSession(request,auth);
  return resolveStaffActor(identity,operation,auth);
}

export async function resolveStaffActor(
  identity:Awaited<ReturnType<typeof verifyNativeSession>>,operation:StaffOperation,auth:StaffAuthority=defaultAuthority(),
):Promise<StaffActor> {
  const scope={userId:identity.userId,sessionId:identity.sessionId,scopeId:auth.scopeId};
  await auth.refreshSource?.(scope);
  const result=await auth.resolve(scope);
  const code=(result as {errorCode?:unknown}|null)?.errorCode;
  if (code) throw staffDirectoryError(code);

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
  let rotaPolicyRevision:string|null=null;
  try {
    const read=await auth.readPolicy();
    const envelope=z.object({policy:staffPolicySchema,revision:z.string().nullable()}).safeParse(read);
    rotaPolicy=envelope.success ? envelope.data.policy:staffPolicySchema.parse(read);
    rotaPolicyRevision=envelope.success ? envelope.data.revision:null;
  } catch {
    throw new EarningsError(503,'staff_unavailable');
  }
  const authorized={...actor,rotaPolicy,rotaPolicyRevision};
  if (!staffOperationAllowed(authorized,operation)) throw new EarningsError(403,'staff_access_denied');
  return authorized;
}
