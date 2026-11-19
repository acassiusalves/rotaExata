import {privateJson} from '@/lib/server/earnings/store';
import {EarningsError,earningsErrorResponse} from '@/lib/server/earnings/transport';
import {requireStaffActor} from '@/lib/server/staff/actor';
import {listStaffNotificationDrivers} from '@/lib/server/staff/notifications';
import {staffSourceDb} from '@/lib/server/staff/source';
import {nativeStaffEnabled} from '@/lib/staff/mode';

export const runtime='nodejs';

export async function GET(request:Request) {
  try {
    if (!nativeStaffEnabled) throw new EarningsError(404,'staff_unavailable');
    const actor=await requireStaffActor(request,'notification:send');
    const params=new URL(request.url).searchParams;
    const cursor=params.get('cursor') ?? undefined;
    if (cursor!==undefined && (cursor.length>1500 || !cursor || cursor.includes('/'))) {
      throw new EarningsError(422,'staff_invalid_cursor');
    }
    return privateJson(await listStaffNotificationDrivers(staffSourceDb(actor),cursor));
  } catch (error) {return earningsErrorResponse(error);}
}
