import { FieldValue,type DocumentReference,type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireStaffActor,type StaffActor } from './actor';
import { staffSourceDb } from './source';
import { staffDirectoryError } from './source-auth';
import { localStaffPolicy } from './settings';
import { staffRouteRevision } from './route-commands';
import { staffOperationAllowed,staffPolicySchema,staffRoles } from '../../staff/access';
import { routeDocumentId,routeRevisionSchema } from '../../staff/route-contract';
import { pendingStaffMetadataSchema,staffAccountSchema,staffDirectoryCommandSchema,type StaffDirectoryCommand } from '../../staff/directory-contract';
import { privateJson } from '../earnings/store';
import { EarningsError,earningsErrorResponse,earningsRpc,readJsonBody } from '../earnings/transport';

const sourceBinding=z.object({
  sourceProject:z.string(),sourceDocumentId:routeDocumentId,sourceProvisionId:z.string().uuid().optional(),
});
const authoritySchema=z.enum(['firebase','supabase']);
const targetSchema=sourceBinding.extend({authority:authoritySchema});
const directoryRows=z.object({
  authority:authoritySchema,
  accounts:z.array(staffAccountSchema.omit({sourceRevision:true}).extend({sourceIdentity:sourceBinding})),
  pendingCommands:z.array(pendingStaffMetadataSchema),
});
const closedSchema=z.object({state:z.enum(['complete','conflict']),replayed:z.boolean()});
const cancelled= z.union([sourceBinding.extend({state:z.literal('reserved')}),closedSchema]);
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

  const state=await db.runTransaction(async tx=>{
    const [source,actualPolicy,local,prior,separateTarget]=await tx.getAll(sourceActor,db.doc('settings/app'),
      db.doc('settings/permissions'),receipt,...(sourceActor.isEqual(target) ? []:[target]));
    const account=separateTarget ?? source;
    if (prior.exists) {
      if (prior.get('cancelled')===true && prior.get('targetUid')===target.id) return 'source_conflict';
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
  if (state==='source_conflict') return {state,revision:null} as const;
  // The transaction writes the account and receipt together. A different updateTime
  // means another Source writer has already superseded this result.
  const [applied,current]=await db.getAll(receipt,target);
  const revision=staffRouteRevision(applied.updateTime);
  return revision && applied.get('state')==='source_applied' && applied.get('intent')===intent &&
    revision===staffRouteRevision(current.updateTime)
    ? {state,revision} as const : {state:'source_conflict',revision:null} as const;
}

export async function sealStaffMetadata(db:Firestore,commandId:string,targetUid:string) {
  const receipt=db.collection('rotaStaffRoleReceipts').doc(commandId);
  await db.runTransaction(async tx=>{
    if (!(await tx.get(receipt)).exists) tx.create(receipt,{
      state:'source_conflict',targetUid,cancelled:true,createdAt:FieldValue.serverTimestamp(),
    });
  });
}

async function listStaffDirectory(db:Firestore,value:unknown,sourceProject:string) {
  const {accounts,pendingCommands,authority}=parsed(value,directoryRows);
  if (accounts.some(row=>row.sourceIdentity.sourceProject!==sourceProject)) throw new EarningsError(403,'staff_access_denied');
  const refs:DocumentReference[]=accounts.map(row=>db.collection('users').doc(row.sourceIdentity.sourceDocumentId));
  const byPath=new Map(refs.map(ref=>[ref.path,ref]));
  const profiles=new Map<string,Awaited<ReturnType<Firestore['getAll']>>[number]>();
  if (authority==='firebase') {
    const unique=[...byPath.values()];
    for (let offset=0;offset<unique.length;offset+=100) {
      const docs=await db.getAll(...unique.slice(offset,offset+100));
      for (const doc of docs) profiles.set(doc.ref.path,doc);
    }
  }
  return {pendingCommands,accounts:accounts.map(({sourceIdentity,...row},index)=>{
    const source=profiles.get(refs[index].path);
    const proven=source?.exists && source.get('nativeStaffProvisioningId')===sourceIdentity.sourceProvisionId &&
      !source.get('nativeDriverProvisioningId');
    const name=proven ? source?.get('displayName') || source?.get('name'):undefined;
    const phone=proven ? source?.get('phone'):undefined;
    return {...row,sourceRevision:proven ? staffRouteRevision(source!.updateTime) ?? null:null,
      name:typeof name==='string' ? name:row.name,phone:typeof phone==='string' ? phone:row.phone};
  })};
}

export async function serveStaffDirectory(request:Request) {
  try {
    const actor=await requireStaffActor(request,'directory:read');
    const args={p_user_id:actor.userId,p_session_id:actor.sessionId,p_scope_id:actor.scopeId};
    if (request.method==='GET') {
      return privateJson(await listStaffDirectory(staffSourceDb(actor),await earningsRpc('rota_staff_directory',args),actor.sourceProject));
    }
    const command=staffDirectoryCommandSchema.safeParse(await readJsonBody(request,4096));
    if (!command.success) throw new EarningsError(422,'staff_invalid_command');
    const input=command.data;
    if (input.action==='cancel_metadata') {
      const run=(p_stage:string)=>earningsRpc('rota_staff_cancel_metadata',{...args,p_stage,p_command_id:input.commandId});
      const prepared=parsed(await run('prepare'),cancelled);
      if (prepared.state==='reserved') {
        if (prepared.sourceProject!==actor.sourceProject) throw new EarningsError(403,'staff_access_denied');
        await sealStaffMetadata(staffSourceDb(actor),input.commandId,prepared.sourceDocumentId);
        parsed(await run('confirm'),closedSchema);
      }
      return privateJson({ok:true});
    }
    const params={...args,p_target_id:input.targetId,p_expected_revision:input.revision,p_command_id:input.commandId};
    if (input.action==='set_role' || input.action==='edit_profile') {
      const binding=parsed(await earningsRpc('rota_staff_directory_target',{...args,p_target_id:input.targetId}),targetSchema);
      if (binding.sourceProject!==actor.sourceProject) throw new EarningsError(403,'staff_access_denied');
      const db=staffSourceDb(actor);
      const before=input.action==='set_role' && binding.authority==='firebase'
        ? await db.collection('users').doc(binding.sourceDocumentId).get():null;
      const expectedSource=input.action==='edit_profile' ? input.sourceRevision:staffRouteRevision(before?.updateTime) ?? null;
      const run=(p_stage:string,p_source_revision:string|null=expectedSource)=>earningsRpc('rota_staff_mutate_metadata',{...params,
        p_role:input.action==='set_role' ? input.role:null,p_profile:input.action==='edit_profile'
          ? {...input.profile,phoneRevision:input.phoneRevision}:null,
        p_source_revision,p_stage});
      let result=parsed(await run('reserve'),metadataResult);
      if (result.state==='reserved') {
        const outcome=await writeStaffSourceMetadata(db,actor,result,input);
        result=parsed(await run(outcome.state,outcome.revision),metadataResult);
      }
      if (result.state==='conflict') throw new EarningsError(409,'staff_role_conflict');
      return privateJson({ok:true});
    }
    const result=await earningsRpc('rota_staff_security_command',{...params,p_action:input.action});
    return privateJson(parsed(result,z.object({ok:z.literal(true),replayed:z.boolean()})));
  } catch(error) {return earningsErrorResponse(error);}
}
