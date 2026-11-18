import { z } from 'zod';

export const driverAccountSchema=z.object({
  userId:z.string().uuid(),name:z.string(),active:z.boolean(),legacyDisabled:z.boolean(),emailVerified:z.boolean(),
  mustChangePassword:z.boolean(),revision:z.string().regex(/^\d{1,20}:\d{1,20}$/),
});
export const driverAccountCommand=z.object({
  commandId:z.string().uuid(),targetId:z.string().uuid(),revision:driverAccountSchema.shape.revision,
  action:z.enum(['revoke_sessions','set_active','set_inactive','require_password_change']),
}).strict();
export type DriverAccount=z.infer<typeof driverAccountSchema>;
export type DriverAccountCommand=z.infer<typeof driverAccountCommand>;
