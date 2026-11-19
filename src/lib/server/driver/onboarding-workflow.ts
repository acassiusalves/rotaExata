import type { DriverProvision,DriverProvisionSelf,ProvisionStep } from '../../driver/provisioning-contract.ts';
import { EarningsError } from '../earnings/transport.ts';

type AuthIdentity={id:string; email?:string; app_metadata?:Record<string,unknown>};
type Project=(row:DriverProvision,stage:'pending'|'ready'|'assignable')=>Promise<void>;
type DriverProvisioningAuthority={
  lookup:(id:string)=>Promise<AuthIdentity|null>;
  create:(row:DriverProvision)=>Promise<AuthIdentity>;
  project:Project;
  prepare:(row:DriverProvision)=>Promise<DriverProvision>;
};

export async function provisionDriver(row:DriverProvision,authority:DriverProvisioningAuthority) {
  if (row.state!=='reserved') return row;
  let identity=await authority.lookup(row.userId);
  if (!identity) {
    try {
      identity=await authority.create(row);
    } catch (error) {
      identity=await authority.lookup(row.userId);
      if (!identity) throw error;
    }
  }
  if (identity.id!==row.userId || identity.email?.toLowerCase()!==row.email ||
    identity.app_metadata?.rota_driver_provisioning!==row.commandId) {
    throw new EarningsError(409,'driver_provision_identity_conflict');
  }
  await authority.project(row,'pending');
  return authority.prepare(row);
}

type DriverActivationAuthority={
  changePassword:(password:string)=>Promise<void>;
  project:Project;
  progress:(step:ProvisionStep,row:DriverProvision)=>Promise<DriverProvision>;
};

export async function finishDriverOnboarding(
  onboarding:DriverProvisionSelf,password:string|undefined,authority:DriverActivationAuthority,
) {
  let current:DriverProvision=onboarding;
  if (current.state==='awaiting_access') {
    if (password) await authority.changePassword(password);
    else if (!onboarding.passwordSet) throw new EarningsError(422,'driver_provision_password_required');
    current=await authority.progress('activate',current);
  }
  if (current.state==='publishing') {
    await authority.project(current,'ready');
    current=await authority.progress('publish',current);
  }
  if (current.state==='assignable') {
    await authority.project(current,'assignable');
    current=await authority.progress('settle',current);
  }
  if (current.state!=='complete') throw new EarningsError(409,'driver_provision_revision_conflict');
  return current;
}

export function driverProjectionPatch(
  row:DriverProvision,stage:'pending'|'ready'|'assignable',existing:Record<string,unknown>|undefined,
):Record<string,unknown>|null {
  if (!existing) {
    if (stage!=='pending') throw new EarningsError(409,'driver_provision_source_conflict');
    return {
      nativeDriverProvisioningId:row.commandId,nativeDriverReady:false,
      nativeDriverDispatchEnabled:false,nativeDriverDispatchFence:0,
      displayName:row.name,name:row.name,phone:row.phone,status:'offline',lastSeenAt:null,
      vehicle:{type:'N/A',plate:'N/A'},
    };
  }
  if (existing.nativeDriverProvisioningId!==row.commandId ||
      (existing.role!==undefined && existing.role!=='driver')) {
    throw new EarningsError(409,'driver_provision_source_conflict');
  }
  if (stage==='pending') return null;
  if (stage==='ready') return existing.nativeDriverReady===true ? null : {nativeDriverReady:true};
  if (existing.nativeDriverReady!==true) throw new EarningsError(409,'driver_provision_source_conflict');
  return existing.role==='driver' ? null : {role:'driver',nativeDriverDispatchEnabled:true};
}


export function driverDispatchPatch(existing:Record<string,unknown>|undefined,provisioningId:string,revision:number,enabled:boolean) {
  const fence=existing?.nativeDriverDispatchFence;
  const desired=revision+1;
  if (existing?.nativeDriverProvisioningId!==provisioningId || existing.nativeDriverReady!==true ||
      existing.role!=='driver' || typeof fence!=='number' || !Number.isSafeInteger(fence)) {
    throw new EarningsError(409,'driver_provision_source_conflict');
  }
  if (fence===desired && existing.nativeDriverDispatchEnabled===enabled) return null;
  if (fence>=desired || (enabled && existing.nativeDriverDispatchEnabled!==false)) {
    throw new EarningsError(409,'driver_account_revision_conflict');
  }
  return {nativeDriverDispatchEnabled:enabled,nativeDriverDispatchFence:desired};
}
