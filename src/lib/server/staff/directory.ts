import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireStaffActor } from './actor';
import { staffSourceDb } from './source';
import { staffDirectoryError } from './source-auth';
import { localStaffPolicy } from './settings';
import { staffOperationAllowed,staffPolicySchema,staffRoles } from '../../staff/access';
import { staffAccountSchema,staffDirectoryCommandSchema,type StaffDirectoryCommand } from '../../staff/directory-contract';
import { privateJson } from '../earnings/store';
import { EarningsError,earningsErrorResponse,earningsRpc,readJsonBody } from '../earnings/transport';

const roleResult=z.discriminatedUnion('state',[
  z.object({state:z.literal('reserved'),sourceProject:z.string(),sourceUid:z.string().min(1).max(128).refine(value=>!value.includes('/')),expectedRole:z.enum(staffRoles)}),
  z.object({state:z.literal('complete'),replayed:z.boolean()}),
  z.object({state:z.literal('conflict'),replayed:z.boolean()}),
]);
type RoleCommand=Extract<StaffDirectoryCommand,{action:'set_role'}>;

function parsed<T>(value:unknown,schema:z.ZodType<T>):T {
  const code=(value as {errorCode?:string}|null)?.errorCode;
  if (code==='platform_version_conflict' || code==='platform_command_conflict' || code==='platform_authority_changed' ||
      code==='staff_source_account_disabled' || code==='staff_role_pending') throw new EarningsError(409,code);
  if (code==='staff_invalid_command') throw new EarningsError(422,code);
  if (code) throw staffDirectoryError(code);
  const result=schema.safeParse(value);
  if (!result.success) throw new EarningsError(503,'staff_unavailable');
  return result.data;
}

async function writeSourceRole(
  actor:Awaited<ReturnType<typeof requireStaffActor>>,
  reserved:Extract<z.infer<typeof roleResult>,{state:'reserved'}>,
  command:RoleCommand,
) {
  if (reserved.sourceProject!==actor.sourceProject) throw new EarningsError(403,'staff_access_denied');
  const db=staffSourceDb(actor);
  const target=db.collection('users').doc(reserved.sourceUid);
  const sourceActor=db.collection('users').doc(actor.sourceUid ?? actor.userId);
  const applicationPolicy=db.doc('settings/app');
  const rotaPolicy=db.doc('settings/permissions');
  const receipt=db.collection('rotaStaffRoleReceipts').doc(command.commandId);
  await db.runTransaction(async tx=>{
    const [source,actualPolicy,local,account,prior]=await tx.getAll(sourceActor,applicationPolicy,rotaPolicy,target,receipt);
    const profile=source.data();
    const current=account.data();
    const sourceRole=profile?.role==='partner' ? 'socio' : profile?.role==='manager' ? 'gestor' : profile?.role;
    const targetRole=current?.role==='partner' ? 'socio' : current?.role==='manager' ? 'gestor' : current?.role;
    if (!profile || (actor.sourceUid===undefined && typeof profile.nativeStaffProvisioningId!=='string') ||
        profile.active===false || profile.disabled===true || (actor.sourceUid!==undefined && sourceRole!==actor.role) ||
        !current || current.role==='driver' || (typeof current.nativeDriverProvisioningId==='string')) {
      throw new EarningsError(403,'staff_access_denied');
    }
    const policy=staffPolicySchema.safeParse(actualPolicy.data());
    if (!policy.success) throw new EarningsError(503,'staff_unavailable');
    const aliased={
      ...policy.data,pagePermissions:Object.fromEntries(Object.entries(policy.data.pagePermissions).map(
        ([path,roles])=>[path,roles.map(role=>role==='partner'?'socio':role)])),
    };
    if (!staffOperationAllowed({...actor,policy:aliased,rotaPolicy:localStaffPolicy(local)},'directory:read') ||
        ((current.role==='admin' || command.role==='admin') && actor.role!=='admin')) {
      throw new EarningsError(403,'staff_access_denied');
    }

    if (prior.exists) {
      if (prior.get('role')!==command.role || prior.get('targetUid')!==target.id || current.role!==command.role) {
        throw new EarningsError(409,'staff_role_conflict');
      }
      return;
    }
    if (targetRole!==reserved.expectedRole) throw new EarningsError(409,'staff_role_conflict');
    tx.update(target,{role:command.role,updatedAt:FieldValue.serverTimestamp()});
    tx.create(receipt,{targetUid:target.id,role:command.role,actorId:actor.userId,createdAt:FieldValue.serverTimestamp()});
  });
}

export async function serveStaffDirectory(request:Request) {
  try {
    const actor=await requireStaffActor(request,'directory:read');
    const args={p_user_id:actor.userId,p_session_id:actor.sessionId,p_scope_id:actor.scopeId};
    if (request.method==='GET') {
      return privateJson(parsed(await earningsRpc('rota_staff_directory',args),z.object({accounts:z.array(staffAccountSchema)})));
    }
    const command=staffDirectoryCommandSchema.safeParse(await readJsonBody(request,4096));
    if (!command.success) throw new EarningsError(422,'staff_invalid_command');
    const input=command.data;
    const params={...args,p_target_id:input.targetId,p_expected_revision:input.revision,p_command_id:input.commandId};
    if (input.action==='set_role') {
      const run=(p_stage:string)=>earningsRpc('rota_staff_set_role',{...params,p_role:input.role,p_stage});
      const reserved=parsed(await run('reserve'),roleResult);
      if (reserved.state==='reserved') {
        try {await writeSourceRole(actor,reserved,input);}
        catch (error) {
          if (error instanceof EarningsError && error.code==='staff_role_conflict') await run('source_conflict');
          throw error;
        }
        parsed(await run('source_applied'),roleResult);
      }
      return privateJson({ok:true});
    }
    const result=await earningsRpc('rota_staff_security_command',{...params,p_action:input.action});
    return privateJson(parsed(result,z.object({ok:z.literal(true),replayed:z.boolean()})));
  } catch(error) {return earningsErrorResponse(error);}
}
