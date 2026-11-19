import { allowedStaffPaths } from '@/lib/staff/access';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { privateJson } from '@/lib/server/earnings/store';
import { earningsErrorResponse } from '@/lib/server/earnings/transport';

export const dynamic='force-dynamic';

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'session');
    return privateJson({
      userId:actor.userId,scopeId:actor.scopeId,name:actor.name,role:actor.role,
      revision:actor.revision,policyRevision:actor.policyRevision,
      paths:allowedStaffPaths(actor),
    });
  } catch (error) {
    return earningsErrorResponse(error);
  }
}
