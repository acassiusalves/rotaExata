import { staffPlannedPlaceSchema } from './route-contract.ts';
import { staffPlanBatchSchema } from './route-plan-contract.ts';
import type { RoutePlanBatchInput } from '../route-stop-mutations.ts';
import { driverTimestamp } from '../driver/runtime-contract.ts';

export const editorPlannedStop=staffPlannedPlaceSchema.partial().extend({
  pointCode:staffPlannedPlaceSchema.shape.id.optional(),
  _originalStopKey:staffPlannedPlaceSchema.shape.placeId.optional(),
});

export function editorStop(value:unknown) {
  return editorPlannedStop.parse(value);
}

function metadata(data:Record<string,unknown>) {
  return {
    name:data.name,origin:data.origin ? staffPlannedPlaceSchema.parse(data.origin):undefined,
    plannedDate:driverTimestamp(data.plannedDate) ?? undefined,color:data.color,period:data.period,
    driverId:typeof data.driverId==='string' && data.driverId ? data.driverId:undefined,
    status:data.status,
  };
}

export function staffPlanPayload(commandId:string,input:RoutePlanBatchInput & {draftDispatch?:unknown;unlink?:unknown}) {
  return staffPlanBatchSchema.parse({
    commandId,
    existingPlans:input.existingPlans.map(plan=>({
      routeId:plan.routeId,expectedStatus:plan.expectedStatus,metrics:plan.metrics,
      baseStops:plan.baseStops.map(({id,placeId,pointCode,orderNumber,address,lat,lng})=>({
        id:typeof id==='number' ? String(id):id,placeId,pointCode,orderNumber,address,lat,lng,
      })),
      plannedStops:plan.plannedStops.map(stop=>editorStop({...stop,id:stop.id!=null ? String(stop.id):undefined})),
      metadata:plan.metadata ? metadata(plan.metadata):undefined,
      unassignedStops:Array.isArray(plan.metadata?.unassignedStops) ? plan.metadata!.unassignedStops.map(editorStop):undefined,
    })),
    newRoutes:input.newRoutes?.map(route=>({
      routeId:route.routeId,plannedStops:route.plannedStops.map(editorStop),
      data:{...metadata(route.data),routeKey:route.data.routeKey,encodedPolyline:route.data.encodedPolyline,
        distanceMeters:route.data.distanceMeters,duration:route.data.duration},
    })),
    transferIntents:input.transferIntents,serviceLink:input.serviceLink,draftDispatch:input.draftDispatch,unlink:input.unlink,
  });
}
