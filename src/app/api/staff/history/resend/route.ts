import { requireStaffActor } from '@/lib/server/staff/actor';
import { resendStaffHistoryRoute } from '@/lib/server/staff/history-commands';
import { staffSourceDb } from '@/lib/server/staff/source';
import { publishStaffDriverPush } from '@/lib/server/staff/push-delivery';
import { nativeStaffPushSender } from '@/lib/server/staff/push-runtime';
import { historyResendSchema } from '@/lib/staff/history-contract';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

export async function POST(request:Request) {
  try {
    const actor=await requireStaffActor(request,'route:resend');
    const input=historyResendSchema.safeParse(await readJsonBody(request,1200));
    if (!input.success) throw new EarningsError(422,'staff_invalid_command');
    const db=staffSourceDb(actor);
    return privateJson(await resendStaffHistoryRoute(db,actor,input.data,async ({routeId,driverId})=>{
      const title='Rota reenviada';
      const body='Uma rota foi reenviada para você. Acesse o app para visualizá-la.';
      const {delivery}=await publishStaffDriverPush(db,{
        driverId,
        build:token=>({token,data:{routeId,type:'route_resent',title,body,notificationTitle:title,notificationBody:body},
          android:{priority:'high'},webpush:{notification:{title,body,icon:'/icons/pwa-192.png',badge:'/icons/pwa-192.png',
            requireInteraction:true,tag:'resent_'+routeId},fcmOptions:{link:'/my-routes/'+routeId}}}),
        stillCurrent:async()=>{
          const route=await db.collection('routes').doc(routeId).get();
          return route.get('staffHistoryResendId')===input.data.commandId && route.get('driverId')===driverId &&
            ['dispatched','in_progress'].includes(route.get('status'));
        },
      },nativeStaffPushSender);
      return delivery;
    }));
  } catch(error) {return earningsErrorResponse(error);}
}
