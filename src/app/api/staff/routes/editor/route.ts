import { requireStaffActor } from '@/lib/server/staff/actor';
import { readStaffEditor } from '@/lib/server/staff/editor-read';
import { applyStaffEditorCommand } from '@/lib/server/staff/editor-commands';

import { staffSourceDb } from '@/lib/server/staff/source';
import { staffEditorReadSchema,staffEditorCommandSchema } from '@/lib/staff/editor-contract';
import { privateJson } from '@/lib/server/earnings/store';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';

export async function POST(request:Request) {
  try {
    const body=staffEditorReadSchema.safeParse(await readJsonBody(request,8192));
    if (!body.success) throw new EarningsError(422,'staff_invalid_editor_selection');
    const actor=await requireStaffActor(request,'route:read');
    return privateJson(await readStaffEditor(staffSourceDb(actor),body.data));
  } catch(error) {return earningsErrorResponse(error);}
}

export async function PATCH(request:Request) {
  try {
    const body=staffEditorCommandSchema.safeParse(await readJsonBody(request,1024*1024));
    if (!body.success) throw new EarningsError(422,'staff_invalid_editor_command');
    const actor=await requireStaffActor(request,body.data.kind==='arrange' ? 'route:organize':'route:edit');
    return privateJson(await applyStaffEditorCommand(staffSourceDb(actor),actor,body.data));
  } catch(error) {return earningsErrorResponse(error);}
}
