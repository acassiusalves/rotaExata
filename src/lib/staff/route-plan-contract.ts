import { z } from 'zod';
import { routeDocumentId,routeRevisionSchema,staffPlannedPlaceSchema } from './route-contract.ts';

const optionalDate=z.string().datetime({offset:true}).optional();
const color=z.string().regex(/^#[a-f0-9]{3,8}$/i).optional();
const pathMetrics=z.object({
  encodedPolyline:z.string().max(120_000),distanceMeters:z.number().min(0).max(10_000_000),duration:z.string().regex(/^\d+(?:\.\d+)?s$/),
}).strict();
const planningPatch=z.object({
  name:z.string().trim().min(1).max(150).optional(),
  plannedDate:optionalDate,origin:staffPlannedPlaceSchema.strict().optional(),
  status:z.literal('dispatched').optional(),driverId:routeDocumentId.optional(),
  period:z.string().max(30).optional(),color,
}).strict();
const placeIdentity=staffPlannedPlaceSchema.pick({id:true,placeId:true,orderNumber:true,address:true,lat:true,lng:true})
  .partial().extend({pointCode:z.string().max(150).optional()}).strict();
const plannedStop=staffPlannedPlaceSchema.partial().extend({
  pointCode:z.string().max(150).optional(),
  _originalStopKey:z.string().max(400).optional(),
}).strict();
const existing=z.object({
  routeId:routeDocumentId,expectedStatus:z.enum(['draft','pending','dispatched','in_progress']).optional(),
  baseStops:z.array(placeIdentity).max(400),plannedStops:z.array(plannedStop).max(400),metrics:pathMetrics.optional(),
  unassignedStops:z.array(plannedStop).max(400).optional(),
  metadata:planningPatch.optional(),
}).strict();
const newRoute=z.object({
  routeId:routeDocumentId,
  data:planningPatch.extend({status:z.enum(['draft','dispatched']),name:z.string().trim().min(1).max(150),
    plannedDate:z.string().datetime({offset:true}),origin:staffPlannedPlaceSchema.strict(),
    encodedPolyline:pathMetrics.shape.encodedPolyline,distanceMeters:pathMetrics.shape.distanceMeters,
    duration:pathMetrics.shape.duration,routeKey:z.string().regex(/^[A-Z]{1,3}$/).optional(),
  }).strict(),
  plannedStops:z.array(plannedStop).min(1).max(400),
}).strict();

export const staffPlanBatchSchema=z.object({
  commandId:z.string().uuid(),existingPlans:z.array(existing).max(40),newRoutes:z.array(newRoute).max(40).optional(),
  transferIntents:z.array(z.object({sourceRouteId:routeDocumentId,targetRouteId:routeDocumentId,stopKey:z.string().max(400)}).strict()).optional(),
  draftDispatch:z.object({routeId:routeDocumentId,revision:routeRevisionSchema,key:z.string().regex(/^[A-Z]{1,3}$/)}).strict().optional(),
  serviceLink:z.object({serviceId:routeDocumentId,routeIds:z.array(routeDocumentId).min(1),requireUnplanned:z.literal(true).optional()}).strict().optional(),
}).strict().superRefine((batch,ctx)=>{
  const created=batch.newRoutes ?? [];
  const ids=[...batch.existingPlans.map(plan=>plan.routeId),...created.map(route=>route.routeId)];
  const issue=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
  if (!ids.length || new Set(ids).size!==ids.length) issue('duplicate_or_empty_route_plan');
  if (batch.existingPlans.some(plan=>plan.metadata?.status==='dispatched' &&
      (!plan.metadata.driverId || !['draft','pending'].includes(plan.expectedStatus ?? '')))) issue('invalid_dispatch_plan');
  if (created.some(route=>route.data.status==='dispatched' && !route.data.driverId)) issue('unassigned_dispatch');
  if (batch.draftDispatch && (created.length!==1 || created[0].data.status!=='dispatched' ||
      batch.serviceLink || ids.includes(batch.draftDispatch.routeId))) issue('invalid_draft_dispatch');
  if (batch.serviceLink && (new Set(batch.serviceLink.routeIds).size!==created.length ||
      batch.serviceLink.routeIds.some(id=>!created.some(route=>route.routeId===id)))) issue('invalid_service_link');
});

export type StaffPlanBatch=z.infer<typeof staffPlanBatchSchema>;
