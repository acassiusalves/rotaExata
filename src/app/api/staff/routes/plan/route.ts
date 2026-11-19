import { z } from 'zod';
import { assertEditorResources,requireStaffEditor } from '@/lib/server/staff/editor-access';
import { staffEditorSurfaceSchema } from '@/lib/staff/access';
import { applyStaffPlanBatch } from '@/lib/server/staff/route-plan';
import { projectStaffEvidencePlace } from '@/lib/server/staff/route-projection';
import { staffPlanBatchSchema } from '@/lib/staff/route-plan-contract';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

const input=z.object({surface:staffEditorSurfaceSchema,body:staffPlanBatchSchema}).strict();

export async function POST(request:Request) {
  try {
    const parsed=input.safeParse(await readJsonBody(request,1024*1024));
    if (!parsed.success) throw new EarningsError(422,'staff_invalid_plan');
    const {surface,body}=parsed.data;
    const {actor,db}=await requireStaffEditor(request,surface);
    await assertEditorResources(db,actor,surface,{
      routeIds:body.existingPlans.map(plan=>plan.routeId),serviceId:body.serviceLink?.serviceId ?? body.unlink?.serviceId,
      creating:!!body.newRoutes?.length,
    });
    const result=await applyStaffPlanBatch(db,actor,body);
    return privateJson({
      ...result,
      existingRoutes:result.existingRoutes.map(route=>({...route,stops:route.stops.map(stop=>projectStaffEvidencePlace(route.routeId,stop)),
        removedStops:route.removedStops.map(stop=>projectStaffEvidencePlace(route.routeId,stop))})),
      createdRoutes:result.createdRoutes.map(route=>({...route,stops:route.stops.map(stop=>projectStaffEvidencePlace(route.routeId,stop))})),
    });
  } catch(error) {return earningsErrorResponse(error);}
}
