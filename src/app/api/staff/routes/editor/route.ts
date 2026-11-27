import { z } from 'zod';
import { assertEditorResources,editorCanReadRoute,editorCanReadService,editorRouteTarget,requireStaffEditor } from '@/lib/server/staff/editor-access';
import { staffCursorInput } from '@/lib/server/staff/query-page';
import { readStaffEditor } from '@/lib/server/staff/editor-read';
import { applyStaffEditorCommand } from '@/lib/server/staff/editor-commands';
import { staffEditorReadSchema,staffEditorCommandSchema } from '@/lib/staff/editor-contract';
import { staffEditorSurfaceSchema,staffOperationAllowed } from '@/lib/staff/access';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';

const input=z.object({surface:staffEditorSurfaceSchema,body:staffEditorReadSchema,cursor:staffCursorInput.optional()}).strict();
const mutation=z.object({surface:staffEditorSurfaceSchema,body:staffEditorCommandSchema}).strict();

export async function POST(request:Request) {
  try {
    const parsed=input.safeParse(await readJsonBody(request,8192));
    if (!parsed.success) throw new EarningsError(422,'staff_invalid_editor_selection');
    const {surface,body}=parsed.data;
    const {actor,db}=await requireStaffEditor(request,surface);
    if (body.kind==='route') await assertEditorResources(db,actor,surface,{routeIds:[body.id]});
    if (body.kind==='service' || body.kind==='service-routes') await assertEditorResources(db,actor,surface,{serviceId:body.id});
    const result=await readStaffEditor(db,body,parsed.data.cursor,{
      service:id=>editorCanReadService(actor,surface,id),
      route:document=>editorCanReadRoute(actor,surface,editorRouteTarget(document)),
    });
    if ((body.kind==='service-routes'||body.kind==='active'||body.kind==='scheduled') && 'records' in result) {
      return privateJson({...result,records:result.records?.filter(route=>route && editorCanReadRoute(actor,surface,route))});
    }
    if (body.kind==='orders' && 'records' in result && !staffOperationAllowed(actor,'route:read')) {
      return privateJson({...result,records:result.records?.filter(row=>row && (
        surface.view==='route-follow' && 'rotaExataRouteId' in row && row.rotaExataRouteId===surface.anchor ||
        (surface.view==='service-follow'||surface.view==='service-organize') &&
          'rotaExataServiceId' in row && row.rotaExataServiceId===surface.anchor))});
    }
    return privateJson(result);
  } catch(error) {return earningsErrorResponse(error);}
}

export async function PATCH(request:Request) {
  try {
    const parsed=mutation.safeParse(await readJsonBody(request,1024*1024));
    if (!parsed.success) throw new EarningsError(422,'staff_invalid_editor_command');
    const {surface,body}=parsed.data;
    const {actor,db}=await requireStaffEditor(request,surface);
    await assertEditorResources(db,actor,surface,{routeIds:[body.routeId]});
    return privateJson(await applyStaffEditorCommand(db,actor,body,{
      service:id=>editorCanReadService(actor,surface,id),
      route:document=>editorCanReadRoute(actor,surface,editorRouteTarget(document)),
    }));
  } catch(error) {return earningsErrorResponse(error);}
}
