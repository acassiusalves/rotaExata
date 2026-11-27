import { requireStaffActor } from '@/lib/server/staff/actor';
import { projectStaffRoute } from '@/lib/server/staff/route-projection';
import { applyStaffRouteCommand,staffRouteRevision } from '@/lib/server/staff/route-commands';
import { staffSourceDb } from '@/lib/server/staff/source';
import type { StaffOperation } from '@/lib/staff/access';
import { routeDocumentId,staffRouteCommandSchema,type StaffRouteCommand } from '@/lib/staff/route-contract';
import { earningsErrorResponse,EarningsError,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

type Context={params:Promise<{id:string}>};
const operations:Record<StaffRouteCommand['kind'],StaffOperation>={
  rename:'route:rename',assign:'route:assign',duplicate:'route:duplicate',
  delete:'route:delete',complete:'route:complete',
};
async function routeId(context:Context) {
  const parsed=routeDocumentId.safeParse((await context.params).id);
  if (!parsed.success) throw new EarningsError(404,'staff_route_not_found');
  return parsed.data;
}

export async function GET(request:Request,context:Context) {
  try {
    const actor=await requireStaffActor(request,'route:read');
    const db=staffSourceDb(actor);
    const route=await db.collection('routes').doc(await routeId(context)).get();
    if (!route.exists) throw new EarningsError(404,'staff_route_not_found');
    return privateJson({route:projectStaffRoute(route.id,route.data()!,staffRouteRevision(route.updateTime))});
  } catch(error) {return earningsErrorResponse(error);}
}

export async function PATCH(request:Request,context:Context) {
  try {
    const parsed=staffRouteCommandSchema.safeParse(await readJsonBody(request,4096));
    if (!parsed.success) throw new EarningsError(422,'staff_invalid_command');
    const actor=await requireStaffActor(request,operations[parsed.data.kind]);
    const result=await applyStaffRouteCommand(staffSourceDb(actor),actor,await routeId(context),parsed.data);
    return privateJson(result);
  } catch(error) {return earningsErrorResponse(error);}
}
