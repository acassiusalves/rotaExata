const applications=['[DEFAULT]','impersonation-app'];
const authKeys=['authUser','redirectUser','pendingRedirect','persistence','authEvent'];

function legacyFirebaseKeys(apiKey:string) {
  return applications.flatMap(app=>authKeys.map(key=>['firebase',key,apiKey,app].join(':')));
}

export function clearLegacyRotaWebStorage(storage:Pick<Storage,'removeItem'>,apiKey:string) {
  for (const key of legacyFirebaseKeys(apiKey)) storage.removeItem(key);
}

export function clearLegacyRotaIndexedDb(indexedDb:IDBFactory,apiKey:string) {
  return new Promise<void>((resolve,reject)=>{
    const opening=indexedDb.open('firebaseLocalStorageDb');
    opening.onupgradeneeded=()=>opening.transaction?.abort();
    opening.onerror=()=>opening.error?.name==='AbortError' ? resolve():reject(opening.error);
    opening.onsuccess=()=>{
      const db=opening.result;
      const storeName='firebaseLocalStorage';
      if (!db.objectStoreNames.contains(storeName)) {db.close();resolve();return;}
      const transaction=db.transaction(storeName,'readwrite');
      const store=transaction.objectStore(storeName);
      for (const key of legacyFirebaseKeys(apiKey)) store.delete(key);
      transaction.oncomplete=()=>{db.close();resolve();};
      transaction.onabort=()=>{db.close();reject(transaction.error);};
    };
  });
}
