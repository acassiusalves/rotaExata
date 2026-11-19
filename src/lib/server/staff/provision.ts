import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireStaffActor } from './actor';
import { staffDirectoryError } from './source-auth';
import { staffSourceDb } from './source';
import { staffProvisionCommandSchema,staffProvisionSchema,type StaffProvision } from '../../staff/directory-contract';
import { privateJson } from '../earnings/store';
import {
  createSupabaseStaffAuth,findSupabaseDriverAuth,EarningsError,earningsErrorResponse,earningsRpc,readJsonBody,
} from '../earnings/transport';

const ownAuth=z.object({id:z.string().uuid(),email:z.string().email(),
  app_metadata:z.object({rota_staff_provisioning:z.string().uuid()})});

function result<T>(input:unknown,schema:z.ZodType<T>):T {
  const code=(input as {errorCode?:string}|null)?.errorCode;
  if (code==='staff_provision_not_found') throw new EarningsError(404,code);
  if (code==='staff_email_exists' || code==='platform_command_conflict' || code==='platform_version_conflict') {
    throw new EarningsError(409,code);
  }
  if (code==='staff_invalid_command') throw new EarningsError(422,code);
  if (code==='staff_auth_unproven') throw new EarningsError(503,code);
  if (code) throw staffDirectoryError(code);
  const parsed=schema.safeParse(input);
  if (!parsed.success) throw new EarningsError(503,'staff_unavailable');
  return parsed.data;
}

function assertOwnAuth(value:unknown,row:StaffProvision) {
  const auth=ownAuth.safeParse(value);
  if (!auth.success || auth.data.id!==row.userId || auth.data.email.toLowerCase()!==row.email ||
      auth.data.app_metadata.rota_staff_provisioning!==row.commandId) {
    throw new EarningsError(409,'staff_auth_unproven');
  }
}

export async function serveStaffProvision(request:Request) {
  try {
    const actor=await requireStaffActor(request,'directory:read');
    const db=staffSourceDb(actor);
    const input={p_user_id:actor.userId,p_session_id:actor.sessionId,p_scope_id:actor.scopeId};
    const run=(p_action:string,p_command_id?:string,name?:string,email?:string,role?:string)=>
      earningsRpc('rota_staff_provision',{...input,p_action,p_command_id:p_command_id ?? null,
        p_name:name ?? null,p_email:email ?? null,p_role:role ?? null});
    if (request.method==='GET') return privateJson(result(await run('list'),z.object({pending:z.array(staffProvisionSchema)})));

    const parsed=staffProvisionCommandSchema.safeParse(await readJsonBody(request,4096));
    if (!parsed.success) throw new EarningsError(422,'staff_invalid_command');

    const command=parsed.data;
    const row=result(await (command.action==='reserve' ?
      run('reserve',command.commandId,command.name,command.email,command.role):
      run('resume',command.commandId)),staffProvisionSchema);
    if (row.sourceProject!==actor.sourceProject) throw new EarningsError(403,'staff_access_denied');
    if (row.state==='ready') return privateJson(row);

    // A collision in the legacy directory needs an explicit identity review.
    const contacts=await db.collection('users').select('email','nativeStaffProvisioningId').get();
    if (contacts.docs.some(doc=>{
      const email=doc.get('email');
      return typeof email==='string' && email.trim().toLowerCase()===row.email &&
        (doc.id!==row.userId || doc.get('nativeStaffProvisioningId')!==row.commandId);
    })) {
      throw new EarningsError(409,'staff_legacy_email_exists');
    }

    let auth=await findSupabaseDriverAuth(row.userId);
    if (!auth) {
      try {auth=await createSupabaseStaffAuth(row.userId,row.email,row.commandId);}
      catch(error) {
        // The previous request may have committed at GoTrue before losing its reply.
        auth=await findSupabaseDriverAuth(row.userId);
        if (!auth) throw error;
      }
    }
    assertOwnAuth(auth,row);

    const source=db.collection('users').doc(row.userId);
    await db.runTransaction(async tx=>{
      const doc=await tx.get(source);
      if (doc.exists) {
        if (doc.get('nativeStaffProvisioningId')!==row.commandId || doc.get('email')!==row.email ||
            doc.get('role')!==row.role) throw new EarningsError(409,'staff_source_conflict');
        return;
      }
      tx.create(source,{
        nativeStaffProvisioningId:row.commandId,email:row.email,displayName:row.name,role:row.role,
        active:true,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),
      });
    });

    // Recheck caller/session and the exact Auth marker in SQL before granting membership.
    return privateJson(result(await run('activate',row.commandId),staffProvisionSchema));
  } catch(error) {return earningsErrorResponse(error);}
}
