import { FieldValue,type Firestore } from 'firebase-admin/firestore';
import { persistPushOutcome } from '../../../../functions/src/push-outcome';
import { publishStaffDriverPush,type StaffPushOutcome,type StaffPushSender } from './push-delivery';
import { EarningsError } from '../earnings/transport';

export async function dispatchStaffRouteNotice(db:Firestore,noticeId:string,sender:StaffPushSender):Promise<StaffPushOutcome> {
  const job=db.collection('rotaStaffRouteNotices').doc(noticeId);
  const claim=await db.runTransaction(async tx=>{
    const source=await tx.get(job);
    const data=source.data();
    if (!data) throw new EarningsError(404,'staff_notice_not_found');
    if (data.outcome) return {existing:true,outcome:data.outcome as StaffPushOutcome} as const;
    if (data.state==='dispatching') return {existing:true,outcome:{outcome:'uncertain'} as StaffPushOutcome} as const;

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
  const {delivery:outcome}=await publishStaffDriverPush(db,{
    driverId:claim.driverId,
    build:token=>{
      const title='Alterações na rota';
      const body='Sua rota foi atualizada. Confira as mudanças.';
      return {token,data:{routeId:claim.routeId,type:'route_change',changeCount:String(claim.changeCount),title,body},
        android:{priority:'high'},webpush:{notification:{title,body,tag:claim.routeId}}};
    },
    stillCurrent:async()=>{
      const [route,notice]=await db.getAll(routeRef,noticeRef);
      return route.get('driverId')===claim.driverId && ['dispatched','in_progress'].includes(route.get('status')) &&
        notice.get('staffNoticeId')===noticeId && notice.get('acknowledged')!==true;
    },
  },sender);
  try {await job.update({state:'settled',outcome,settledAt:FieldValue.serverTimestamp()});}
  catch {return {outcome:'uncertain'};}

  const current=await noticeRef.get();
  if (current.exists && current.get('staffNoticeId')===noticeId) {
    await persistPushOutcome(()=>noticeRef.update({push:outcome},{lastUpdateTime:current.updateTime!}));
  }
  return outcome;
}
