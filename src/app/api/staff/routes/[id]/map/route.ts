import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { staffRouteMap } from '@/lib/server/staff/route-monitor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { routeDocumentId } from '@/lib/staff/route-contract';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';

const viewSchema=z.enum(['monitor','history']);

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const view=viewSchema.safeParse(new URL(request.url).searchParams.get('view'));
    const id=routeDocumentId.safeParse((await params).id);
    if (!view.success || !id.success) throw new EarningsError(422,'staff_invalid_query');
    const actor=await requireStaffActor(request,view.data==='monitor' ? 'routes:monitor' : 'history:routes');
    return privateJson(await staffRouteMap(staffSourceDb(actor),id.data,view.data));
  } catch(error) {return earningsErrorResponse(error);}
}
