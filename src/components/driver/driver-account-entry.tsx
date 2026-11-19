'use client';

import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { earningsBrowserClient } from '@/lib/earnings/client';
import { EarningsShell,earningsMessage,useEarnings } from '@/components/earnings/earnings-shell';
import { nativeDriverEnabled,accountReturnPath } from '@/lib/driver/mode';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { staffReturnPath } from '@/lib/staff/access';
import { DriverPasswordForm } from './driver-password-form';

type EntryState='loading'|'request'|'invalid'|'verified'|'recovery'|'done';

async function readCallback(tryFirstAccess:boolean):Promise<EntryState> {
  const url=new URL(window.location.href);
  const fragment=new URLSearchParams(url.hash.slice(1));
  const code=url.searchParams.get('code');
  if (url.hash || url.search) window.history.replaceState(window.history.state,'',url.pathname);
  if (fragment.has('error') || url.searchParams.has('error')) return 'invalid';
  const verifiedToken=fragment.get('type')==='signup' ? fragment.get('access_token') : null;
  const client=earningsBrowserClient();
  if (!code && !verifiedToken) {
    if (tryFirstAccess && client && (await client.auth.getSession()).data.session) return 'recovery';
    return 'request';
  }
  if (!client) return 'invalid';
  if (verifiedToken) {
    const {data,error}=await client.auth.getUser(verifiedToken);
    return !error && data.user?.email_confirmed_at ? 'verified':'invalid';
  }
  if (!code) return 'invalid';
  // The verifier remains in the browser that requested password recovery.
  const {data,error}=await client.auth.exchangeCodeForSession(code);
  return error || !data.session ? 'invalid':'recovery';
}

const recoveryReturn='rotaexata-password-return';
const firstAccessIntent='rotaexata-first-access';

function RecoveredAccount({firstAccess,onUpdated,staff}:{firstAccess:boolean;onUpdated:()=>void;staff:boolean}) {
  const {request,signOut}=useEarnings();
  const [onboarding,setOnboarding]=useState<{state:string;passwordSet:boolean}|null|undefined>(undefined);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const load=useCallback(async (signal?:AbortSignal)=>{
    setError('');
    try {
      const result=nativeDriverEnabled && !staff
        ? await request<{onboarding:{state:string;passwordSet:boolean}|null}>('/api/driver/onboarding',{signal})
        : {onboarding:null};
      if (!signal?.aborted) setOnboarding(result.onboarding);
    } catch (error) {
      if (!signal?.aborted) setError(earningsMessage(error));
    }
  },[request,staff]);
  useEffect(()=>{
    const abort=new AbortController();
    void load(abort.signal);
    return ()=>abort.abort();
  },[load]);

  async function resume() {
    setBusy(true);setError('');
    try {
      await request('/api/driver/onboarding',{method:'POST',body:JSON.stringify({action:'resume'})});
      onUpdated();
      await signOut();
    } catch(error) {setError(earningsMessage(error));}
    finally {setBusy(false);}
  }

  if (onboarding===undefined) return <div className="mx-auto max-w-sm space-y-3 p-6">
    {error ? <><p role="alert">{error}</p><Button variant="outline" onClick={()=>void load()}>Tentar novamente</Button></>
      : <p role="status">Conferindo acesso…</p>}
  </div>;
  if (!onboarding || onboarding.state==='complete') {
    if (firstAccess) return <div className="mx-auto max-w-sm space-y-3 p-6">
      <p role="status">{onboarding ? 'O primeiro acesso já foi concluído.' : 'Esta conta não tem um cadastro de motorista pendente.'}</p>
      <Link className="underline" href="/my-routes">Abrir minhas rotas</Link>
      <Button variant="ghost" onClick={()=>void signOut()}>Sair</Button>
    </div>;
    return <DriverPasswordForm onUpdated={onUpdated} />;
  }
  if (onboarding.state==='awaiting_access' && !onboarding.passwordSet) {
    return <DriverPasswordForm firstAccess onUpdated={onUpdated} />;
  }
  return <div className="mx-auto max-w-sm space-y-3 p-6">
    <h1 className="text-xl font-semibold">Concluir ativação da conta</h1>
    <p>Sua senha já foi definida. Complete a ativação para receber rotas.</p>
    {error && <p role="alert">{error}</p>}
    <Button disabled={busy} onClick={()=>void resume()}>{busy?'Ativando…':'Concluir ativação'}</Button>
  </div>;
}

export function DriverAccountEntry({next,firstAccess=false}:{next:string;firstAccess?:boolean}) {
  const [state,setState]=useState<EntryState>('loading');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [destination,setDestination]=useState(next);
  const [setup,setSetup]=useState(firstAccess);
  const callback=useRef<Promise<EntryState> | null>(null);
  useEffect(()=>{
    let current=true;
    const recoverCode=new URLSearchParams(window.location.search).has('code');
    const returnTo=recoverCode ? window.localStorage.getItem(recoveryReturn) ?? next:next;
    const forStaff=nativeStaffEnabled && !!staffReturnPath(returnTo);
    const first=!forStaff && (firstAccess || (nativeDriverEnabled && window.localStorage.getItem(firstAccessIntent)==='1'));
    callback.current ??=readCallback(first).catch(()=> 'invalid');
    void callback.current.then(result=>{
      if (!current) return;
      setSetup(first);
      if (result==='recovery') setDestination(accountReturnPath(window.localStorage.getItem(recoveryReturn) ?? next));
      setState(result);
    });
    return ()=>{current=false;};
  },[firstAccess,next]);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email=String(new FormData(event.currentTarget).get('email'));
    setBusy(true); setNotice('');
    try {
      const client=earningsBrowserClient();
      if (!client) throw new Error('authentication unavailable');
      window.localStorage.setItem(recoveryReturn,destination);
      if (setup) window.localStorage.setItem(firstAccessIntent,'1');
      else window.localStorage.removeItem(firstAccessIntent);
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/driver/conta'});
      if (error) throw error;
      setNotice('Se houver uma conta para esse e-mail, abra o link recebido neste mesmo navegador.');
    } catch { setNotice('A recuperação está indisponível. Tente de novo em alguns minutos.'); }
    finally {setBusy(false);}
  }

  if (state==='recovery') return <EarningsShell portal><main className="px-4 py-6"><RecoveredAccount firstAccess={setup} staff={nativeStaffEnabled && !!staffReturnPath(destination)}
    onUpdated={()=>{window.localStorage.removeItem(recoveryReturn);window.localStorage.removeItem(firstAccessIntent);setState('done');}} />
  </main></EarningsShell>;
  return <main className="mx-auto max-w-sm space-y-4 p-6">
    <h1 className="text-xl font-semibold">{setup?'Primeiro acesso do motorista':'Acesso à conta Lunna'}</h1>
    {state==='loading' && <p role="status">Verificando link…</p>}
    {state==='verified' && <p role="status">E-mail confirmado. Entre para abrir suas rotas.</p>}
    {state==='done' && <p role="status">Senha atualizada. Entre com a nova senha.</p>}
    {state==='invalid' && <p role="alert">Link inválido, expirado ou aberto em outro navegador. Solicite um novo link abaixo.</p>}
    {(state==='request' || state==='invalid') && <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1"><Label htmlFor="driver-recovery-email">E-mail</Label>
        <Input id="driver-recovery-email" name="email" type="email" autoComplete="username" required /></div>
      <Button disabled={busy} className="w-full">{busy?'Enviando…':setup?'Enviar link de primeiro acesso':'Enviar link de recuperação'}</Button>
      {notice && <p className="text-sm" role="status">{notice}</p>}
    </form>}
    <Link href={destination} className="block text-sm underline">Voltar para o login</Link>
  </main>;
}
