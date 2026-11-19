import { z } from 'zod';
import { routeDocumentId, staffWriteFields, routeRevisionSchema } from './route-contract.ts';

export const historyResendSchema=z.object({routeId:routeDocumentId,...staffWriteFields}).strict();
export const historyRepairSchema=z.object({
  commandId:staffWriteFields.commandId,
  routes:z.array(z.object({id:routeDocumentId,revision:routeRevisionSchema}).strict()).min(1).max(50),
}).strict().refine(input=>new Set(input.routes.map(route=>route.id)).size===input.routes.length);
export const historyRepairQuerySchema=z.object({view:z.literal('codes'),cursor:routeDocumentId.optional()}).strict();
export type HistoryRepairSelection=z.infer<typeof historyRepairSchema>;
export type HistoryResendSelection=z.infer<typeof historyResendSchema>;
