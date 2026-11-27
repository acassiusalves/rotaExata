export const nativeStorageKey='rotaexata-platform-auth';
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

export function localSessionId(token:string|undefined) {
  if (!token || token.length>16384) return undefined;
  try {
    const raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const payload=JSON.parse(atob(raw));
    return /^[0-9a-f-]{36}$/i.test(payload.session_id ?? '') ? payload.session_id as string:undefined;
  } catch {return undefined;}
}

export function logoutMarker(id:string) {return nativeStorageKey+'-logout-'+id;}
export function locallyRetired(store:Store,token:string|undefined) {
  const id=localSessionId(token);
  return !!id && store.getItem(logoutMarker(id))!==null;
}

export function retireStoredSession(store:Store,token:string|undefined) {
  const id=localSessionId(token);
  if (id) store.setItem(logoutMarker(id),'1');
  const stored=store.getItem(nativeStorageKey);
  if (!stored || !id || localSessionId(JSON.parse(stored).access_token)===id) {
    store.removeItem(nativeStorageKey);
    store.removeItem(nativeStorageKey+'-code-verifier');
  }
}

export function nativeAuthStorage(store:Store) {
  const rejected=(value:string|null)=>{
    if (!value) return false;
    try {return locallyRetired(store,JSON.parse(value).access_token);}
    catch {return true;}
  };
  return {
    getItem(key:string) {
      const value=store.getItem(key);
      return key===nativeStorageKey && rejected(value) ? null:value;
    },
    setItem(key:string,value:string) {
      if (key!==nativeStorageKey || !rejected(value)) store.setItem(key,value);
    },
    removeItem(key:string) {store.removeItem(key);},
  };
}

export function reusableAssurance(
  approval:{sessionId?:string;userId:string;factors:unknown[]}|undefined,sessionId:string|undefined,userId:string|undefined,
) {
  return !!sessionId && !!approval && approval.sessionId===sessionId && approval.userId===userId && approval.factors.length===0;
}
