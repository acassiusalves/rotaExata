import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { readDeliveryPhoto } from '@/lib/server/driver/media';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';
import { staffPhotoViews,staffRouteCanReadPhoto,type StaffPhotoView } from '@/lib/staff/media-policy';
import type { StaffOperation } from '@/lib/staff/access';

const viewSchema=z.enum(staffPhotoViews);
const photoOperations:Record<StaffPhotoView,StaffOperation>={
  dashboard:'dashboard:read',monitor:'routes:monitor',report:'reports:general',history:'history:routes',route:'route:read',
};

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const view=viewSchema.safeParse(new URL(request.url).searchParams.get('view'));
    if (!view.success) throw new EarningsError(422,'staff_invalid_query');
    const actor=await requireStaffActor(request,photoOperations[view.data]);
    staffSourceDb(actor);
    const src=await readDeliveryPhoto((await params).id,{
      routeAllowed:(route,path)=>staffRouteCanReadPhoto(route,path,view.data),
    });
    return privateJson({src});
  } catch(error) {return earningsErrorResponse(error);}
}
