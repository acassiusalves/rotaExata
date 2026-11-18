'use client';

import { useEffect,useRef,useState,type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { earningsBrowserClient } from '@/lib/earnings/client';
import { EarningsShell } from '@/components/earnings/earnings-shell';
import { DriverPasswordForm } from './driver-password-form';

type EntryState='loading'|'request'|'invalid'|'verified'|'recovery'|'done';

async function readCallback():Promise<EntryState> {
  const url=new URL(window.location.href);
  const fragment=new URLSearchParams(url.hash.slice(1));
  const code=url.searchParams.get('code');
  if (url.hash || url.search) window.history.replaceState(window.history.state,'',url.pathname);
  if (fragment.has('error') || url.searchParams.has('error')) return 'invalid';
  const verifiedToken=fragment.get('type')==='signup' ? fragment.get('access_token') : null;
  if (!code && !verifiedToken) return 'request';
  const client=earningsBrowserClient();
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

export function DriverAccountEntry() {
  const [state,setState]=useState<EntryState>('loading');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const callback=useRef<Promise<EntryState> | null>(null);
  useEffect(()=>{
    let current=true;
    callback.current ??=readCallback().catch(()=> 'invalid');
    void callback.current.then(next=>{if (current) setState(next);});
    return ()=>{current=false;};
  },[]);

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email=String(new FormData(event.currentTarget).get('email'));
    setBusy(true); setNotice('');
    try {
      const client=earningsBrowserClient();
      if (!client) throw new Error('authentication unavailable');
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/driver/conta'});
      if (error) throw error;
      setNotice('Se houver uma conta para esse e-mail, abra o link recebido neste mesmo navegador.');
    } catch { setNotice('A recuperação está indisponível. Tente de novo em alguns minutos.'); }
    finally {setBusy(false);}
  }

  if (state==='recovery') return <EarningsShell portal><main className="px-4 py-6"><DriverPasswordForm onUpdated={()=>setState('done')} /></main></EarningsShell>;
  return <main className="mx-auto max-w-sm space-y-4 p-6">
    <h1 className="text-xl font-semibold">Acesso à conta Lunna</h1>
    {state==='loading' && <p role="status">Verificando link…</p>}
    {state==='verified' && <p role="status">E-mail confirmado. Entre para abrir suas rotas.</p>}
    {state==='done' && <p role="status">Senha atualizada. Entre com a nova senha.</p>}
    {state==='invalid' && <p role="alert">Link inválido, expirado ou aberto em outro navegador. Solicite um novo link abaixo.</p>}
    {(state==='request' || state==='invalid') && <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1"><Label htmlFor="driver-recovery-email">E-mail</Label>
        <Input id="driver-recovery-email" name="email" type="email" autoComplete="username" required /></div>
      <Button disabled={busy} className="w-full">{busy?'Enviando…':'Enviar link de recuperação'}</Button>
      {notice && <p className="text-sm" role="status">{notice}</p>}
    </form>}
    <Link href="/my-routes" className="block text-sm underline">Voltar para o login</Link>
  </main>;
}
