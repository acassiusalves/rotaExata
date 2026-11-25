'use client';
import Link from 'next/link';

import { createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import { usePathname,useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EarningsRequestError,EarningsShell,useEarnings } from '@/components/earnings/earnings-shell';
import { profileFailure } from '@/lib/driver/profile-failure';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { ASSIST_HEADER } from '@/lib/driver/assist-policy';
import { clearAssistGrant,readAssistGrant } from '@/lib/driver/assist-session';
import { useAuth } from '@/hooks/auth-context';
import { takeDriverPushToken,releaseDriverPushTransport } from '@/lib/driver/push-transport';
import { driverCommand } from '@/lib/driver/runtime-client';
import type { DriverOverview } from '@/lib/driver/runtime-contract';
import { DriverPasswordForm } from './driver-password-form';
import { isImpersonationSessionActive } from '@/lib/impersonation-session';

type RequestData = <T>(path:string, init?:RequestInit)=>Promise<T>;
type AssistInfo = { driverName:string; staffName:string; expiresAt:string };
type Runtime = {
  request:RequestData; endpoint:string; profile:DriverOverview; readOnly:boolean;
  native:boolean; userId:string; signOut:()=>Promise<void>; assist:AssistInfo|null;
};
type ProfileState = {profile:DriverOverview;forceLogoutAt?:string|null;readOnly:boolean;assist?:AssistInfo};
const Context=createContext<Runtime|null>(null);

export function useDriverRuntime() {
  const driver=useContext(Context);
  if (!driver) throw new Error('Sessão do motorista indisponível');
  return driver;
}

export function useOptionalDriverRuntime() { return useContext(Context); }

function RuntimeProfile({request,userId,email,signOut,native,assistGrant,children}:{
  request:RequestData;userId:string;email?:string;signOut:()=>Promise<void>;native:boolean;assistGrant?:string;children:ReactNode;
}) {
  const endpoint=assistGrant?'/api/staff/driver-assist':native?'/api/driver/runtime':'/api/driver/legacy-runtime';
  // No modo operador toda requisição leva o acesso; o servidor confere a cada chamada.
  const send=useCallback(<T,>(path:string,init?:RequestInit)=>{
    if (!assistGrant) return request<T>(path,init);
    const headers=new Headers(init?.headers);
    headers.set(ASSIST_HEADER,assistGrant);
    return request<T>(path,{...init,headers});
  },[request,assistGrant]);
  const [state,setState]=useState<ProfileState>();
  const [error,setError]=useState('');
  const [passwordRequired,setPasswordRequired]=useState(false);
  const [revision,setRevision]=useState(0);
  const [stale,setStale]=useState(false);
  const [canRetry,setCanRetry]=useState(true);
  const valid=useRef(false);
  const guardRequest=useCallback(<T,>(path:string,init?:RequestInit)=>{
    if (init?.method && init.method.toUpperCase()!=='GET' && !valid.current) {
      return Promise.reject(new EarningsRequestError(409,'earnings_session_revalidating'));
    }
    return send<T>(path,init);
  },[send]);
  const writePresence=useCallback((online:boolean)=>send(endpoint,{method:'POST',body:JSON.stringify({kind:'presence',online})}),[send,endpoint]);

  useEffect(()=>{
    let alive=true;
    let initial:string|null|undefined;
    async function refresh() {
      try {
        const current=await send<ProfileState>(endpoint+'?resource=profile');
        if (!alive) return;
        if (!assistGrant && initial!==undefined && current.forceLogoutAt && current.forceLogoutAt!==initial) {
          await signOut(); return;
        }
        initial=current.forceLogoutAt ?? null;
        valid.current=true;setStale(false);
        setState(current);setError('');setPasswordRequired(false);setCanRetry(true);
        if (native && !current.readOnly && !assistGrant) void writePresence(true).catch(()=>{});
      } catch (failure) {
        if (alive) {
          valid.current=false;
          const outcome=profileFailure(failure,{native,assist:!!assistGrant});
          if (outcome.kind==='stale') {
            setStale(true);
            return;
          }
          setPasswordRequired(outcome.passwordRequired);
          setError(outcome.message);
          setCanRetry(outcome.retry);
          if (outcome.signOut) void signOut();
          setState(undefined);
        }
      }
    }
    const visible=()=>{if (document.visibilityState==='visible') void refresh();};
    void refresh();
    const timer=setInterval(visible,30000);
    window.addEventListener('online',visible);
    document.addEventListener('visibilitychange',visible);
    return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);};
  },[send,endpoint,revision,native,signOut,writePresence,assistGrant]);

  const out=useCallback(async ()=>{
    if (assistGrant) {
      await send(endpoint,{method:'DELETE'}).catch(()=>{});
      clearAssistGrant();
      window.close();
      // Aba que o navegador não deixa fechar volta para o painel.
      window.location.replace('/drivers');
      return;
    }
    if (native) {
      if (valid.current) void writePresence(false).catch(()=>{});
      await signOut();
      return;
    }
    if (!state?.readOnly) {
      const token=takeDriverPushToken(userId);
      if (token) {
        await driverCommand(request,endpoint,{kind:'push-detach',token}).catch(()=>{});
        await releaseDriverPushTransport().catch(()=>{});
      }
    }
    await signOut();
  },[native,state?.readOnly,signOut,writePresence,request,endpoint,userId,assistGrant,send]);

  const value=useMemo(()=>state ? {request:guardRequest,endpoint,userId,native,signOut:out,readOnly:state.readOnly,
    assist:assistGrant ? state.assist ?? null:null,
    profile:{...state.profile,email:assistGrant ? state.profile.email:email ?? state.profile.email},
  }:null,[state,guardRequest,endpoint,userId,native,out,email,assistGrant]);

  if (passwordRequired) return <main className="px-4 py-6"><DriverPasswordForm onUpdated={()=>setPasswordRequired(false)} /></main>;
  if (error) return <div className="mx-auto max-w-sm space-y-3 p-6" role="alert"><p>{error}</p>
    {canRetry && <Button variant="outline" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</Button>}
    {native && !assistGrant && <Button asChild variant="link"><Link href="/driver/conta?primeiro=1">Retomar primeiro acesso</Link></Button>}
    <Button variant="ghost" onClick={()=>void out()}>Sair</Button></div>;
  if (!value && stale) return <div className="space-y-3 p-6" role="status"><p>O acesso está sendo verificado.</p>
    <Button variant="outline" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</Button></div>;
  if (!value) return <div className="grid min-h-60 place-items-center" role="status"><Loader2 className="animate-spin" aria-label="Carregando perfil" /></div>;
  return <Context.Provider value={value}>
    {stale && <p className="p-3 text-sm text-muted-foreground" role="status">Verificando sessão. Aguarde para salvar alterações.</p>}
    {children}
  </Context.Provider>;
}

function NativeRuntime({children}:{children:ReactNode}) {
  const {request,userId,signOut,email}=useEarnings();
  return <RuntimeProfile key={userId} request={request} userId={userId} signOut={signOut} email={email} native>{children}</RuntimeProfile>;
}

function AssistRuntime({grant,children}:{grant:string;children:ReactNode}) {
  const {request,userId,signOut}=useEarnings();
  return <RuntimeProfile key={'assist-'+grant} request={request} userId={userId} signOut={signOut} native assistGrant={grant}>{children}</RuntimeProfile>;
}

function LegacyRuntime({children}:{children:ReactNode}) {
  const {user,userRole,loading,mustChangePassword,signOut}=useAuth();
  const router=useRouter();
  const pathname=usePathname();
  useEffect(()=>{
    if (!loading && mustChangePassword) router.replace('/auth/change-password');
    else if (!loading && !user) router.replace('/login?next='+encodeURIComponent(pathname));
  },[loading,mustChangePassword,router,user,pathname]);
  const request=useCallback(async <T,>(path:string,init?:RequestInit)=>{
    if (!user) throw new EarningsRequestError(401,'route_unauthorized');
    if (isImpersonationSessionActive() && init?.method && init.method!=='GET') throw new EarningsRequestError(403,'route_access_denied');
    const headers=new Headers(init?.headers);
    headers.set('Authorization','Bearer '+await user.getIdToken());
    if (init?.body) headers.set('Content-Type','application/json');
    const response=await fetch(path,{...init,headers,cache:'no-store'});
    const body=await response.json().catch(()=>null);
    if (!response.ok || body===null) throw new EarningsRequestError(response.status,body?.code ?? body?.error);
    return body as T;
  },[user]);
  if (loading || mustChangePassword || !user) return <div className="grid min-h-60 place-items-center"><Loader2 className="animate-spin" /></div>;
  if (userRole!=='driver') return <div className="mx-auto max-w-sm p-6">Abra esta tela com a conta do motorista.</div>;
  return <RuntimeProfile key={user.uid} request={request} userId={user.uid} email={user.email ?? undefined} signOut={signOut} native={false}>{children}</RuntimeProfile>;
}

export function DriverRuntimeProvider({children}:{children:ReactNode}) {
  // undefined = ainda não leu o sessionStorage (só existe no navegador).
  const [grant,setGrant]=useState<string|null|undefined>(undefined);
  useEffect(()=>{setGrant(nativeStaffEnabled ? readAssistGrant():null);},[]);
  if (grant===undefined) return <div className="grid min-h-60 place-items-center" role="status"><Loader2 className="animate-spin" aria-label="Carregando" /></div>;
  if (grant) return <EarningsShell driver portal staffLogin><AssistRuntime grant={grant}>{children}</AssistRuntime></EarningsShell>;
  return nativeDriverEnabled ? <EarningsShell driver portal><NativeRuntime>{children}</NativeRuntime></EarningsShell> :
    <LegacyRuntime>{children}</LegacyRuntime>;
}
