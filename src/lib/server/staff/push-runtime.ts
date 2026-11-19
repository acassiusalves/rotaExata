import { getMessaging } from 'firebase-admin/messaging';
import { adminApp } from '../../firebase/admin';
import { POST as validatePush } from '../../../app/api/driver/push-delivery/route';
import type { StaffPushSender } from './push-delivery';

export const nativeStaffPushSender:StaffPushSender={
  send:message=>{
    if (!adminApp) return Promise.reject({code:'messaging/invalid-argument'});
    return getMessaging(adminApp).send(message);
  },
  validateBinding:async(bindingId,proof)=>{
    const response=await validatePush(new Request('http://localhost/api/driver/push-delivery',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bindingId,proof}),
    }));
    return response.ok;
  },
};
