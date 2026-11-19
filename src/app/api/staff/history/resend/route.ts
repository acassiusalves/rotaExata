import { getMessaging } from 'firebase-admin/messaging';
import { driverPushMessage } from '../../../../../../functions/src/driver-push';
import { sendPushWithOutcome } from '../../../../../../functions/src/push-outcome';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { resendStaffHistoryRoute } from '@/lib/server/staff/history-commands';
import { staffSourceDb } from '@/lib/server/staff/source';
import { historyResendSchema } from '@/lib/staff/history-contract';
import { adminApp } from '@/lib/firebase/admin';
import { POST as validatePush } from '@/app/api/driver/push-delivery/route';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function POST(request:Request) {
  try {
    const actor=await requireStaffActor(request,'route:resend');
    const input=historyResendSchema.safeParse(await readJsonBody(request,1200));
    if (!input.success) throw new EarningsError(422,'staff_invalid_command');
    const db=staffSourceDb(actor);
    return privateJson(await resendStaffHistoryRoute(db,actor,input.data,async ({routeId,driverId,profile})=>{
      const token=profile.fcmToken;
      const app=adminApp;
      if (!app || typeof token!=='string' || !token) return {outcome:'skipped_no_token'};
      const title='Rota reenviada';
      const body='Uma rota foi reenviada para você. Acesse o app para visualizá-la.';
      const message=await driverPushMessage(db,driverId,profile,{
        token,data:{routeId,type:'route_resent',title,body,notificationTitle:title,notificationBody:body},
        android:{priority:'high'},
        webpush:{notification:{title,body,icon:'/icons/pwa-192.png',badge:'/icons/pwa-192.png',requireInteraction:true,tag:'resent_'+routeId},
          fcmOptions:{link:'/my-routes/'+routeId}},
      },async (bindingId,proof)=>{
        const response=await validatePush(new Request('http://localhost/api/driver/push-delivery',{
          method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bindingId,proof}),
        }));
        return response.ok;
      });
      return sendPushWithOutcome(!!message,()=>getMessaging(app).send(message!));
    }));
  } catch(error) {
    return earningsErrorResponse(error);
  }
}
