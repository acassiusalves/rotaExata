import { assertEditorResources,requireStaffEditor } from '@/lib/server/staff/editor-access';
import { nativeStaffPushSender } from '@/lib/server/staff/push-runtime';
import { staffEditorSurfaceSchema } from '@/lib/staff/access';
import { dispatchStaffRouteNotice } from '@/lib/server/staff/route-notices';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const surface=staffEditorSurfaceSchema.safeParse(await readJsonBody(request,1024));
    if (!surface.success) throw new EarningsError(422,'staff_invalid_editor_selection');
    const {actor,db}=await requireStaffEditor(request,surface.data);
    const {id}=await params;
    if (!/^[a-f0-9]{64}$/.test(id)) throw new EarningsError(404,'staff_notice_not_found');
    const job=await db.collection('rotaStaffRouteNotices').doc(id).get();
    if (typeof job.get('routeId')!=='string') throw new EarningsError(404,'staff_notice_not_found');
    await assertEditorResources(db,actor,surface.data,{routeIds:[job.get('routeId')]});
    const push=await dispatchStaffRouteNotice(db,id,nativeStaffPushSender);
    return privateJson({ok:true,push});
  } catch(error) {return earningsErrorResponse(error);}
}
