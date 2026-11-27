'use client';

import { createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import { usePathname,useRouter } from 'next/navigation';
import Link from 'next/link';
import { EarningsRequestError,EarningsShell,useEarnings } from '@/components/earnings/earnings-shell';
import { useNativeSession } from '@/components/providers/native-session-provider';
import { Button } from '@/components/ui/button';
import { type StaffPage,type StaffRole } from '@/lib/staff/access';
import { clearStaffWorkspace,staffWorkspaceKey } from '@/lib/staff/workspace';
import { DriverPasswordForm } from '@/components/driver/driver-password-form';
import { deniedStaffDestination } from '@/lib/staff/driver-redirect';
import { useAuth } from '@/hooks/auth-context';

type Summary={userId:string;scopeId:string;name:string;role:StaffRole;paths:StaffPage[];revision:number;policyRevision:number;pathAllowed?:boolean;rotaPolicyRevision?:string|null};
type StaffSession=Summary & ReturnType<typeof useEarnings>;
const Context=createContext<StaffSession|null>(null);

export function useOptionalStaff() {return useContext(Context);}

export function useStaff() {
  const actor=useOptionalStaff();
  if (!actor) throw new Error('Staff session is required');
  return actor;
}

export function useStaffWorkspace() {
  const {userId,scopeId}=useStaff();
  const draftKey=staffWorkspaceKey(userId,scopeId,'newRouteData');
  const originKey=staffWorkspaceKey(userId,scopeId,'savedOrigins');
  return {draftKey,originKey};
}

export function useLayoutIdentity() {
  const legacy=useAuth();
  const actor=useContext(Context);
  if (actor) return {
    user:{displayName:actor.name,email:actor.email,photoURL:null},
    userRole:actor.role as string,
    signOut:actor.signOut,
    canNavigate:(href:string)=>actor.paths.some(path=>path===href),
  };
  return {...legacy,canNavigate:(_href:string)=>true};
}

export function StaffGate({children}:{children:ReactNode}) {
  const pathname=usePathname();
  const router=useRouter();
  const earnings=useEarnings();
  const {request,signOut}=earnings;
  const reauthenticate=useNativeSession()!.reauthenticate;
  const [result,setResult]=useState<{path:string;actor?:Summary;status?:number;code?:string}>();
  const [retry,setRetry]=useState(0);
  const [offline,setOffline]=useState(false);
  const knownActor=useRef<Summary>();
  const renderedLifetime=useRef<AbortController>();
  const pageRequest=useCallback(<T,>(path:string,init?:RequestInit)=>{
    const lifetime=renderedLifetime.current;
    if (!lifetime || lifetime.signal.aborted) return Promise.reject(new EarningsRequestError(503,'staff_unavailable'));
    const signal=init?.signal ? AbortSignal.any([lifetime.signal,init.signal]):lifetime.signal;
    return request<T>(path,{...init,signal});
  },[request]);

  useEffect(()=>{
    let checking:AbortController|undefined;
    const hide=()=>{
      renderedLifetime.current?.abort();
      renderedLifetime.current=undefined;
    };
    function disconnected() {
      checking?.abort();
      checking=undefined;
      hide();
      setOffline(true);
      setResult(undefined);
    }
    async function read() {
      if (!navigator.onLine) {disconnected();return;}
      if (checking) return;
      const operation=new AbortController();
      checking=operation;
      try {
        const actor=await request<Summary>('/api/staff/session?path='+encodeURIComponent(pathname),{signal:operation.signal});
        if (!operation.signal.aborted) {
          knownActor.current=actor;
          if (actor.pathAllowed) renderedLifetime.current ??=new AbortController();
          else hide();
          setResult({path:pathname,actor});
          setOffline(false);
        }
      } catch (err) {
        if (operation.signal.aborted) return;
        hide();
        const status=err instanceof EarningsRequestError ? err.status : 503;
        const code=err instanceof EarningsRequestError ? err.code : undefined;
        const discard=status===403 && code!=='platform_password_change_required' || status===401 && code==='staff_unauthorized';
        if (discard && knownActor.current) {
          clearStaffWorkspace(window.localStorage,knownActor.current.userId);
          clearStaffWorkspace(window.sessionStorage,knownActor.current.userId);
          knownActor.current=undefined;
        }
        if (status===401) void (discard ? signOut():reauthenticate());
        // Conta de motorista que caiu numa página do painel vai direto para o app do motorista.
        const driverHome=await deniedStaffDestination(path=>request(path,{signal:operation.signal}),status,code);
        if (operation.signal.aborted) return;
        if (driverHome) {
          router.replace(driverHome);
          return;
        }
        setResult({path:pathname,status,code});
        setOffline(false);
      } finally {
        if (checking===operation) checking=undefined;
      }
    }
    const foreground=()=>{if(document.visibilityState==='visible') void read();};
    void read();
    const timer=window.setInterval(foreground,20_000);
    document.addEventListener('visibilitychange',foreground);
    window.addEventListener('offline',disconnected);
    window.addEventListener('online',foreground);
    return ()=>{
      checking?.abort();
      hide();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',foreground);
      window.removeEventListener('offline',disconnected);
      window.removeEventListener('online',foreground);
    };
  },[request,pathname,retry,signOut,reauthenticate,router]);

  if (offline) return <p className="p-6" role="status">Sem conexão. O painel será liberado depois de conferir o seu acesso.</p>;
  if (result?.path!==pathname) return <p className="p-6" role="status">Conferindo acesso ao painel…</p>;
  if (!result) return <p className="p-6" role="status">Conferindo acesso ao painel…</p>;

  if (!result.actor && result.code==='platform_password_change_required') {
    return <DriverPasswordForm onUpdated={()=>setRetry(n=>n+1)} />;
  }

  if (!result.actor) {
    const denied=result.status===401 || result.status===403;
    return <div className="mx-auto max-w-md space-y-4 p-6">
      <p role="alert">{result.status===401 ?
        'Sua sessão expirou.' : denied ? 'Sua conta não tem acesso a este painel.' : 'Não foi possível verificar seu acesso.'}</p>
      {denied && <Button variant="outline" onClick={()=>void signOut()}>Sair</Button>}
      {!denied && <Button variant="outline" onClick={()=>setRetry(n=>n+1)}>Tentar novamente</Button>}
      {denied && <Link className="block underline" href="/my-routes">Minhas rotas</Link>}
    </div>;
  }

  if (!result.actor.pathAllowed) return <div className="mx-auto max-w-md space-y-4 p-6">
    <p role="alert">Sua conta não tem acesso a esta página.</p>
    {result.actor.paths.length>0 && <Link className="underline" href={result.actor.paths[0]}>Abrir página disponível</Link>}
    <Button variant="ghost" onClick={()=>void signOut()}>Sair</Button>
  </div>;

  return <Context.Provider value={{...earnings,...result.actor,request:pageRequest}}>
    {result.status && <p className="border-b p-2 text-sm" role="status">A verificação de acesso será repetida em instantes.</p>}
    {children}
  </Context.Provider>;
}

function ChooseDestination({next,staffOnly,driverNext}:{next:string|null;staffOnly:boolean;driverNext:string}) {
  const {request,signOut}=useEarnings();
  const router=useRouter();
  const [password,setPassword]=useState(false);
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    async function resolve() {
      try {
        const desired=next ? new URL(next,window.location.origin).pathname:null;
        const session=await request<Summary>('/api/staff/session'+(desired ? '?path='+encodeURIComponent(desired):''),{signal:controller.signal});
        const destination=next && session.pathAllowed ? next:session.paths[0];
        if (!destination) setError('Sua conta não tem páginas disponíveis no painel.');
        else if (!controller.signal.aborted) router.replace(destination);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof EarningsRequestError) {
          if (err.code==='platform_password_change_required') {
            setPassword(true);
            return;
          }
          if (err.status===403 && !staffOnly) {
            router.replace(driverNext);
            return;
          }
        }
        setError('Não foi possível abrir o painel com esta sessão.');
      }
    }
    void resolve();
    return ()=>controller.abort();
  },[next,staffOnly,driverNext,router,request,retry]);
  if (password) return <DriverPasswordForm onUpdated={()=>{setPassword(false);setRetry(n=>n+1);}} />;
  return <div className="mx-auto max-w-sm space-y-3 p-6">
    {error ? <>
      <p role="alert">{error}</p>
      <Button variant="outline" onClick={()=>{setError('');setRetry(n=>n+1);}}>Tentar novamente</Button>
      <Button variant="ghost" onClick={()=>void signOut()}>Sair</Button>
    </> : <p role="status">Abrindo o RotaExata…</p>}
  </div>;
}

export function RotaLogin({next,staffOnly,driverNext}:{next:string|null;staffOnly:boolean;driverNext:string}) {
  return <EarningsShell portal returnTo={next ?? undefined} staffLogin={staffOnly}>
    <ChooseDestination next={next} staffOnly={staffOnly} driverNext={driverNext} />
  </EarningsShell>;
}
