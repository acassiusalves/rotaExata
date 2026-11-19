import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { requestStaffLocation } from '@/lib/server/staff/route-monitor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { routeDocumentId } from '@/lib/staff/route-contract';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';

const input=z.object({driverId:routeDocumentId,view:z.enum(['dashboard','route','monitor'])}).strict();

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const body=input.safeParse(await readJsonBody(request,2048));
    const id=routeDocumentId.safeParse((await params).id);
    if (!body.success || !id.success) throw new EarningsError(422,'staff_invalid_command');
    const actor=await requireStaffActor(request,body.data.view==='dashboard' ? 'dashboard:read' : body.data.view==='monitor' ? 'routes:monitor' : 'driver:location');
    await requestStaffLocation(staffSourceDb(actor),id.data,body.data.driverId,actor.userId);
    return privateJson({ok:true});
  } catch(error) {return earningsErrorResponse(error);}
}
