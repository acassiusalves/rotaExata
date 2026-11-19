'use client';

import { createContext,useContext,useEffect,useState,type ReactNode } from 'react';
import { usePathname,useRouter } from 'next/navigation';
import Link from 'next/link';
import { EarningsRequestError,EarningsShell,useEarnings } from '@/components/earnings/earnings-shell';
import { Button } from '@/components/ui/button';
import { staffPageForPath,type StaffPage,type StaffRole } from '@/lib/staff/access';
import { staffWorkspaceKey } from '@/lib/staff/workspace';
import { useAuth } from '@/hooks/auth-context';

type Summary={userId:string;scopeId:string;name:string;role:StaffRole;paths:StaffPage[];revision:number;policyRevision:number};
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
  const earnings=useEarnings();
  const {request,signOut}=earnings;
  const [result,setResult]=useState<{actor?:Summary;status?:number;code?:string}>();
  const [retry,setRetry]=useState(0);

  useEffect(()=>{
    let controller:AbortController|undefined;
    async function read() {
      if (controller) return;
      const operation=new AbortController();
      controller=operation;
      try {
        const actor=await request<Summary>('/api/staff/session',{signal:operation.signal});
        if (!operation.signal.aborted) setResult({actor});
      } catch (err) {
        if (operation.signal.aborted) return;
        const status=err instanceof EarningsRequestError ? err.status : 503;
        const code=err instanceof EarningsRequestError ? err.code : undefined;
        setResult(previous=>status===401 || status===403 ? {status,code} : {...previous,status,code});
      } finally {
        if (controller===operation) controller=undefined;
      }
    }
    const foreground=()=>{if(document.visibilityState==='visible') void read();};
    void read();
    const timer=window.setInterval(foreground,20_000);
    document.addEventListener('visibilitychange',foreground);
    return ()=>{
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',foreground);
    };
  },[request,pathname,retry]);

  const page=staffPageForPath(pathname);
  if (!result) return <p className="p-6" role="status">Conferindo acesso ao painel…</p>;

  if (!result.actor) {
    const password=result.code==='platform_password_change_required';
    const denied=result.status===401 || result.status===403;
    return <div className="mx-auto max-w-md space-y-4 p-6">
      <p role="alert">{password ? 'Atualize sua senha para acessar o painel.' : result.status===401 ?
        'Sua sessão expirou.' : denied ? 'Sua conta não tem acesso a este painel.' : 'Não foi possível verificar seu acesso.'}</p>
      {password && <Button asChild><Link href={'/driver/conta?next='+encodeURIComponent(pathname)}>Atualizar senha</Link></Button>}
      {denied && !password && <Button variant="outline" onClick={()=>void signOut()}>Sair</Button>}
      {!denied && <Button variant="outline" onClick={()=>setRetry(n=>n+1)}>Tentar novamente</Button>}
      {denied && !password && <Link className="block underline" href="/my-routes">Minhas rotas</Link>}
    </div>;
  }

  if (!page || !result.actor.paths.includes(page)) return <div className="mx-auto max-w-md space-y-4 p-6">
    <p role="alert">Sua conta não tem acesso a esta página.</p>
    {result.actor.paths.length>0 && <Link className="underline" href={result.actor.paths[0]}>Abrir página disponível</Link>}
    <Button variant="ghost" onClick={()=>void signOut()}>Sair</Button>
  </div>;

  return <Context.Provider value={{...earnings,...result.actor}}>
    {result.status && <p className="border-b p-2 text-sm" role="status">A verificação de acesso será repetida em instantes.</p>}
    {children}
  </Context.Provider>;
}

function ChooseDestination({next,staffOnly,driverNext}:{next:string|null;staffOnly:boolean;driverNext:string}) {
  const {request,signOut}=useEarnings();
  const router=useRouter();
  const [error,setError]=useState('');
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    async function resolve() {
      try {
        const session=await request<Summary>('/api/staff/session',{signal:controller.signal});
        const destination=next && session.paths.some(page=>page===staffPageForPath(new URL(next,window.location.origin).pathname)) ?
          next : session.paths[0];
        if (!destination) setError('Sua conta não tem páginas disponíveis no painel.');
        else if (!controller.signal.aborted) router.replace(destination);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof EarningsRequestError) {
          if (err.code==='platform_password_change_required') {
            router.replace('/driver/conta?next='+encodeURIComponent(next ?? '/dashboard'));
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
