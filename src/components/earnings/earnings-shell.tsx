'use client';

import { createContext, useContext, useState, type FormEvent, type ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {nativeStaffEnabled} from '@/lib/staff/mode';
import {accountReturnPath} from '@/lib/driver/mode';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EarningsMfa } from './earnings-mfa';
import { nativeEarningsEnabled } from '@/lib/earnings/client';
import { NativeSessionProvider,useNativeSession } from '@/components/providers/native-session-provider';
import { EarningsRequestError } from '@/lib/earnings/session-request';
export { EarningsRequestError } from '@/lib/earnings/session-request';

const messages: Record<string,string> = {
  earnings_session_revalidating: 'Estamos verificando sua sessão. Aguarde e tente salvar novamente.',
  earnings_version_conflict: 'Outra pessoa publicou uma versão. Recarregue a regra antes de tentar novamente.',
  earnings_revision_conflict: 'Este pagamento mudou. Abra o lançamento novamente antes de continuar.',
  earnings_review_revision_conflict: 'Esta rota mudou. Atualize a conferência e simule o valor novamente.',
  earnings_review_request_conflict: 'Outra decisão já foi enviada com este pedido. Atualize a conferência.',
  earnings_review_not_found: 'Esta rota saiu da fila. Atualize a lista de conferências.',
  earnings_review_paused: 'A geração de valores está pausada.',
  earnings_invalid_review: 'Confira a evidência e os dados de cada parada antes de continuar.',
  earnings_invalid_review_uf: 'A UF informada não permite enquadrar esta parada na tarifa vigente.',
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

function SignIn({client,portal,returnTo,staffLogin}:{client:SupabaseClient;portal:boolean;returnTo?:string;staffLogin?:boolean}) {
  const pathname=usePathname();
  const returnPath=accountReturnPath(returnTo ?? pathname);
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
    {portal && !staffLogin && <Link href="/driver/conta?primeiro=1" className="block text-center text-sm text-muted-foreground underline">Primeiro acesso do motorista</Link>}
    {portal && !nativeStaffEnabled && <Link href="/login?admin=1" className="block text-center text-sm text-muted-foreground underline">Acesso administrativo</Link>}
  </form>;
}

type ShellProps={children:ReactNode;driver?:boolean;portal?:boolean;returnTo?:string;staffLogin?:boolean};

export function EarningsShell(props:ShellProps) {
  const shared=useNativeSession();
  if (!props.portal && !nativeEarningsEnabled) return <p role="status">Financeiro indisponível neste ambiente.</p>;
  if (shared) return <EarningsShellView {...props} />;
  return <NativeSessionProvider><EarningsShellView {...props} /></NativeSessionProvider>;
}

function EarningsShellView({children,driver=false,portal=false,returnTo,staffLogin}:ShellProps) {
  const { client,session,sessionId,loading,ready,failed,factors,exitError,leave,request }=useNativeSession()!;
  const userId=session?.user.id;
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
        {userId && <Button variant="ghost" size="sm" onClick={() => void leave()}><LogOut aria-hidden="true" className="mr-2 size-4" />{nativeStaffEnabled?'Sair':'Sair do financeiro'}</Button>}
      </div>
    </header>}
    <main className="mx-auto max-w-6xl px-4 py-6">
      {exitNotice}
      {loading ? <p role="status">Carregando sessão…</p> : !client ? <p role="status">{portal?'RotaExata indisponível neste ambiente.':'Financeiro indisponível neste ambiente.'}</p> :
        !userId ? <SignIn client={client} portal={portal} returnTo={returnTo} staffLogin={staffLogin} /> :
        !ready && failed ? <div role="alert" className="space-y-2 text-sm">
          <p>A verificação da sessão está indisponível.</p>
          <Button variant="outline" onClick={() => void leave()}>Entrar novamente</Button>
        </div> :
        !ready && !factors.length ? <p role="status">Verificando sessão…</p> :
        !ready ? <EarningsMfa key={session?.access_token} client={client} factors={factors} onCancel={() => void leave()} /> :
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
