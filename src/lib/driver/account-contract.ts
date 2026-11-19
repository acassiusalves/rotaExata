import { z } from 'zod';

export const driverAccountSchema=z.object({
  userId:z.string().uuid(),name:z.string(),active:z.boolean(),legacyDisabled:z.boolean(),emailVerified:z.boolean(),
  mustChangePassword:z.boolean(),dispatchState:z.enum(['enabled','blocked','finish_block','restore','unavailable']).optional(),
  revision:z.string().regex(/^\d{1,20}:\d{1,20}$/),
});
export const driverAccountCommand=z.object({
  commandId:z.string().uuid(),targetId:z.string().uuid(),revision:driverAccountSchema.shape.revision,
  action:z.enum(['revoke_sessions','set_active','set_inactive','require_password_change','restore_dispatch']),
}).strict();
export type DriverAccount=z.infer<typeof driverAccountSchema>;
export type DriverAccountCommand=z.infer<typeof driverAccountCommand>;
