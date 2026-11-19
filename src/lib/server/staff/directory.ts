import { FieldValue,type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireStaffActor,type StaffActor } from './actor';
import { staffSourceDb } from './source';
import { staffDirectoryError } from './source-auth';
import { localStaffPolicy } from './settings';
import { staffRouteRevision } from './route-commands';
import { staffOperationAllowed,staffPolicySchema,staffRoles } from '../../staff/access';
import { routeDocumentId,routeRevisionSchema } from '../../staff/route-contract';
import { staffAccountSchema,staffDirectoryCommandSchema,type StaffDirectoryCommand } from '../../staff/directory-contract';
import { privateJson } from '../earnings/store';
import { EarningsError,earningsErrorResponse,earningsRpc,readJsonBody } from '../earnings/transport';

const sourceBinding=z.object({
  sourceProject:z.string(),sourceDocumentId:routeDocumentId,sourceProvisionId:z.string().uuid().optional(),
});
const targetSchema=sourceBinding.extend({authority:z.enum(['firebase','supabase'])});
const reservedSchema=sourceBinding.extend({
  state:z.literal('reserved'),expectedRole:z.enum(staffRoles),expectedSourceRevision:routeRevisionSchema,
  originalActorId:z.string().uuid(),
});
const metadataResult=z.discriminatedUnion('state',[
  reservedSchema,z.object({state:z.literal('complete'),replayed:z.boolean()}),z.object({state:z.literal('conflict'),replayed:z.boolean()}),
]);
type MetadataCommand=Extract<StaffDirectoryCommand,{action:'set_role'|'edit_profile'}>;

function parsed<T>(value:unknown,schema:z.ZodType<T>):T {
  const code=(value as {errorCode?:string}|null)?.errorCode;
  if (code==='platform_version_conflict' || code==='platform_command_conflict' || code==='platform_authority_changed' ||
      code==='staff_source_account_disabled' || code==='staff_role_pending' || code==='staff_last_admin') throw new EarningsError(409,code);
  if (code==='staff_invalid_command') throw new EarningsError(422,code);
  if (code) throw staffDirectoryError(code);
  const result=schema.safeParse(value);
  if (!result.success) throw new EarningsError(503,'staff_unavailable');
  return result.data;
}

const roleAlias=(role:unknown)=>role==='partner' ? 'socio':role==='manager' ? 'gestor':role;

export async function writeStaffSourceMetadata(
  db:Firestore,actor:StaffActor,reserved:z.infer<typeof reservedSchema>,command:MetadataCommand,
) {
  if (reserved.sourceProject!==actor.sourceProject || !actor.sourceDocumentId) throw new EarningsError(403,'staff_access_denied');
  const target=db.collection('users').doc(reserved.sourceDocumentId);
  const sourceActor=db.collection('users').doc(actor.sourceDocumentId);
  const receipt=db.collection('rotaStaffRoleReceipts').doc(command.commandId);
  const patch=command.action==='set_role' ? {role:command.role}:{displayName:command.profile.name,phone:command.profile.phone};
  const intent=JSON.stringify({target:target.id,patch,expectedRevision:reserved.expectedSourceRevision});

  return db.runTransaction(async tx=>{
    const [source,actualPolicy,local,prior,separateTarget]=await tx.getAll(sourceActor,db.doc('settings/app'),
      db.doc('settings/permissions'),receipt,...(sourceActor.isEqual(target) ? []:[target]));
    const account=separateTarget ?? source;
    if (prior.exists) {
      if (prior.get('intent')!==intent || !['source_applied','source_conflict'].includes(prior.get('state'))) {
        throw new EarningsError(409,'staff_role_conflict');
      }
      return prior.get('state') as 'source_applied'|'source_conflict';
    }

    const profile=source.data();
    const current=account.data();
    const policy=staffPolicySchema.safeParse(actualPolicy.data());
    if (!policy.success) throw new EarningsError(503,'staff_unavailable');
    const aliased={...policy.data,pagePermissions:Object.fromEntries(Object.entries(policy.data.pagePermissions).map(
      ([path,roles])=>[path,roles.map(role=>String(roleAlias(role)))]))};
    const exactActor=profile && profile.nativeStaffProvisioningId===actor.sourceProvisionId &&
      profile.active!==false && profile.disabled!==true && roleAlias(profile.role)===actor.role;
    const canWrite=exactActor && current && current.nativeStaffProvisioningId===reserved.sourceProvisionId &&
      !current.nativeDriverProvisioningId && roleAlias(current.role)===reserved.expectedRole &&
      staffRouteRevision(account.updateTime)===reserved.expectedSourceRevision &&
      (command.action==='edit_profile' || actor.userId!==command.targetId) &&
      staffOperationAllowed({...actor,policy:aliased,rotaPolicy:localStaffPolicy(local)},'directory:read') &&
      ((current.role!=='admin' && patch.role!=='admin') || actor.role==='admin');

    const state=canWrite ? 'source_applied':'source_conflict';
    if (canWrite) tx.update(target,{...patch,updatedAt:FieldValue.serverTimestamp()});
    // An aborted command also has a terminal receipt. A delayed worker can't apply it after Postgres releases the fence.
    tx.create(receipt,{intent,state,targetUid:target.id,actorId:reserved.originalActorId,checkedBy:actor.userId,
      createdAt:FieldValue.serverTimestamp()});
    return state;
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
    if (input.action==='set_role' || input.action==='edit_profile') {
      const binding=parsed(await earningsRpc('rota_staff_directory_target',{...args,p_target_id:input.targetId}),targetSchema);
      if (binding.sourceProject!==actor.sourceProject) throw new EarningsError(403,'staff_access_denied');
      const db=staffSourceDb(actor);
      const before=binding.authority==='firebase' ? await db.collection('users').doc(binding.sourceDocumentId).get():null;
      const run=(p_stage:string)=>earningsRpc('rota_staff_mutate_metadata',{...params,
        p_role:input.action==='set_role' ? input.role:null,p_profile:input.action==='edit_profile' ? input.profile:null,
        p_source_revision:staffRouteRevision(before?.updateTime) ?? null,p_stage});
      let result=parsed(await run('reserve'),metadataResult);
      if (result.state==='reserved') {
        const outcome=await writeStaffSourceMetadata(db,actor,result,input);
        result=parsed(await run(outcome),metadataResult);
      }
      if (result.state==='conflict') throw new EarningsError(409,'staff_role_conflict');
      return privateJson({ok:true});
    }
    const result=await earningsRpc('rota_staff_security_command',{...params,p_action:input.action});
    return privateJson(parsed(result,z.object({ok:z.literal(true),replayed:z.boolean()})));
  } catch(error) {return earningsErrorResponse(error);}
}
