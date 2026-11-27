import { z } from 'zod';

export const firstDriverAccessPath = '/driver/conta?primeiro=1';
const id=z.string().uuid();
export const driverProvisionSchema=z.object({
  commandId:id,userId:id,name:z.string(),email:z.string(),phone:z.string(),sourceProject:z.string(),
  state:z.enum(['reserved','awaiting_access','publishing','assignable','complete']),
  revision:z.number().int().nonnegative().safe(),
});
export const driverProvisionSelfSchema=driverProvisionSchema.extend({passwordSet:z.boolean()});
export const driverProvisionCommand=z.discriminatedUnion('action',[
  z.object({
    action:z.literal('reserve'),commandId:id,name:z.string().trim().min(2).max(120),
    email:z.string().trim().toLowerCase().email().max(254),phone:z.string().regex(/^\d{10,11}$/),
  }).strict(),
  z.object({action:z.literal('resume'),commandId:id}).strict(),
]);
export type DriverProvision=z.infer<typeof driverProvisionSchema>;
export type DriverProvisionSelf=z.infer<typeof driverProvisionSelfSchema>;
export type ProvisionStep='activate'|'publish'|'settle';
