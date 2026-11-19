'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {clearDevicePushGrant} from '@/lib/driver/push-device';
import {accountReturnPath} from '@/lib/driver/mode';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EarningsMfa } from './earnings-mfa';
import { requiredEarningsFactors, type EarningsFactor } from '@/lib/earnings/mfa';
import { earningsBrowserClient,nativeEarningsEnabled,signOutNativeLocally } from '@/lib/earnings/client';

export class EarningsRequestError extends Error {
  constructor(readonly status: number, readonly code: string, readonly issues: { code: string; stopId?: string }[] = []) {
    super(code);
  }
}
import {localSessionId,locallyRetired,logoutMarker,reusableAssurance} from '@/lib/earnings/session-storage';

const messages: Record<string,string> = {
  earnings_session_revalidating: 'Estamos verificando sua sessão. Aguarde e tente salvar novamente.',
  earnings_version_conflict: 'Outra pessoa publicou uma versão. Recarregue a regra antes de tentar novamente.',
  earnings_revision_conflict: 'Este pagamento mudou. Abra o lançamento novamente antes de continuar.',
  earnings_request_conflict: 'Este comando já foi usado. Reabra o lançamento para enviar uma nova ação.',
  earnings_invalid_effective_at: 'Escolha uma vigência posterior à última versão publicada.',
  earnings_requires_review: 'Este lançamento precisa de conferência antes de receber ajustes ou baixa.',
  earnings_invalid_transition: 'A situação atual do lançamento já mudou. Reabra os detalhes.',
  earnings_payment_not_found: 'Este lançamento não está disponível.',
  earnings_commands_paused: 'As operações de pagamento estão pausadas.',
  earnings_invalid_command: 'Confira o valor, a data e os dados do pagamento.',
  earnings_invalid_period: 'Escolha uma competência válida.',
};
export function earningsMessage(error: unknown) {
  if (error instanceof EarningsRequestError) {
    if (error.status === 401) return 'Sua sessão expirou. Entre novamente para continuar.';
    if (error.status === 403) return 'Sua conta não tem acesso a esta área.';
    if (messages[error.code]) return messages[error.code];
    if (error.status === 422) return 'Confira os campos informados.';
  }
  return 'O serviço está indisponível. Tente novamente.';
}

type FinanceContext = {
  client: SupabaseClient;
  userId: string;
  email?: string;
  signOut: () => Promise<void>;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};
const Context = createContext<FinanceContext | null>(null);
export function useEarnings() {
  const value = useContext(Context);
  if (!value) throw new Error('Earnings session is required');
  return value;
}

function SignIn({ client,portal }: { client: SupabaseClient;portal:boolean }) {
  const returnPath=accountReturnPath(usePathname());
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  const [unverified,setUnverified] = useState('');
  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email=String(data.get('email'));
    setBusy(true); setNotice(''); setUnverified('');
    try {
      const result = await client.auth.signInWithPassword({ email, password: String(data.get('password')) });
      if (result.error) {
        if (result.error.code==='email_not_confirmed') setUnverified(email);
        setNotice(result.error.code === 'email_not_confirmed' ? 'Confirme seu e-mail da conta Lunna para entrar.' : 'Confira o e-mail e a senha da conta Lunna.');
      }
    } catch {
      setNotice('A conexão falhou. Tente entrar novamente.');
    } finally { setBusy(false); }
  }
  async function resend() {
    setBusy(true);
    try {
      const {error}=await client.auth.resend({type:'signup',email:unverified,
        options:{emailRedirectTo:window.location.origin+'/driver/conta'}});
      setNotice(error ? 'O reenvio está indisponível. Aguarde um momento e tente de novo.' :
        'Se o e-mail estiver pendente de confirmação, procure o link na sua caixa de entrada.');
      if (!error) setUnverified('');
    } catch { setNotice('O reenvio está indisponível. Tente de novo.'); }
    finally { setBusy(false); }
  }
  return <form onSubmit={enter} className="mx-auto max-w-sm space-y-4 rounded-xl border bg-card p-6">
    <div><h1 className="text-xl font-semibold">{portal?'Entrar no RotaExata':'Entrar no financeiro'}</h1><p className="mt-1 text-sm text-muted-foreground">Use sua conta Lunna.</p></div>
    <div className="space-y-1"><Label htmlFor="earnings-email">E-mail</Label><Input id="earnings-email" name="email" type="email" autoComplete="username" required /></div>
    <div className="space-y-1"><Label htmlFor="earnings-password">Senha</Label><Input id="earnings-password" name="password" type="password" autoComplete="current-password" required /></div>
    {notice && <p role="alert" className="text-sm text-destructive">{notice}</p>}
    <Button className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
    {portal && unverified && <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={()=>void resend()}>Reenviar confirmação</Button>}
    <Link href={"/driver/conta?next="+encodeURIComponent(returnPath)} className="block text-center text-sm text-muted-foreground underline">Esqueci minha senha</Link>
    {portal && <Link href="/login?admin=1" className="block text-center text-sm text-muted-foreground underline">Acesso administrativo</Link>}
  </form>;
}

export function EarningsShell({ children, driver = false, portal=false }: { children: ReactNode; driver?: boolean;portal?:boolean }) {
  const [client,setClient] = useState<SupabaseClient>();
  const [session,setSession] = useState<Session | null>(null);
  const [loading,setLoading] = useState(true);
  const [assurance,setAssurance]=useState<{token:string;sessionId?:string;userId:string;factors:EarningsFactor[]}>();
  const [failedToken,setFailedToken]=useState<string>();
  const [exitError,setExitError]=useState(false);
  const token=session?.access_token;
  const userId=session?.user.id;
  const sessionId=localSessionId(token);
  const currentSession=useRef(session);
  const approved=useRef(assurance);
  currentSession.current=session;
  approved.current=assurance;
  useEffect(()=>{
    if (!client || !token || !userId) return;
    let current=true;
    requiredEarningsFactors(client.auth.mfa).then(factors=>{
      if (current) {setAssurance({token,sessionId,userId,factors});setFailedToken(undefined);}
    }).catch(()=>{if(current) setFailedToken(token);});
    return ()=>{current=false;};
  },[client,sessionId,token,userId]);
  useEffect(()=>{
    const browser=portal || nativeEarningsEnabled ? earningsBrowserClient():undefined;
    if (!browser) {setLoading(false);return;}
    setClient(browser);
    const {data}=browser.auth.onAuthStateChange((_event,next)=>{
      const previous=localSessionId(currentSession.current?.access_token);
      if (previous && previous!==localSessionId(next?.access_token)) void clearDevicePushGrant(previous).catch(()=>{});
      setSession(next && !locallyRetired(window.localStorage,next.access_token)?next:null);
      setLoading(false);
    });
    const retire=(event:StorageEvent)=>{
      const current=localSessionId(currentSession.current?.access_token);
      if (current && event.key===logoutMarker(current)) {setSession(null);setAssurance(undefined);}
    };
    window.addEventListener('storage',retire);
    return ()=>{data.subscription.unsubscribe();window.removeEventListener('storage',retire);};
  },[portal]);

  const leave=useCallback(async ()=>{
    if (!client) return;
    try {
      await signOutNativeLocally(client,currentSession.current?.access_token);
      setSession(null);setAssurance(undefined);setExitError(false);
    } catch {
      setExitError(true);
    }
  },[client]);
  const request=useCallback(async <T,>(path:string,init?:RequestInit):Promise<T>=>{
    const active=(await client?.auth.getSession())?.data.session;
    if (!active || active.user.id!==userId || localSessionId(active.access_token)!==sessionId ||
        locallyRetired(window.localStorage,active.access_token)) throw new EarningsRequestError(401,'earnings_unauthorized');
    const write=!!init?.method && init.method.toUpperCase()!=='GET';
    if (write && (approved.current?.token!==active.access_token || approved.current.factors.length)) {
      throw new EarningsRequestError(409,'earnings_session_revalidating');
    }
    const headers=new Headers(init?.headers);
    headers.set('Authorization','Bearer '+active.access_token);
    if (init?.body) headers.set('Content-Type','application/json');
    const response=await fetch(path,{...init,headers,cache:'no-store',redirect:'error'});
    const body=await response.json().catch(()=>null);
    if (!response.ok || !body) throw new EarningsRequestError(response.status,body?.code ?? body?.error,body?.issues);
    return body as T;
  },[client,sessionId,userId]);

  const ready=reusableAssurance(assurance,sessionId,userId);
  const exitNotice=exitError && <p className="p-3 text-sm text-destructive" role="alert">Não foi possível encerrar a sessão neste navegador. Tente sair novamente.</p>;
  if (portal && userId && client && ready) {
    return <Context.Provider key={sessionId} value={{client,userId,email:session?.user.email,request,signOut:leave}}>
      {exitNotice}{children}
    </Context.Provider>;
  }

  return <div className="min-h-screen bg-background">
    {!portal && <header className="sticky top-0 z-10 border-b bg-background">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-2 px-4">
        <Link href={driver ? '/my-routes' : '/dashboard'} className="inline-flex items-center gap-2 text-sm font-medium"><ArrowLeft aria-hidden="true" className="size-4" />{driver ? 'Minhas rotas' : 'Painel RotaExata'}</Link>
        {userId && <Button variant="ghost" size="sm" onClick={() => void leave()}><LogOut aria-hidden="true" className="mr-2 size-4" />Sair do financeiro</Button>}
      </div>
    </header>}
    <main className="mx-auto max-w-6xl px-4 py-6">
      {exitNotice}
      {loading ? <p role="status">Carregando sessão…</p> : !client ? <p role="status">{portal?'RotaExata indisponível neste ambiente.':'Financeiro indisponível neste ambiente.'}</p> :
        !userId ? <SignIn client={client} portal={portal} /> :
        !ready && failedToken===token ? <div role="alert" className="space-y-2 text-sm">
          <p>A verificação da sessão está indisponível.</p>
          <Button variant="outline" onClick={() => void leave()}>Entrar novamente</Button>
        </div> :
        !ready && assurance?.token!==token ? <p role="status">Verificando sessão…</p> :
        !ready && assurance?.factors.length ? <EarningsMfa key={token} client={client} factors={assurance.factors} onCancel={() => void leave()} /> :
          <Context.Provider key={sessionId} value={{ client,userId,email:session?.user.email,request,signOut:leave }}>
            {!driver && <nav aria-label="Financeiro" className="mb-5 flex gap-2 border-b pb-3">
              <Button asChild variant="ghost" size="sm"><Link href="/financeiro/pagamentos">Pagamentos</Link></Button>
              <Button asChild variant="ghost" size="sm"><Link href="/financeiro/regras">Regras de ganhos</Link></Button>
            </nav>}
            {children}
          </Context.Provider>}
    </main>
  </div>;
}
