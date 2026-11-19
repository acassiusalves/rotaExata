'use client';

import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EarningsRequestError,earningsMessage,useEarnings } from '@/components/earnings/earnings-shell';
import { firstDriverAccessPath,type DriverProvision } from '@/lib/driver/provisioning-contract';

const endpoint='/api/driver/accounts/provision';
const text={
  reserved:'Cadastro incompleto',
  awaiting_access:'Aguardando primeiro acesso',
  publishing:'Ativação pendente',
  assignable:'Publicação no despacho pendente',
  complete:'Pronto para receber rotas',
};

function message(error:unknown) {
  if (error instanceof EarningsRequestError && error.code==='driver_provision_email_exists') {
    return 'Já existe uma conta ou um cadastro pendente com esse e-mail. Confira a lista antes de tentar outro cadastro.';
  }
  if (error instanceof EarningsRequestError && ['driver_provision_identity_conflict','driver_provision_source_conflict'].includes(error.code)) {
    return 'Há um cadastro existente com dados divergentes. Solicite conferência da equipe de administração.';
  }
  return earningsMessage(error);
}

export function DriverProvisioning() {
  const {request}=useEarnings();
  const [rows,setRows]=useState<DriverProvision[]>();
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const retry=useRef<{name:string;email:string;phone:string;commandId:string}|null>(null);
  const load=useCallback(async (signal?:AbortSignal)=>{
    try {
      const result=await request<{provisioning:DriverProvision[]}>(endpoint,{signal});
      if (!signal?.aborted) setRows(result.provisioning);
    } catch (error) {
      if (!signal?.aborted) setError(message(error));
    }
  },[request]);

  useEffect(()=>{
    const abort=new AbortController();
    void load(abort.signal);
    return ()=>abort.abort();
  },[load]);

  async function provision(command:Record<string,string>) {
    setBusy(true);setError('');setNotice('');
    try {
      const result=await request<DriverProvision>(endpoint,{method:'POST',body:JSON.stringify(command)});
      setNotice(result.state==='awaiting_access' ? 'Cadastro preparado. Compartilhe o link de primeiro acesso com o motorista.' : text[result.state]);
      retry.current=null;
      return true;
    } catch (error) {
      setError(message(error));
      return false;
    } finally {
      await load();
      setBusy(false);
    }
  }

  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form=event.currentTarget;
    const fields=new FormData(form);
    const name=String(fields.get('name')).trim();
    const email=String(fields.get('email')).trim().toLowerCase();
    const phone=String(fields.get('phone')).replace(/\D/g,'');
    if (!/^\d{10,11}$/.test(phone)) {
      setError('Informe o telefone com DDD e 10 ou 11 dígitos.');
      return;
    }
    const previous=retry.current;
    const commandId=previous?.name===name && previous.email===email && previous.phone===phone ? previous.commandId:crypto.randomUUID();
    retry.current={name,email,phone,commandId};
    if (await provision({action:'reserve',...retry.current})) form.reset();
  }

  async function share() {
    const url=new URL(firstDriverAccessPath,window.location.origin);
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice('Link de primeiro acesso copiado.');
    } catch {
      setNotice('Copie o endereço pelo link de primeiro acesso.');
    }
  }

  return <section id="novo-motorista" className="space-y-4 rounded-lg border p-4">
    <h2 className="text-lg font-semibold">Cadastrar motorista</h2>
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={submit}>
      <div className="space-y-1"><Label htmlFor="native-driver-name">Nome completo</Label>
        <Input id="native-driver-name" name="name" required minLength={2} maxLength={120} autoComplete="off" /></div>
      <div className="space-y-1"><Label htmlFor="native-driver-email">E-mail</Label>
        <Input id="native-driver-email" name="email" required maxLength={254} type="email" autoComplete="off" /></div>
      <div className="space-y-1"><Label htmlFor="native-driver-phone">Telefone com DDD</Label>
        <Input id="native-driver-phone" name="phone" required maxLength={20} type="tel" autoComplete="off" /></div>
      <Button className="sm:w-fit" disabled={busy}>Preparar cadastro</Button>
    </form>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="text-sm">{notice}</p>}
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <Link className="underline" href={firstDriverAccessPath}>Página de primeiro acesso</Link>
      <Button size="sm" variant="outline" onClick={()=>void share()}>Copiar link</Button>
      <Button size="sm" variant="ghost" onClick={()=>void load()} disabled={busy}>Atualizar cadastros</Button>
    </div>
    {rows?.map(row=><div key={row.commandId} className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <div className="min-w-0 text-sm"><p className="font-medium">{row.name}</p>
        <p className="break-all text-muted-foreground">{row.email} · {text[row.state]}</p></div>
      {row.state==='reserved' &&
        <Button size="sm" variant="outline" disabled={busy} onClick={()=>void provision({action:'resume',commandId:row.commandId})}>Retomar cadastro</Button>}
    </div>)}
  </section>;
}
