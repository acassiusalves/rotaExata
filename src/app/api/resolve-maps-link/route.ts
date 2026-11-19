import { z } from 'zod';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { resolveStaffMapsLink } from '@/lib/server/maps-link';
import { readJsonBody } from '@/lib/server/earnings/transport';
import { NextResponse } from 'next/server';

const input=z.object({url:z.string().trim().min(1).max(4096)}).strict();

export async function POST(req:Request) {
  if (nativeStaffEnabled) return NextResponse.json({error:'rota_staff_native_required'},{status:410});
  try {
    const {url}=input.parse(await readJsonBody(req,8192));
    return NextResponse.json(await resolveStaffMapsLink(url));
  } catch {
    return NextResponse.json({error:'Use um link do Google Maps com a coordenada do local.'},{status:400});
  }
}
