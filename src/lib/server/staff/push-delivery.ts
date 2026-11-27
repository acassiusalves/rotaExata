import { createHash } from 'node:crypto';
import type { DocumentData,Firestore } from 'firebase-admin/firestore';
import type { TokenMessage } from 'firebase-admin/messaging';
import { driverPushMessage } from '../../../../functions/src/driver-push';
import { sendPushWithOutcome,type PushOutcome } from '../../../../functions/src/push-outcome';
import type { StaffPushReason } from '../../staff/notification-contract';
import { isSourceDriverAssignable } from '../../dispatch-driver';

export type StaffPushOutcome=PushOutcome|{outcome:'uncertain'};
export type StaffPushSender={validateBinding:(bindingId:string,proof:string)=>Promise<boolean>;
  send:(message:TokenMessage)=>Promise<string>};
type Selection={driverId:string;build:(token:string)=>TokenMessage;stillCurrent:()=>Promise<boolean>};
const knownSendRejections=new Set([
  'messaging/invalid-argument','messaging/invalid-registration-token','messaging/registration-token-not-registered',
  'messaging/mismatched-credential','messaging/invalid-payload','messaging/message-rate-exceeded',
]);

export function activeStaffPushDriver(profile:DocumentData|undefined) {
  return !!profile && profile.active!==false && profile.disabled!==true && !profile.deletedAt && isSourceDriverAssignable(profile);
}
const skip=(reason:StaffPushReason)=>({delivery:{outcome:'skipped_no_token'} as const,reason});

export async function publishStaffDriverPush(db:Firestore,selection:Selection,sender:StaffPushSender):Promise<{
  delivery:StaffPushOutcome;reason?:StaffPushReason;
}> {
  const profile=db.collection('users').doc(selection.driverId);
  const pref=profile.collection('settings').doc('preferences');
  try {
    const [driver,preferences]=await db.getAll(profile,pref);
    const data=driver.data();
    const token=data?.fcmToken;
    if (!activeStaffPushDriver(data)) return skip('recipient_unavailable');
    if (preferences.get('notifications')!==true) return skip('consent_missing');
    if (typeof token!=='string' || !token) return skip('token_missing');
    const owner=db.collection('driverPushTokenBindings').doc(createHash('sha256').update(token).digest('hex'));
    if ((await owner.get()).get('uid')!==selection.driverId) return skip('token_unlinked');
    const message=await driverPushMessage(db,selection.driverId,data,selection.build(token),sender.validateBinding);
    if (!message) return skip('binding_invalid');
    const [fresh,prefs,linked]=await db.getAll(profile,pref,owner);
    if (!activeStaffPushDriver(fresh.data()) || fresh.get('fcmToken')!==token ||
        fresh.get('fcmSessionBindingId')!==data?.fcmSessionBindingId ||
        prefs.get('notifications')!==true || linked.get('uid')!==selection.driverId ||
        !await selection.stillCurrent()) return skip('destination_changed');
    const result=await sendPushWithOutcome(true,()=>sender.send(message));
    return {delivery:result.outcome==='failed' && !knownSendRejections.has(result.errorCode) ? {outcome:'uncertain'}:result};
  } catch {
    return {delivery:{outcome:'failed',errorCode:'staff_notification_unavailable'}};
  }
}
