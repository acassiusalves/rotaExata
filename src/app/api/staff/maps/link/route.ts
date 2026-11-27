import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';
import { resolveStaffMapsLink } from '@/lib/server/maps-link';

const input=z.object({url:z.string().trim().min(1).max(4096)}).strict();

export async function POST(request:Request) {
  try {
    const view=new URL(request.url).searchParams.get('view');
    if (view!==null && view!=='settings') throw new EarningsError(422,'staff_invalid_query');
    await requireStaffActor(request,view==='settings'?'settings:manage':'route:create');
    const body=input.safeParse(await readJsonBody(request,8192));
    if (!body.success) throw new EarningsError(422,'staff_invalid_maps_link');
    return privateJson(await resolveStaffMapsLink(body.data.url));
  } catch(error) {return earningsErrorResponse(error);}
}
