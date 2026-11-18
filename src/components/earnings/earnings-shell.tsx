'use client';

import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { ArrowLeft, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EarningsMfa } from './earnings-mfa';
import { requiredEarningsFactors, type EarningsFactor } from '@/lib/earnings/mfa';
import { earningsBrowserClient } from '@/lib/earnings/client';

export class EarningsRequestError extends Error {
  constructor(readonly status: number, readonly code: string, readonly issues: { code: string; stopId?: string }[] = []) {
    super(code);
  }
}
const messages: Record<string,string> = {
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
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};
const Context = createContext<FinanceContext | null>(null);
export function useEarnings() {
  const value = useContext(Context);
  if (!value) throw new Error('Earnings session is required');
  return value;
}

function SignIn({ client }: { client: SupabaseClient }) {
  const [busy,setBusy] = useState(false);
  const [notice,setNotice] = useState('');
  async function enter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true); setNotice('');
    try {
      const result = await client.auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) });
      if (result.error) {
        setNotice(result.error.code === 'email_not_confirmed' ? 'Confirme seu e-mail da conta Lunna para entrar.' : 'Confira o e-mail e a senha da conta Lunna.');
      }
    } catch {
      setNotice('A conexão falhou. Tente entrar novamente.');
    } finally { setBusy(false); }
  }
  return <form onSubmit={enter} className="mx-auto max-w-sm space-y-4 rounded-xl border bg-card p-6">
    <div><h1 className="text-xl font-semibold">Entrar no financeiro</h1><p className="mt-1 text-sm text-muted-foreground">Use sua conta Lunna.</p></div>
    <div className="space-y-1"><Label htmlFor="earnings-email">E-mail</Label><Input id="earnings-email" name="email" type="email" autoComplete="username" required /></div>
    <div className="space-y-1"><Label htmlFor="earnings-password">Senha</Label><Input id="earnings-password" name="password" type="password" autoComplete="current-password" required /></div>
    {notice && <p role="alert" className="text-sm text-destructive">{notice}</p>}
    <Button className="w-full" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</Button>
  </form>;
}

export function EarningsShell({ children, driver = false }: { children: ReactNode; driver?: boolean }) {
  const [client,setClient] = useState<SupabaseClient>();
  const [session,setSession] = useState<Session | null>(null);
  const [loading,setLoading] = useState(true);
  const [assurance,setAssurance] = useState<{token:string; factors:EarningsFactor[]; error?:boolean}>();
  const token = session?.access_token;
  useEffect(() => {
    if (!client || !token) return;
    let current = true;
    requiredEarningsFactors(client.auth.mfa).then(factors => {
      if (current) setAssurance({token,factors});
    }).catch(() => {
      if (current) setAssurance({token,factors:[],error:true});
    });
    return () => {current=false;};
  },[client,token]);
  useEffect(() => {
    const browser = earningsBrowserClient();
    if (!browser) { setLoading(false); return; }
    setClient(browser);
    const { data } = browser.auth.onAuthStateChange((_event,next) => {
      setSession(next); setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const userId = session?.user.id;
  async function leave() {
    setSession(null);
    setAssurance(undefined);
    await client?.auth.signOut({scope:'local'});
  }
  const request = useCallback(async <T,>(path: string,init?: RequestInit): Promise<T> => {
    const auth = await client?.auth.getSession();
    const active = auth?.data.session;
    if (!active || active.user.id !== userId) throw new EarningsRequestError(401,'earnings_unauthorized');
    const headers = new Headers(init?.headers);
    headers.set('Authorization','Bearer ' + active.access_token);
    if (init?.body) headers.set('Content-Type','application/json');
    const response = await fetch(path,{ ...init, headers, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body) throw new EarningsRequestError(response.status,body?.code,body?.issues);
    return body as T;
  },[client,userId]);

  return <div className="min-h-screen bg-background">
    <header className="sticky top-0 z-10 border-b bg-background">
      <div className="mx-auto flex min-h-14 max-w-6xl flex-wrap items-center justify-between gap-2 px-4">
        <Link href={driver ? '/my-routes' : '/dashboard'} className="inline-flex items-center gap-2 text-sm font-medium"><ArrowLeft aria-hidden="true" className="size-4" />{driver ? 'Minhas rotas' : 'Painel RotaExata'}</Link>
        {userId && <Button variant="ghost" size="sm" onClick={() => void leave()}><LogOut aria-hidden="true" className="mr-2 size-4" />Sair do financeiro</Button>}
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 py-6">
      {loading ? <p role="status">Carregando sessão…</p> : !client ? <p role="status">Financeiro indisponível neste ambiente.</p> :
        !userId ? <SignIn client={client} /> :
        !assurance || assurance.token!==token ? <p role="status">Verificando sessão…</p> :
        assurance.error ? <div role="alert" className="space-y-2 text-sm">
          <p>A verificação da sessão está indisponível.</p>
          <Button variant="outline" onClick={() => void leave()}>Entrar novamente</Button>
        </div> :
        assurance.factors.length ? <EarningsMfa key={token} client={client} factors={assurance.factors} onCancel={() => void leave()} /> :
          <Context.Provider key={userId} value={{ client,userId,request }}>
            {!driver && <nav aria-label="Financeiro" className="mb-5 flex gap-2 border-b pb-3">
              <Button asChild variant="ghost" size="sm"><Link href="/financeiro/pagamentos">Pagamentos</Link></Button>
              <Button asChild variant="ghost" size="sm"><Link href="/financeiro/regras">Regras de ganhos</Link></Button>
            </nav>}
            {children}
          </Context.Provider>}
    </main>
  </div>;
}
