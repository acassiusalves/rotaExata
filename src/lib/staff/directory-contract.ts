import { z } from 'zod';
import { staffRoles } from './access.ts';

const uuid=z.string().uuid();
const revision=z.number().int().nonnegative().safe();
const commandFields={targetId:uuid,revision,commandId:uuid};
export const staffSecurityActions=['revoke_sessions','set_active','set_inactive','require_password_change'] as const;
export const staffDirectoryCommandSchema=z.union([
  z.object({...commandFields,action:z.enum(staffSecurityActions)}).strict(),
  z.object({...commandFields,action:z.literal('set_role'),role:z.enum(staffRoles)}).strict(),
]);
export type StaffDirectoryCommand=z.infer<typeof staffDirectoryCommandSchema>;

export const staffAccountSchema=z.object({
  userId:uuid,name:z.string(),email:z.string().nullable(),emailVerified:z.boolean(),
  role:z.enum(staffRoles),active:z.boolean(),legacyDisabled:z.boolean(),mustChangePassword:z.boolean(),
  revision,createdAt:z.string(),lastSignInAt:z.string().nullable(),
  pendingRole:z.object({commandId:uuid,role:z.enum(staffRoles),revision}).nullish(),
});
export type StaffAccount=z.infer<typeof staffAccountSchema>;

export const staffProvisionCommandSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('reserve'),commandId:uuid,name:z.string().trim().min(2).max(150),
    email:z.string().trim().toLowerCase().email().max(254),role:z.enum(staffRoles)}).strict(),
  z.object({action:z.literal('resume'),commandId:uuid}).strict(),
]);
export const staffProvisionSchema=z.object({
  userId:uuid,commandId:uuid,sourceProject:z.string(),name:z.string(),email:z.string().email(),
  role:z.enum(staffRoles),state:z.enum(['reserved','ready']),createdAt:z.string(),
});
export type StaffProvision=z.infer<typeof staffProvisionSchema>;
