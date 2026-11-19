import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { readStaffRouteBoard,readStaffRouteBoardOptions } from '@/lib/server/staff/route-board';
import { staffSourceDb } from '@/lib/server/staff/source';
import { createStaffDraft } from '@/lib/server/staff/route-draft';
import { routeDocumentId,staffRouteDraftSchema } from '@/lib/staff/route-contract';
import { earningsErrorResponse,EarningsError,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

const listQuery=z.object({cursor:routeDocumentId.optional(),view:z.literal('options').optional()}).strict();

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'routes:list');
    const query=listQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success || (query.data.cursor && query.data.view)) throw new EarningsError(422,'staff_invalid_query');
    const db=staffSourceDb(actor);
    return privateJson(query.data.view ? await readStaffRouteBoardOptions(db):await readStaffRouteBoard(db,query.data.cursor));
  } catch(error) {return earningsErrorResponse(error);}
}

export async function POST(request:Request) {
  try {
    const actor=await requireStaffActor(request,'route:create');
    const body=staffRouteDraftSchema.safeParse(await readJsonBody(request,512*1024));
    if (!body.success) throw new EarningsError(422,'staff_invalid_draft');
    return privateJson(await createStaffDraft(staffSourceDb(actor),actor,body.data));
  } catch(error) {return earningsErrorResponse(error);}
}
