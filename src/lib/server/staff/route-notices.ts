import { FieldValue,type Firestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { driverPushMessage } from '../../../../functions/src/driver-push';
import { sendPushWithOutcome,persistPushOutcome,type PushOutcome } from '../../../../functions/src/push-outcome';
import { adminApp } from '../../firebase/admin';
import { POST as validatePush } from '../../../app/api/driver/push-delivery/route';
import { EarningsError } from '../earnings/transport';

async function checkBinding(bindingId:string,proof:string) {
  const response=await validatePush(new Request('http://localhost/api/driver/push-delivery',{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bindingId,proof}),
  }));
  return response.ok;
}

export async function dispatchStaffRouteNotice(db:Firestore,noticeId:string):Promise<PushOutcome> {
  const job=db.collection('rotaStaffRouteNotices').doc(noticeId);
  const claim=await db.runTransaction(async tx=>{
    const source=await tx.get(job);
    const data=source.data();
    if (!data) throw new EarningsError(404,'staff_notice_not_found');
    if (data.outcome) return {existing:true,outcome:data.outcome as PushOutcome} as const;
    if (data.state==='dispatching') return {existing:true,outcome:{outcome:'failed',errorCode:'staff_notice_dispatch_uncertain'} as PushOutcome} as const;

    const routeRef=db.collection('routes').doc(data.routeId);
    const noticeRef=db.collection('routeChangeNotifications').doc(data.routeId);
    const [route,notice]=await tx.getAll(routeRef,noticeRef);
    if (!route.exists || route.get('driverId')!==data.driverId ||
        notice.get('staffNoticeId')!==noticeId || notice.get('acknowledged')===true) {
      const outcome={outcome:'skipped_no_token'} as const;
      tx.update(job,{state:'settled',outcome,settledAt:FieldValue.serverTimestamp()});
      return {existing:true,outcome} as const;
    }
    tx.update(job,{state:'dispatching',startedAt:FieldValue.serverTimestamp()});
    return {existing:false,routeId:data.routeId as string,driverId:data.driverId as string,changeCount:data.changeCount as number} as const;
  });
  if (claim.existing) return claim.outcome;

  const routeRef=db.collection('routes').doc(claim.routeId);
  const noticeRef=db.collection('routeChangeNotifications').doc(claim.routeId);
  const driverRef=db.collection('users').doc(claim.driverId);
  let outcome:PushOutcome={outcome:'skipped_no_token'};
  try {
    const [route,notice,driver]=await db.getAll(routeRef,noticeRef,driverRef);
    const profile=driver.data();
    const token=profile?.fcmToken;
    if (adminApp && typeof token==='string' && token && route.get('driverId')===claim.driverId &&
      notice.get('staffNoticeId')===noticeId && notice.get('acknowledged')!==true) {
      const title='Alterações na rota';
      const body='Sua rota foi atualizada. Confira as mudanças.';
      const deliverable=await driverPushMessage(db,claim.driverId,profile,{
        token,data:{routeId:claim.routeId,type:'route_change',changeCount:String(claim.changeCount),title,body},
        android:{priority:'high'},webpush:{notification:{title,body,tag:claim.routeId}},
      },checkBinding);
      outcome=await sendPushWithOutcome(!!deliverable,()=>getMessaging(adminApp!).send(deliverable!));
    }
  } catch {
    outcome={outcome:'failed',errorCode:'staff_notice_unavailable'};
  }

  await job.update({state:'settled',outcome,settledAt:FieldValue.serverTimestamp()});
  const current=await noticeRef.get();
  if (current.exists && current.get('staffNoticeId')===noticeId) {
    await persistPushOutcome(()=>noticeRef.update({push:outcome},{lastUpdateTime:current.updateTime!}));
  }
  return outcome;
}
