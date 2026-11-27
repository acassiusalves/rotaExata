import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { readStaffActivities,readStaffHistoricalDrivers,readStaffRouteHistory,readStaffRouteRemovals } from '@/lib/server/staff/history';
import { staffSourceDb } from '@/lib/server/staff/source';
import { routeDocumentId } from '@/lib/staff/route-contract';
import { EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

const query=z.discriminatedUnion('view',[
  z.object({view:z.literal('activities')}).strict(),
  z.object({view:z.literal('drivers'),cursor:routeDocumentId.optional()}).strict(),
  z.object({view:z.literal('driver'),driverId:routeDocumentId,cursor:routeDocumentId.optional()}).strict(),
  z.object({view:z.literal('routes'),cursor:routeDocumentId.optional()}).strict(),
  z.object({view:z.literal('removals'),routeId:routeDocumentId,source:z.enum(['driver','routes'])}).strict(),
]);

export async function GET(request:Request) {
  try {
    const selection=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!selection.success) throw new EarningsError(422,'staff_invalid_query');
    const view=selection.data;
    const operation=view.view==='activities' ? 'history:activity':
      view.view==='drivers'||view.view==='driver'||(view.view==='removals'&&view.source==='driver')?'history:driver':'history:routes';
    const db=staffSourceDb(await requireStaffActor(request,operation));
    if (view.view==='activities') return privateJson(await readStaffActivities(db));
    if (view.view==='drivers') return privateJson(await readStaffHistoricalDrivers(db,view.cursor));
    if (view.view==='removals') return privateJson(await readStaffRouteRemovals(db,view.routeId));
    return privateJson(await readStaffRouteHistory(db,view.view==='driver' ? view.driverId:undefined,view.cursor));
  } catch(error) {return earningsErrorResponse(error);}
}
