import { NextRequest } from 'next/server';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { EarningsError,earningsErrorResponse } from '@/lib/server/earnings/transport';
import { POST as resolveMapsLink } from '../../../resolve-maps-link/route';

export async function POST(request:NextRequest) {
  try {
    const view=new URL(request.url).searchParams.get('view');
    if (view!==null && view!=='settings') throw new EarningsError(422,'staff_invalid_query');
    await requireStaffActor(request,view==='settings'?'settings:manage':'route:create');
    return await resolveMapsLink(request);
  } catch(error) {return earningsErrorResponse(error);}
}
