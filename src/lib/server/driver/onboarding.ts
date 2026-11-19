import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import { adminDb } from '@/lib/firebase/admin';
import { earningsScopeId,verifyNativeSession } from '@/lib/server/earnings/actor';
import { privateJson } from '@/lib/server/earnings/store';
import {
  createSupabaseDriverAuth,EarningsError,earningsErrorResponse,earningsRpc,findSupabaseDriverAuth,readJsonBody,updateSupabasePassword,
} from '@/lib/server/earnings/transport';
import {
  driverProvisionCommand,driverProvisionSchema,driverProvisionSelfSchema,type DriverProvision,
} from '@/lib/driver/provisioning-contract';
import { driverDispatchPatch,driverDispatchRecovery,driverProjectionPatch,finishDriverOnboarding,provisionDriver,restoreDriverDispatchPatch } from './onboarding-workflow';

const listed=z.object({provisioning:z.array(driverProvisionSchema)});
const password=z.string().min(8).max(72).refine(value=>Buffer.byteLength(value,'utf8')<=72);
const selfCommand=z.discriminatedUnion('action',[
  z.object({action:z.literal('password'),password}).strict(),
  z.object({action:z.literal('resume')}).strict(),
]);

function parseRpc<T>(value:unknown,schema:z.ZodType<T>):T {
  const code=(value as {errorCode?:string}|null)?.errorCode;
  if (code==='platform_session_revoked') throw new EarningsError(401,'earnings_unauthorized');
  if (code==='platform_directory_unavailable') throw new EarningsError(503,'earnings_unavailable');
  if (code?.startsWith('platform_')) throw new EarningsError(403,'earnings_access_denied');
  if (code==='driver_provision_invalid' || code==='driver_provision_password_required') throw new EarningsError(422,code);
  if (code?.startsWith('driver_provision_')) throw new EarningsError(409,code);
  const parsed=schema.safeParse(value);
  if (!parsed.success) throw new EarningsError(503,'earnings_unavailable');
  return parsed.data;
}

function sourceDb(sourceProject=process.env.ROTA_EARNINGS_SOURCE_PROJECT) {
  if (!nativeDriverEnabled) throw new EarningsError(404,'route_not_found');
  if (!adminDb || !process.env.ROTA_EARNINGS_SOURCE_PROJECT ||
      process.env.FIREBASE_PROJECT_ID!==process.env.ROTA_EARNINGS_SOURCE_PROJECT ||
      process.env.FIREBASE_PROJECT_ID!==sourceProject) {
    throw new EarningsError(503,'route_unavailable');
  }
  return adminDb;
}

async function requestEnv(request:Request) {
  if (!nativeDriverEnabled) throw new EarningsError(404,'route_not_found');
  const actor=await verifyNativeSession(request);
  return {actor,rpcArgs:{p_user_id:actor.userId,p_session_id:actor.sessionId,p_scope_id:earningsScopeId()}};
}

async function writeProjection(row:DriverProvision,stage:'pending'|'ready'|'assignable') {
  const db=sourceDb(row.sourceProject);
  const target=db.collection('users').doc(row.userId);
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(target);
    const patch=driverProjectionPatch(row,stage,snapshot.data());
    if (!patch) return;
    if (!snapshot.exists) tx.create(target,{...patch,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
    else tx.update(target,{...patch,updatedAt:FieldValue.serverTimestamp()});
  });
}

export async function serveDriverProvision(request:Request) {
  try {
    const {rpcArgs}=await requestEnv(request);
    const run=(p_action:string,fields?:{commandId?:string;name?:string;email?:string;phone?:string;revision?:number})=>
      earningsRpc('rota_driver_provision',{...rpcArgs,p_action,p_command_id:fields?.commandId ?? null,
        p_name:fields?.name ?? null,p_email:fields?.email ?? null,p_phone:fields?.phone ?? null,
        p_expected_revision:fields?.revision ?? null});
    if (request.method==='GET') return privateJson(parseRpc(await run('list'),listed));
    const parsed=driverProvisionCommand.safeParse(await readJsonBody(request,2048));
    if (!parsed.success) throw new EarningsError(422,'driver_provision_invalid');
    sourceDb();
    const {action,...fields}=parsed.data;
    const reserved=parseRpc(await run(action,fields),driverProvisionSchema);
    sourceDb(reserved.sourceProject);
    const result=await provisionDriver(reserved,{
      lookup:findSupabaseDriverAuth,
      create:row=>createSupabaseDriverAuth(row.userId,row.email,row.commandId),
      project:writeProjection,
      prepare:async row=>parseRpc(await run('prepare',{commandId:row.commandId,revision:row.revision}),driverProvisionSchema),
    });
    return privateJson(result);
  } catch(error) {return earningsErrorResponse(error);}
}

export async function serveDriverOnboarding(request:Request) {
  try {
    const {actor,rpcArgs}=await requestEnv(request);
    const run=(p_action:string,p_expected_revision:number|null=null)=>
      earningsRpc('rota_driver_provision_self',{...rpcArgs,p_action,p_expected_revision});
    const inspect=async()=>parseRpc(await run('inspect'),driverProvisionSelfSchema.nullable());
    const onboarding=await inspect();
    if (request.method==='GET') {
      if (!onboarding) return privateJson({onboarding:null});
      let state=onboarding.state;
      if (state==='complete') {
        const source=sourceDb(onboarding.sourceProject);
        const projection=(await source.collection('users').doc(actor.userId).get()).data();
        if (projection?.nativeDriverProvisioningId!==onboarding.commandId || projection?.role!=='driver') state='assignable';
      }
      return privateJson({onboarding:{state,passwordSet:onboarding.passwordSet}});
    }
    if (!onboarding) throw new EarningsError(404,'route_not_found');
    const parsed=selfCommand.safeParse(await readJsonBody(request,2048));
    if (!parsed.success) throw new EarningsError(422,'driver_password_weak');
    sourceDb(onboarding.sourceProject);
    await finishDriverOnboarding(onboarding,parsed.data.action==='password' ? parsed.data.password : undefined,{
      project:writeProjection,
      changePassword:async next=>{
        try {await updateSupabasePassword(actor.token,actor.userId,next);}
        catch (error) {
          // A previous PUT may have committed even though the response never arrived.
          if (!(error instanceof EarningsError && error.code==='driver_password_unchanged' && (await inspect())?.passwordSet)) throw error;
        }
      },
      progress:async (action,row)=>parseRpc(await run(action,row.revision),driverProvisionSchema),
    });
    return privateJson({complete:true});
  } catch(error) {return earningsErrorResponse(error);}
}


export async function projectDriverDispatch(
  id:string,guard:{provisioningId:string;sourceProject:string;revision:number},operation:boolean|'restore',
) {
  const db=sourceDb(guard.sourceProject);
  const target=db.collection('users').doc(id);
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(target);
    const patch=operation==='restore'
      ? restoreDriverDispatchPatch(snapshot.data(),guard.provisioningId,guard.revision)
      : driverDispatchPatch(snapshot.data(),guard.provisioningId,guard.revision,operation);
    if (patch) tx.update(target,{...patch,updatedAt:FieldValue.serverTimestamp()});
  });
}


export async function readDriverDispatchState(
  id:string,guard:{provisioningId:string;sourceProject:string;revision:number},active:boolean,
) {
  try {
    const source=sourceDb(guard.sourceProject);
    const existing=(await source.collection('users').doc(id).get()).data();
    return driverDispatchRecovery(existing,guard.provisioningId,guard.revision,active);
  } catch {
    return 'unavailable' as const;
  }
}
