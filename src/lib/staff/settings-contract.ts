import { z } from 'zod';
import { alwaysAdminPages,defaultPagePermissions } from '../permissions.ts';
import { staffRoles } from './access.ts';
import { routeRevisionSchema,staffPlannedPlaceSchema } from './route-contract.ts';

const editablePage=z.string().refine(path=>Object.hasOwn(defaultPagePermissions,path));
export const staffPermissionsCommand=z.object({
  expectedRevision:routeRevisionSchema.nullable(),
  pagePermissions:z.record(editablePage,z.array(z.enum(staffRoles)).max(staffRoles.length)),
  inactivePages:z.array(editablePage),
}).strict().superRefine((settings,ctx)=>{
  if (settings.inactivePages.some(path=>alwaysAdminPages.includes(path)) ||
      Object.values(settings.pagePermissions).some(roles=>!roles.includes('admin'))) {
    ctx.addIssue({code:z.ZodIssueCode.custom,message:'administrator_access_required'});
  }
});
export type StaffPermissionsCommand=z.infer<typeof staffPermissionsCommand>;

const expectedRevision=routeRevisionSchema.nullable();
export const staffSettingsCommand=z.discriminatedUnion('kind',[
  z.object({kind:z.literal('delivery'),expectedRevision,enabled:z.boolean(),maxDistance:z.number().min(0.1).max(10)}).strict(),
  z.object({kind:z.literal('origin'),expectedRevision,origin:staffPlannedPlaceSchema.strict()}).strict(),
]);
export type StaffSettingsCommand=z.infer<typeof staffSettingsCommand>;
