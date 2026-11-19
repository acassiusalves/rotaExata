import { authorizeOperationalWriter } from '@/lib/firebase/operational-writer-auth';
import { z } from 'zod';
import { optimizeDeliveryRoutes } from '@/ai/flows/optimize-delivery-routes';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

const coordinate=z.object({lat:z.number().min(-90).max(90),lng:z.number().min(-180).max(180)});
const input=z.object({origin:coordinate.strict(),deliveryLocations:z.array(coordinate.extend({
  id:z.string().min(1).max(150),hasTimePreference:z.boolean().optional(),
}).strict()).min(1).max(400)}).strict();

export async function POST(request:Request) {
  try {
    if (nativeStaffEnabled) staffSourceDb(await requireStaffActor(request,'route:edit'));
    else await authorizeOperationalWriter(request);
    const parsed=input.safeParse(await readJsonBody(request,80_000));
    if (!parsed.success) throw new EarningsError(422,'staff_invalid_map_route');
    const result=await optimizeDeliveryRoutes(parsed.data);
    const expected=new Set(parsed.data.deliveryLocations.map(stop=>stop.id));
    const received=new Set(result.optimizedStops.map(stop=>stop.id));
    if (result.optimizedStops.length!==expected.size || received.size!==expected.size ||
        [...received].some(id=>!expected.has(id))) throw new EarningsError(502,'staff_invalid_map_sequence');
    return privateJson(result);
  } catch(error) {return earningsErrorResponse(error);}
}
