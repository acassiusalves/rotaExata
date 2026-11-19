import { NextRequest } from 'next/server';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { earningsErrorResponse } from '@/lib/server/earnings/transport';
import { POST as resolveMapsLink } from '../../../resolve-maps-link/route';

export async function POST(request:NextRequest) {
  try {
    await requireStaffActor(request,'route:create');
    return await resolveMapsLink(request);
  } catch(error) {return earningsErrorResponse(error);}
}
