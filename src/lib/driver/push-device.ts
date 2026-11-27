'use client';

import {localSessionId,nativeAuthStorage,nativeStorageKey} from '@/lib/earnings/session-storage';

export type DriverDeviceGrant={id:string;proof:string;userId:string;sessionId:string};

function result<T>(request:IDBRequest<T>) {
  return new Promise<T>((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function device<T>(mode:IDBTransactionMode,work:(store:IDBObjectStore)=>Promise<T>) {
  const open=indexedDB.open('rota-push',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('device');
  const db=await result(open);
  const transaction=db.transaction('device',mode);
  const complete=new Promise<void>((resolve,reject)=>{
    transaction.oncomplete=()=>resolve();
    transaction.onabort=()=>reject(transaction.error);
    transaction.onerror=()=>reject(transaction.error);
  });
  try {
    const [value]=await Promise.all([work(transaction.objectStore('device')),complete]);
    return value;
  } finally {db.close();}
}

function currentSession() {
  const stored=nativeAuthStorage(window.localStorage).getItem(nativeStorageKey);
  return stored ? localSessionId(JSON.parse(stored).access_token):undefined;
}

export async function persistDevicePushGrant(grant:DriverDeviceGrant) {
  if (currentSession()!==grant.sessionId) return false;
  return device('readwrite',async store=>{
    const old=await result(store.get('grant')) as DriverDeviceGrant|undefined;
    if (await result(store.get('retired:'+grant.sessionId)) || currentSession()!==grant.sessionId) return false;
    if (old && old.id!==grant.id) store.put(old,'revoke:'+old.id);
    store.put(grant,'grant');
    return true;
  });
}

export async function clearDevicePushGrant(sessionId?:string,retire=true) {
  if (typeof indexedDB==='undefined') return;
  await device('readwrite',async store=>{
    const current=await result(store.get('grant')) as DriverDeviceGrant|undefined;
    if (sessionId && retire) store.put(true,'retired:'+sessionId);
    if (current && (!sessionId || current.sessionId===sessionId)) {
      store.put(current,'revoke:'+current.id);
      store.delete('grant');
    }
  });
  if (typeof navigator!=='undefined' && 'serviceWorker' in navigator) {
    // The record is durable even if there is no worker or network.
    void navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope')
      .then(async registration=>{
        if (!registration) return;
        registration.active?.postMessage({type:'rota-flush-push'});
        for (const notice of await registration.getNotifications()) {
          if (notice.tag?.startsWith('rota-bound:')) notice.close();
        }
      }).catch(()=>{});
  }
}

export async function verifiedDevicePush(data:Record<string,string>) {
  try {
    const grant=await device('readonly',store=>result(store.get('grant'))) as DriverDeviceGrant|undefined;
    if (!grant || data.boundPush!=='1' || grant.id!==data.bindingId || currentSession()!==grant.sessionId) return false;
    const response=await fetch('/api/driver/push-delivery',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({bindingId:grant.id,proof:grant.proof,deliveryId:data.deliveryId}),cache:'no-store',redirect:'error'});
    const current=await device('readonly',store=>result(store.get('grant'))) as DriverDeviceGrant|undefined;
    return response.ok && current?.id===grant.id && currentSession()===grant.sessionId;
  } catch {return false;}
}
