'use client';
import Link from 'next/link';

import { createContext,useCallback,useContext,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import { usePathname,useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EarningsRequestError,EarningsShell,useEarnings } from '@/components/earnings/earnings-shell';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import { useAuth } from '@/hooks/auth-context';
import { takeDriverPushToken,releaseDriverPushTransport } from '@/lib/driver/push-transport';
import { driverCommand } from '@/lib/driver/runtime-client';
import type { DriverOverview } from '@/lib/driver/runtime-contract';
import { DriverPasswordForm } from './driver-password-form';
import { isImpersonationSessionActive } from '@/lib/impersonation-session';

type RequestData = <T>(path:string, init?:RequestInit)=>Promise<T>;
type Runtime = {
  request:RequestData; endpoint:string; profile:DriverOverview; readOnly:boolean;
  native:boolean; userId:string; signOut:()=>Promise<void>;
};
const Context=createContext<Runtime|null>(null);

export function useDriverRuntime() {
  const driver=useContext(Context);
  if (!driver) throw new Error('Sessão do motorista indisponível');
  return driver;
}

export function useOptionalDriverRuntime() { return useContext(Context); }

function RuntimeProfile({request,userId,email,signOut,native,children}:{
  request:RequestData;userId:string;email?:string;signOut:()=>Promise<void>;native:boolean;children:ReactNode;
}) {
  const endpoint=native?'/api/driver/runtime':'/api/driver/legacy-runtime';
  const [state,setState]=useState<{profile:DriverOverview;forceLogoutAt?:string|null;readOnly:boolean}>();
  const [error,setError]=useState('');
  const [passwordRequired,setPasswordRequired]=useState(false);
  const [revision,setRevision]=useState(0);
  const [stale,setStale]=useState(false);
  const valid=useRef(false);
  const guardRequest=useCallback(<T,>(path:string,init?:RequestInit)=>{
    if (init?.method && init.method.toUpperCase()!=='GET' && !valid.current) {
      return Promise.reject(new EarningsRequestError(409,'earnings_session_revalidating'));
    }
    return request<T>(path,init);
  },[request]);
  const writePresence=useCallback((online:boolean)=>request(endpoint,{method:'POST',body:JSON.stringify({kind:'presence',online})}),[request,endpoint]);

  useEffect(()=>{
    let alive=true;
    let initial:string|null|undefined;
    async function refresh() {
      try {
        const current=await request<{profile:DriverOverview;forceLogoutAt?:string|null;readOnly:boolean}>(endpoint+'?resource=profile');
        if (!alive) return;
        if (initial!==undefined && current.forceLogoutAt && current.forceLogoutAt!==initial) {
          await signOut(); return;
        }
        initial=current.forceLogoutAt ?? null;
        valid.current=true;setStale(false);
        setState(current);setError('');setPasswordRequired(false);
        if (native && !current.readOnly) void writePresence(true).catch(()=>{});
      } catch (failure) {
        if (alive) {
          valid.current=false;
          if (!(failure instanceof EarningsRequestError) || (failure.status!==401 && failure.status!==403)) {
            setStale(true);
            return;
          }
          setPasswordRequired(native && failure instanceof EarningsRequestError && failure.code==='platform_password_change_required');
          setError(failure instanceof EarningsRequestError && failure.status===403 ? 'Esta conta não tem acesso às rotas.' : 'Não foi possível carregar sua conta.');
          if (failure instanceof EarningsRequestError && failure.status===401) void signOut();
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
  },[request,endpoint,revision,native,signOut,writePresence]);

  const out=useCallback(async ()=>{
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
  },[native,state?.readOnly,signOut,writePresence,request,endpoint,userId]);

  const value=useMemo(()=>state ? {request:guardRequest,endpoint,userId,native,signOut:out,readOnly:state.readOnly,
    profile:{...state.profile,email:email ?? state.profile.email},
  }:null,[state,guardRequest,endpoint,userId,native,out,email]);

  if (passwordRequired) return <main className="px-4 py-6"><DriverPasswordForm onUpdated={()=>setPasswordRequired(false)} /></main>;
  if (error) return <div className="mx-auto max-w-sm space-y-3 p-6" role="alert"><p>{error}</p>
    <Button variant="outline" onClick={()=>setRevision(value=>value+1)}>Tentar novamente</Button>
    {native && <Button asChild variant="link"><Link href="/driver/conta?primeiro=1">Retomar primeiro acesso</Link></Button>}
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
  return nativeDriverEnabled ? <EarningsShell driver portal><NativeRuntime>{children}</NativeRuntime></EarningsShell> :
    <LegacyRuntime>{children}</LegacyRuntime>;
}
