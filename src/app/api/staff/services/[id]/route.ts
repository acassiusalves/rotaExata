import { readStaffCursor } from '@/lib/server/staff/query-page';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { applyStaffServiceClose } from "@/lib/server/staff/route-commands";
import { readStaffService } from '@/lib/server/staff/route-board';
import { staffSourceDb } from '@/lib/server/staff/source';
import { routeDocumentId,staffServiceCloseSchema } from '@/lib/staff/route-contract';
import { earningsErrorResponse,EarningsError,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await requireStaffActor(request,'service:read');
    const id=routeDocumentId.safeParse((await params).id);
    if (!id.success) throw new EarningsError(404,'staff_service_not_found');
    return privateJson(await readStaffService(staffSourceDb(actor),id.data,readStaffCursor(request)));
  } catch(error) {return earningsErrorResponse(error);}
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await requireStaffActor(request,'service:force-complete');
    const id=routeDocumentId.safeParse((await params).id);
    if (!id.success) throw new EarningsError(404,'staff_service_not_found');
    const body=staffServiceCloseSchema.safeParse(await readJsonBody(request,4096));
    if (!body.success) throw new EarningsError(422,'staff_invalid_command');
    const result=await applyStaffServiceClose(staffSourceDb(actor),actor,id.data,body.data);
    return privateJson(result);
  } catch(error) {return earningsErrorResponse(error);}
}
