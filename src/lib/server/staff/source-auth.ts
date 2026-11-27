import { z } from 'zod';
import { firestoreRevision } from '../../../../functions/src/earnings-source-adapter.ts';
import { EarningsError,earningsRpc } from '../earnings/transport.ts';

type Identity={userId:string;sessionId:string;scopeId:string};
type SourceRows={profile?:unknown;profileRevision?:string;settings:unknown;policyRevision?:string};
export type SourceAuthority={
  project:string;
  context:()=>Promise<unknown>;
  read:(sourceUid?:string)=>Promise<SourceRows>;
  apply:(input:Record<string,unknown>)=>Promise<unknown>;
};

const uuid=z.string().uuid();
const contextSchema=z.object({
  authority:z.enum(['firebase','supabase']),
  userId:uuid,sessionId:uuid,scopeId:uuid,
  sourceProject:z.string(),sourceUid:z.string().min(1).max(128).refine(value=>!value.includes('/')).optional(),
  sourceDocumentId:z.string().min(1).max(128).refine(value=>!value.includes('/')).optional(),
  sourceProvisionId:uuid.optional(),
  revision:z.number().int().nonnegative().safe(),policyRevision:z.number().int().nonnegative().safe(),
});
const role=z.enum(['admin','socio','gestor','vendedor','estoquista','financeiro','marketing','usuario','manager','partner','user'])
  .transform(value=>value==='manager'?'gestor':value==='partner'?'socio':value==='user'?'usuario':value);
const sourceProfile=z.object({role,active:z.boolean().optional(),disabled:z.boolean().optional(),nativeStaffProvisioningId:uuid.optional(),displayName:z.unknown(),name:z.unknown(),phone:z.unknown()});
const path=z.string().max(500).startsWith('/');
const sourcePolicy=z.object({pagePermissions:z.record(path,z.array(role)),inactivePages:z.array(path).default([])});

export function staffDirectoryError(code:unknown) {
  if (code==='platform_session_revoked') return new EarningsError(401,'staff_unauthorized');
  if (code==='platform_directory_unavailable') return new EarningsError(503,'staff_unavailable');
  if (code==='platform_password_change_required') return new EarningsError(403,code);
  return new EarningsError(403,'staff_access_denied');
}

function defaultAuthority(identity:Identity):SourceAuthority {
  const project=process.env.ROTA_EARNINGS_SOURCE_PROJECT;
  if (!project) throw new EarningsError(503,'staff_unavailable');
  const args={p_user_id:identity.userId,p_session_id:identity.sessionId,p_scope_id:identity.scopeId};
  return {
    project,
    context:()=>earningsRpc('rota_staff_source_context',args),
    read:async sourceUid=>{
      const {adminApp,adminDb}=await import('../../firebase/admin.ts');
      if (!adminDb || adminApp?.options.projectId!==project) throw new EarningsError(503,'staff_unavailable');
      const settings=adminDb.doc('settings/app');
      const [policy,profile]=sourceUid ?
        await adminDb.getAll(settings,adminDb.collection('users').doc(sourceUid)) : [await settings.get()];
      return {
        profile:profile?.data(),profileRevision:profile?.updateTime ? firestoreRevision(profile.updateTime):undefined,
        settings:policy.data(),policyRevision:policy.updateTime ? firestoreRevision(policy.updateTime):undefined,
      };
    },
    apply:input=>earningsRpc('rota_staff_project_source',{...args,p_source:input}),
  };
}

export async function refreshStaffSource(identity:Identity,authority:SourceAuthority=defaultAuthority(identity)) {
  for (let attempt=0;attempt<2;attempt++) {
    const result=await authority.context();
    const code=(result as {errorCode?:unknown}|null)?.errorCode;
    if (code) throw staffDirectoryError(code);
    const parsed=contextSchema.safeParse(result);
    if (!parsed.success) throw new EarningsError(503,'staff_unavailable');
    const context=parsed.data;
    if (context.userId!==identity.userId || context.sessionId!==identity.sessionId ||
        context.scopeId!==identity.scopeId || context.sourceProject!==authority.project) {
      throw new EarningsError(403,'staff_access_denied');
    }
    if (context.authority==='supabase') return;

    const documentId=context.sourceDocumentId ?? context.sourceUid;
    if (!documentId ||
        (context.sourceUid && (documentId!==context.sourceUid || context.sourceProvisionId)) ||
        (!context.sourceUid && (documentId!==identity.userId || !context.sourceProvisionId))) {
      throw new EarningsError(403,'staff_access_denied');
    }

    let rows:SourceRows;
    try {rows=await authority.read(documentId);}
    catch {throw new EarningsError(503,'staff_unavailable');}
    const policy=sourcePolicy.safeParse(rows.settings);
    if (!policy.success || !rows.policyRevision) throw new EarningsError(503,'staff_unavailable');

    const profile=sourceProfile.safeParse(rows.profile);
    if (!profile.success || !rows.profileRevision || profile.data.active===false || profile.data.disabled===true ||
        profile.data.nativeStaffProvisioningId!==context.sourceProvisionId) {
      throw new EarningsError(403,'staff_access_denied');
    }

    const profileName=typeof profile.data.displayName==='string' ? profile.data.displayName:profile.data.name;
    const command={
      project:context.sourceProject,sourceUid:context.sourceUid ?? null,
      ...(context.sourceDocumentId ? {sourceDocumentId:documentId}:{}),
      ...(typeof profileName==='string' && profileName.trim() ? {profileName:profileName.trim().slice(0,150)}:{}),
      ...(typeof profile.data.phone==='string' ? {profilePhone:profile.data.phone.trim().slice(0,40)}:{}),
      role:profile.data.role,sourceProfileRevision:rows.profileRevision,
      policy:policy.data,sourcePolicyRevision:rows.policyRevision,profileRevision:context.revision,policyRevision:context.policyRevision,
    };
    const changed=await authority.apply(command) as {ok?:boolean;errorCode?:string}|null;
    if (changed?.ok===true) return;
    if (changed?.errorCode==='platform_version_conflict' || changed?.errorCode==='platform_authority_changed') continue;
    if (changed?.errorCode==='platform_invalid_projection' || !changed?.errorCode) throw new EarningsError(503,'staff_unavailable');
    throw staffDirectoryError(changed.errorCode);
  }
  throw new EarningsError(503,'staff_unavailable');
}
