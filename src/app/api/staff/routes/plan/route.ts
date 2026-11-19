import { requireStaffActor } from '@/lib/server/staff/actor';
import { applyStaffPlanBatch } from '@/lib/server/staff/route-plan';
import { staffSourceDb } from '@/lib/server/staff/source';
import { projectStaffEvidencePlace } from '@/lib/server/staff/route-projection';
import { staffPlanBatchSchema } from '@/lib/staff/route-plan-contract';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function POST(request:Request) {
  try {
    const body=staffPlanBatchSchema.safeParse(await readJsonBody(request,1024*1024));
    if (!body.success) throw new EarningsError(422,'staff_invalid_plan');
    const actor=await requireStaffActor(request,body.data.newRoutes?.length ? 'route:organize':'route:edit');
    const result=await applyStaffPlanBatch(staffSourceDb(actor),actor,body.data);
    return privateJson({
      ...result,
      existingRoutes:result.existingRoutes.map(route=>({...route,stops:route.stops.map(stop=>projectStaffEvidencePlace(route.routeId,stop)),
        removedStops:route.removedStops.map(stop=>projectStaffEvidencePlace(route.routeId,stop))})),
      createdRoutes:result.createdRoutes.map(route=>({...route,stops:route.stops.map(stop=>projectStaffEvidencePlace(route.routeId,stop))})),
    });
  } catch(error) {return earningsErrorResponse(error);}
}
