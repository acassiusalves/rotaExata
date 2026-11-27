'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { clearLegacyRotaIndexedDb,clearLegacyRotaWebStorage } from '@/lib/staff/legacy-browser-session';
import { claimStaffWorkspace,receiveWorkspaceOwnerChange,staffWorkspaceOwnerKey } from '@/lib/staff/workspace';
import { clearDevicePushGrant } from '@/lib/driver/push-device';
import { earningsBrowserClient,signOutNativeLocally } from '@/lib/earnings/client';
import { requiredEarningsFactors,type EarningsFactor } from '@/lib/earnings/mfa';
import { EarningsRequestError,nativeSessionRequest } from '@/lib/earnings/session-request';
import { localSessionId,locallyRetired,logoutMarker,reusableAssurance } from '@/lib/earnings/session-storage';

type SessionState = {
  client:SupabaseClient|undefined;
  session:Session|null;
  sessionId:string|undefined;
  loading:boolean;
  ready:boolean;
  failed:boolean;
  factors:EarningsFactor[];
  exitError:boolean;
  leave:()=>Promise<void>;
  reauthenticate:()=>Promise<void>;
  request:<T>(path:string,init?:RequestInit)=>Promise<T>;
};

const Context=createContext<SessionState|null>(null);
export function useNativeSession() { return useContext(Context); }

export function NativeSessionProvider({children,enabled=true}:{children:ReactNode;enabled?:boolean}) {
  const [client,setClient]=useState<SupabaseClient>();
  const [session,setSession]=useState<Session|null>(null);
  const [loading,setLoading]=useState(true);
  const [assurance,setAssurance]=useState<{token:string;sessionId?:string;userId:string;factors:EarningsFactor[]}>();
  const [failedToken,setFailedToken]=useState<string>();
  const [exitError,setExitError]=useState(false);
  const token=session?.access_token;
  const userId=session?.user.id;
  const sessionId=localSessionId(token);
  const currentSession=useRef<Session|null>(null);
  const lifetime=useRef<AbortController|null>(null);
  const retiring=useRef(false);
  const approved=useRef(assurance);

  useEffect(()=>{
    if (!client || !token || !userId) return;
    let current=true;
    requiredEarningsFactors(client.auth.mfa).then(factors=>{
      if (current) {
        const approval={token,sessionId,userId,factors};
        approved.current=approval;
        setAssurance(approval);
        setFailedToken(undefined);
      }
    }).catch(()=>{if (current) setFailedToken(token);});
    return ()=>{current=false;};
  },[client,sessionId,token,userId]);

  const acceptSession=useCallback((next:Session|null)=>{
    const previous=currentSession.current;
    const previousId=localSessionId(previous?.access_token);
    const nextId=localSessionId(next?.access_token);
    if (!lifetime.current || previousId!==nextId || previous?.user.id!==next?.user.id) {
      lifetime.current?.abort();
      if (nativeStaffEnabled && next) claimStaffWorkspace(window.localStorage,window.sessionStorage,next.user.id);
      lifetime.current=new AbortController();
      approved.current=undefined;
      setAssurance(undefined);
      retiring.current=false;
    }
    if (previousId && previousId!==nextId) void clearDevicePushGrant(previousId).catch(()=>{});
    currentSession.current=next;
    setSession(next);
  },[]);

  useEffect(()=>{
    const priorApiKey=process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (nativeStaffEnabled && priorApiKey) {
      for (const storage of [window.localStorage,window.sessionStorage]) clearLegacyRotaWebStorage(storage,priorApiKey);
      if (window.indexedDB) void clearLegacyRotaIndexedDb(window.indexedDB,priorApiKey).catch(()=>{});
    }
    const browser=enabled ? earningsBrowserClient() : undefined;
    if (!browser) {setLoading(false);return;}
    setClient(browser);
    const {data}=browser.auth.onAuthStateChange((_event,next)=>{
      acceptSession(next && !locallyRetired(window.localStorage,next.access_token) ? next : null);
      setLoading(false);
    });
    const retire=(event:StorageEvent)=>{
      if (nativeStaffEnabled && event.key===staffWorkspaceOwnerKey) {
        receiveWorkspaceOwnerChange(window.sessionStorage,event.oldValue,event.newValue);
      }
      const current=localSessionId(currentSession.current?.access_token);
      if (current && event.key===logoutMarker(current)) acceptSession(null);
    };
    window.addEventListener('storage',retire);
    return ()=>{
      data.subscription.unsubscribe();
      lifetime.current?.abort();
      lifetime.current=null;
      currentSession.current=null;
      window.removeEventListener('storage',retire);
    };
  },[acceptSession,enabled]);

  const end=useCallback(async(keepWorkspace:boolean)=>{
    if (!client) return;
    const previous=currentSession.current;
    if (nativeStaffEnabled && !keepWorkspace) claimStaffWorkspace(window.localStorage,window.sessionStorage,null);
    retiring.current=true;
    lifetime.current?.abort();
    try {
      await signOutNativeLocally(client,previous?.access_token);
      if (localSessionId(currentSession.current?.access_token)===localSessionId(previous?.access_token)) acceptSession(null);
      setExitError(false);
    } catch {
      setExitError(true);
    }
  },[acceptSession,client]);

  const leave=useCallback(()=>end(false),[end]);
  const reauthenticate=useCallback(()=>end(true),[end]);

  const request=useCallback(<T,>(path:string,init?:RequestInit):Promise<T>=>{
    const activeLifetime=lifetime.current;
    if (!activeLifetime) return Promise.reject(new EarningsRequestError(401,'earnings_unauthorized'));
    function matches(active:Session|null|undefined) {
      return !!sessionId && !!active && active.user.id===userId && localSessionId(active.access_token)===sessionId &&
        !locallyRetired(window.localStorage,active.access_token);
    }
    return nativeSessionRequest<T>(path,init,{
      token:async()=>{
        const active=(await client?.auth.getSession())?.data.session;
        return matches(active) ? active?.access_token : undefined;
      },
      isCurrent:()=>!retiring.current && activeLifetime===lifetime.current && matches(currentSession.current),
      authorizeWrite:currentToken=>approved.current?.token===currentToken && approved.current.factors.length===0,
      sessionSignal:activeLifetime.signal,
    });
  },[client,sessionId,userId]);

  return <Context.Provider value={{
    client,session,sessionId,loading,ready:reusableAssurance(assurance,sessionId,userId),
    failed:!!token && failedToken===token,factors:assurance?.token===token ? assurance?.factors ?? [] : [],
    exitError,leave,reauthenticate,request,
  }}>{children}</Context.Provider>;
}
