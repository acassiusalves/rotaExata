import { z } from 'zod';
import { editorCanReadRoute,requireStaffEditor } from '@/lib/server/staff/editor-access';
import { staffEditorSurfaceSchema,type StaffEditorSurface } from '@/lib/staff/access';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { readStaffLegacyPhoto } from '@/lib/server/staff/legacy-photo';
import { readDeliveryPhoto } from '@/lib/server/driver/media';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';
import { staffPhotoViews,staffRouteCanReadPhoto,type StaffPhotoView } from '@/lib/staff/media-policy';
import type { StaffOperation } from '@/lib/staff/access';

const viewSchema=z.enum(staffPhotoViews);
const photoOperations:Record<StaffPhotoView,StaffOperation>={
  dashboard:'dashboard:read',monitor:'routes:monitor',report:'reports:general',history:'history:routes','driver-history':'history:driver',route:'route:read',
};

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const search=new URL(request.url).searchParams;
    const view=viewSchema.safeParse(search.get('view'));
    if (!view.success) throw new EarningsError(422,'staff_invalid_query');
    let editor:(Awaited<ReturnType<typeof requireStaffEditor>> & {surface:StaffEditorSurface})|undefined;
    const surfaceRaw=search.get('editor');
    if (surfaceRaw) {
      if (surfaceRaw.length>400 || view.data!=='route') throw new EarningsError(422,'staff_invalid_query');
      let raw;
      try {raw=JSON.parse(surfaceRaw);} catch {throw new EarningsError(422,'staff_invalid_query');}
      const surface=staffEditorSurfaceSchema.safeParse(raw);
      if (!surface.success) throw new EarningsError(422,'staff_invalid_query');
      editor={...(await requireStaffEditor(request,surface.data)),surface:surface.data};
    }
    const actor=editor?.actor ?? await requireStaffActor(request,photoOperations[view.data]);
    const db=staffSourceDb(actor);
    const {id}=await params;
    const canRead=(routeId:string,route:Record<string,unknown>)=>!editor ||
      editorCanReadRoute(editor.actor,editor.surface,{id:routeId,status:route.status,serviceId:route.serviceId});
    const src=id.startsWith('legacy.') ? await readStaffLegacyPhoto(db,id,view.data,canRead) : await readDeliveryPhoto(id,{
      routeAllowed:(route,path,routeId)=>!!route && canRead(routeId,route) && staffRouteCanReadPhoto(route,path,view.data),
    });
    return privateJson({src});
  } catch(error) {return earningsErrorResponse(error);}
}
