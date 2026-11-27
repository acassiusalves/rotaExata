import {getMessaging} from 'firebase-admin/messaging';
import {POST as validatePush} from '@/app/api/driver/push-delivery/route';
import {adminApp} from '@/lib/firebase/admin';
import {privateJson} from '@/lib/server/earnings/store';
import {EarningsError,earningsErrorResponse,readJsonBody} from '@/lib/server/earnings/transport';
import {requireStaffActor} from '@/lib/server/staff/actor';
import {changeStaffNotifications,createStaffNotification,listStaffNotifications} from '@/lib/server/staff/notifications';
import {staffSourceDb} from '@/lib/server/staff/source';
import type {StaffOperation} from '@/lib/staff/access';
import {nativeStaffEnabled} from '@/lib/staff/mode';
import {staffNotificationChangeSchema,staffNotificationCreateSchema,staffNotificationListSchema} from '@/lib/staff/notification-contract';

export const runtime='nodejs';

async function context(request:Request,operation:StaffOperation) {
  if (!nativeStaffEnabled) throw new EarningsError(404,'staff_unavailable');
  const actor=await requireStaffActor(request,operation);
  return {actor,db:staffSourceDb(actor)};
}

export async function GET(request:Request) {
  try {
    const {actor,db}=await context(request,'notifications:list');
    const query=staffNotificationListSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) throw new EarningsError(422,'staff_notification_invalid_filter');
    return privateJson(await listStaffNotifications(db,actor,query.data));
  } catch (error) {return earningsErrorResponse(error);}
}

export async function PATCH(request:Request) {
  try {
    const {actor,db}=await context(request,'notification:change');
    const command=staffNotificationChangeSchema.safeParse(await readJsonBody(request,10_000));
    if (!command.success) throw new EarningsError(422,'staff_notification_invalid_command');
    return privateJson(await changeStaffNotifications(db,actor,command.data));
  } catch (error) {return earningsErrorResponse(error);}
}

export async function POST(request:Request) {
  try {
    const {actor,db}=await context(request,'notification:send');
    const command=staffNotificationCreateSchema.safeParse(await readJsonBody(request,40_000));
    if (!command.success) throw new EarningsError(422,'staff_notification_invalid_command');
    if (command.data.push && process.env.FIRESTORE_EMULATOR_HOST) throw new EarningsError(422,'staff_notification_push_unavailable');
    const result=await createStaffNotification(db,actor,command.data,{
      validateBinding:async(bindingId,proof)=>(await validatePush(new Request('http://localhost/api/driver/push-delivery',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bindingId,proof}),
      }))).ok,
      send:message=>getMessaging(adminApp!).send(message),
    });
    return privateJson(result);
  } catch (error) {return earningsErrorResponse(error);}
}
