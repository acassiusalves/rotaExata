import {db,functions} from '@/lib/firebase/client';
import {collection,query,where,getDocs,addDoc,serverTimestamp,onSnapshot,orderBy,updateDoc,deleteDoc,doc} from 'firebase/firestore';
import {httpsCallable} from 'firebase/functions';
import {serializeReportDate} from '@/lib/reporting/report-contract';
import type {StaffNotification,StaffNotificationCreate,StaffNotificationDriver} from '@/lib/staff/notification-contract';

export function watchLegacyNotifications(onData:(rows:StaffNotification[])=>void,onError:()=>void) {
  return onSnapshot(query(collection(db,'notifications'),orderBy('timestamp','desc')),snapshot=>{
    onData(snapshot.docs.map(doc=>{
      const data=doc.data();
      return {...data,id:doc.id,kind:'inbox',canChange:true,revision:'',
        type:data.type ?? 'system',title:data.title ?? 'Notificação',message:data.message ?? '',
        priority:data.priority ?? 'medium',read:data.read===true,opened:data.opened===true,
        timestamp:serializeReportDate(data.timestamp),openedAt:serializeReportDate(data.openedAt),
      };
    }));
  },onError);
}

export async function legacyNotificationDrivers() {
  const snapshot=await getDocs(query(collection(db,'users'),where('role','==','driver')));
  return snapshot.docs.map(doc=>{
    const data=doc.data();
    return {id:doc.id,displayName:data.displayName || data.email || 'Sem nome',email:data.email || ''};
  });
}

export async function createLegacyNotifications(input:Omit<StaffNotificationCreate,'commandId'>,drivers:StaffNotificationDriver[]) {
  const {title,message,type,priority,driverIds,push}=input;
  for (const driverId of driverIds) {
    const driver=drivers.find(item=>item.id===driverId);
    await addDoc(collection(db,'notifications'),{
      title,message,type,priority,driverId,driverName:driver?.displayName || driver?.email || 'Motorista',
      read:false,opened:false,openedAt:null,timestamp:serverTimestamp(),createdBy:'admin',
    });
  }
  if (!push) return false;
  try {
    await httpsCallable(functions,'sendCustomNotification')({title,message,driverIds,priority,type});
    return false;
  } catch {
    return true;
  }
}

export async function markLegacyNotifications(ids:string[],read:boolean) {
  await Promise.all(ids.map(id=>updateDoc(doc(db,'notifications',id),{read})));
}
export function deleteLegacyNotification(id:string) {
  return deleteDoc(doc(db,'notifications',id));
}
