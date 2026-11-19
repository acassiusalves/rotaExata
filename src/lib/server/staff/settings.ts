import { FieldValue,type DocumentSnapshot,type Firestore } from 'firebase-admin/firestore';
import { defaultPagePermissions } from '../../permissions.ts';
import { defaultStaffPolicy,staffOperationAllowed,staffPolicySchema } from '../../staff/access.ts';
import type { StaffPermissionsCommand,StaffSettingsCommand } from '../../staff/settings-contract.ts';
import { EarningsError } from '../earnings/transport.ts';
import type { StaffActor } from './actor.ts';
import { staffRouteRevision } from './route-commands.ts';
import { projectStaffPlace } from './route-projection.ts';

const policyPath='settings/permissions';
const generalPath='settings/general';
const originPath='settings/defaultOrigin';
const revision=(snapshot:DocumentSnapshot)=>staffRouteRevision(snapshot.updateTime) ?? null;

export function localStaffPolicy(snapshot:DocumentSnapshot) {
  if (!snapshot.exists) return defaultStaffPolicy;
  const parsed=staffPolicySchema.safeParse({
    pagePermissions:snapshot.get('permissions'),inactivePages:snapshot.get('inactivePages') ?? [],
  });
  if (!parsed.success) throw new EarningsError(503,'staff_unavailable');
  return parsed.data;
}
export async function readStaffPermissions(db:Firestore) {
  const snapshot=await db.doc(policyPath).get();
  const policy=localStaffPolicy(snapshot);
  return {revision:revision(snapshot),permissions:{...defaultPagePermissions,...policy.pagePermissions},inactivePages:policy.inactivePages};
}

export async function patchStaffPermissions(db:Firestore,actor:StaffActor,command:StaffPermissionsCommand) {
  const ref=db.doc(policyPath);
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if (command.expectedRevision!==revision(snapshot)) throw new EarningsError(409,'staff_policy_conflict');
    const previous=localStaffPolicy(snapshot);
    if (!staffOperationAllowed({...actor,rotaPolicy:previous},'permissions:manage')) throw new EarningsError(403,'staff_access_denied');
    const policy={pagePermissions:command.pagePermissions,inactivePages:command.inactivePages};
    tx.set(ref,{permissions:policy.pagePermissions,inactivePages:policy.inactivePages,
      updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.sourceUid ?? actor.userId},{merge:true});
    tx.create(db.collection('activity_log').doc(),{
      entityType:'settings',entityId:'permissions',eventType:'settings_updated',timestamp:FieldValue.serverTimestamp(),
      canonicalUserId:actor.userId,userId:actor.sourceUid ?? actor.userId,userName:actor.name,
      action:'Permissões Rota Exata atualizadas',metadata:{before:previous,after:policy},
    });
  });
  return readStaffPermissions(db);
}

export async function readStaffSettings(db:Firestore) {
  const [general,origin]=await db.getAll(db.doc(generalPath),db.doc(originPath));
  return {
    delivery:{enabled:general.get('deliveryDistanceValidation')===true,
      maxDistance:typeof general.get('maxDeliveryDistance')==='number' ? general.get('maxDeliveryDistance'):0.5,
      revision:revision(general)},
    origin:{place:origin.get('origin') ? projectStaffPlace(origin.get('origin')):null,revision:revision(origin)},
  };
}

export async function patchStaffSettings(db:Firestore,actor:StaffActor,command:StaffSettingsCommand) {
  const path=command.kind==='delivery' ? generalPath:originPath;
  const ref=db.doc(path);
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref);
    if (command.expectedRevision!==revision(snapshot)) throw new EarningsError(409,'staff_settings_conflict');
    const fields=command.kind==='delivery' ? {deliveryDistanceValidation:command.enabled,maxDeliveryDistance:command.maxDistance}:
      {origin:command.origin};
    tx.set(ref,{...fields,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.sourceUid ?? actor.userId},{merge:true});
    tx.create(db.collection('activity_log').doc(),{
      entityType:'settings',entityId:ref.id,eventType:'settings_updated',timestamp:FieldValue.serverTimestamp(),
      canonicalUserId:actor.userId,userId:actor.sourceUid ?? actor.userId,userName:actor.name,
      action:command.kind==='delivery' ? 'Validação de entrega atualizada':'Origem padrão atualizada',
    });
  });
  return readStaffSettings(db);
}
