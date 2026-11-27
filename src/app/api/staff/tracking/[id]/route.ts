import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { driverAuthority } from '@/lib/server/driver/authority';
import { projectStaffRoute } from '@/lib/server/staff/route-projection';
import { adminDb } from '@/lib/firebase/admin';
import { activeDriverStop } from '@/lib/driver/runtime-contract';
import { routeDocumentId } from '@/lib/staff/route-contract';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';

const query=z.object({view:z.enum(['staff','driver']).default('staff')}).strict();

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const selection=query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    const id=routeDocumentId.safeParse((await params).id);
    if (!selection.success || !id.success) throw new EarningsError(422,'staff_invalid_query');

    const driver=selection.data.view==='driver' ? await driverAuthority(request,'native') : null;
    const db=driver ? adminDb : staffSourceDb(await requireStaffActor(request,'route:read'));
    if (!db) throw new EarningsError(503,'staff_unavailable');
    const doc=await db.collection('routes').doc(id.data).get();
    const data=doc.data();
    if (!data || (driver && data.driverId!==driver.sourceUid) ||
        !['dispatched','in_progress','completed','completed_auto'].includes(data.status)) {
      throw new EarningsError(404,'staff_route_not_found');
    }
    const route=projectStaffRoute(doc.id,data);
    const stops=route.stops.filter(activeDriverStop).map(stop=>({
      id:stop.id,lat:stop.lat,lng:stop.lng,address:stop.address,customerName:stop.customerName,deliveryStatus:stop.deliveryStatus,completedAt:stop.completedAt,
    }));
    const currentStopIndex=typeof route.currentStopIndex==='number' ? route.stops.slice(0,route.currentStopIndex).filter(activeDriverStop).length:undefined;
    return privateJson({route:{
      id:route.id,code:route.code,name:route.name,status:route.status==='completed_auto'?'completed':route.status,
      origin:route.origin,stops,distanceMeters:route.distanceMeters,duration:route.duration,
      encodedPolyline:stops.length===route.stops.length ? route.encodedPolyline:'',
      plannedDate:route.plannedDate,currentLocation:route.currentLocation,currentStopIndex,
      driverInfo:route.driverInfo ? {
        name:route.driverInfo.name,vehicle:route.driverInfo.vehicle.type,plate:route.driverInfo.vehicle.plate,
        phone:typeof data.driverInfo?.phone==='string' ? data.driverInfo.phone:undefined,
      }:null,
    }});
  } catch(error) {return earningsErrorResponse(error);}
}
