import { z } from 'zod';

export const notificationTypes=['route_change','route_assigned','route_completed','system','alert'] as const;
const notificationType=z.enum(notificationTypes);
const priority=z.enum(['low','medium','high']);
const id=z.string().min(1).max(128).regex(/^[\w-]+$/).refine(value=>!/^__.*__$/.test(value));
const commandId=z.string().uuid();
const item=z.object({id,revision:z.string().regex(/^\d{1,12}\.\d{1,9}$/)}).strict();

export const staffNotificationCreateSchema=z.object({
  commandId,title:z.string().trim().min(1).max(100),message:z.string().trim().min(1).max(500),type:notificationType,
  priority,driverIds:z.array(id).min(1).max(200).refine(ids=>new Set(ids).size===ids.length),push:z.boolean(),
}).strict();

export const staffNotificationChangeSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('mark'),commandId,items:z.array(item).min(1).max(50),read:z.boolean()}).strict(),
  z.object({action:z.literal('delete'),commandId,item}).strict(),
]).refine(value=>value.action==='delete' || new Set(value.items.map(entry=>entry.id)).size===value.items.length);

export const staffNotificationListSchema=z.object({
  type:notificationType.optional(),status:z.enum(['read','unread']).optional(),search:z.string().trim().max(200).optional(),
  cursor:z.string().max(1000).optional(),
}).strict();

export type StaffNotificationCreate=z.infer<typeof staffNotificationCreateSchema>;
export type StaffNotificationChange=z.infer<typeof staffNotificationChangeSchema>;
export type StaffNotificationList=z.infer<typeof staffNotificationListSchema>;
export type StaffPushStatus='not_requested'|'accepted'|'skipped'|'failed'|'uncertain';
export type StaffPushReason='recipient_unavailable'|'consent_missing'|'token_missing'|'token_unlinked'|'binding_invalid'|'destination_changed';
export type StaffNotification={
  id:string; kind:'inbox'|'route'; revision:string; canChange:boolean;
  type:string; title:string; message:string; priority:string; read:boolean; opened:boolean;
  timestamp:string|null; openedAt:string|null; driverName?:string; routeName?:string; routeId?:string;
  reportId?:string; author?:string; push?:StaffPushStatus; pushReason?:StaffPushReason;
};
export type StaffNotificationsPage={notifications:StaffNotification[]; cursor:string|null};
export type StaffNotificationDriver={id:string;displayName:string;email:string};
export type StaffNotificationDrivers={drivers:StaffNotificationDriver[];cursor:string|null};
export type StaffNotificationReceipt={deliveries:{id:string;push:StaffPushStatus;pushReason?:StaffPushReason}[]};
