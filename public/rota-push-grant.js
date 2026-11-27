function readRotaPushGrant() {
  return new Promise((resolve,reject) => {
    const open=indexedDB.open('rota-push',1);
    open.onupgradeneeded=()=>open.result.createObjectStore('device');
    open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{
      const db=open.result;
      const transaction=db.transaction('device','readonly');
      const request=transaction.objectStore('device').get('grant');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      transaction.oncomplete=()=>db.close();
      transaction.onabort=()=>db.close();
    };
  });
}

async function flushRotaPushRevocations() {
  const open=indexedDB.open('rota-push',1);
  open.onupgradeneeded=()=>open.result.createObjectStore('device');
  const db=await new Promise((resolve,reject)=>{
    open.onsuccess=()=>resolve(open.result);open.onerror=()=>reject(open.error);
  });
  const read=request=>new Promise((resolve,reject)=>{
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try {
    const store=db.transaction('device','readonly').objectStore('device');
    const keys=await read(store.getAllKeys());
    const pending=await Promise.all(keys.filter(key=>typeof key==='string' && key.startsWith('revoke:'))
      .map(async key=>[key,await read(store.get(key))]));
    for (const [key,grant] of pending) {
      if (!grant) continue;
      try {
        const response=await fetch('/api/driver/push-delivery',{method:'POST',
          headers:{'Content-Type':'application/json'},cache:'no-store',redirect:'error',
          body:JSON.stringify({bindingId:grant.id,proof:grant.proof,revoke:true}),
        });
        if (response.ok || response.status===404) await read(db.transaction('device','readwrite').objectStore('device').delete(key));
      } catch { /* Retry on next foreground resume or push. */ }
    }
  } finally {db.close();}
}
