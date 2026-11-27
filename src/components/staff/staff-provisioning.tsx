'use client';

import { useCallback,useEffect,useRef,useState,type FormEvent } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EarningsRequestError } from '@/lib/earnings/session-request';
import type { StaffProvision } from '@/lib/staff/directory-contract';
import { useStaff } from './staff-session';

const endpoint='/api/staff/directory/provision';

export function StaffProvisioning({onReady}:{onReady:()=>void}) {
  const {request,role}=useStaff();
  const [pending,setPending]=useState<StaffProvision[]>([]);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const attempt=useRef<{fingerprint:string;id:string}>();

  const load=useCallback(async(signal?:AbortSignal)=>{
    const data=await request<{pending:StaffProvision[]}>(endpoint,{signal});
    if (!signal?.aborted) setPending(data.pending);
  },[request]);
  useEffect(()=>{
    const controller=new AbortController();
    void load(controller.signal).catch(()=>{if (!controller.signal.aborted) setError('Não foi possível carregar os cadastros pendentes.');});
    return ()=>controller.abort();
  },[load]);

  async function submit(command:Record<string,unknown>) {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const result=await request<StaffProvision>(endpoint,{method:'POST',body:JSON.stringify(command)});
      if (result.state==='ready') {
        attempt.current=undefined;
        setMessage('Cadastro preparado. A pessoa deve confirmar seu e-mail e definir a senha no primeiro acesso.');
        onReady();
      }
    } catch(err) {
      const exists=err instanceof EarningsRequestError && ['staff_email_exists','staff_legacy_email_exists'].includes(err.code);
      setError(exists?'Este e-mail já está cadastrado. Confira o vínculo antes de continuar.':'Não foi possível concluir o cadastro. Retome pela lista de pendências.');
    } finally {
      await load().catch(()=>{});
      setSaving(false);
    }
  }

  function create(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data=new FormData(event.currentTarget);
    const input={action:'reserve',name:data.get('name'),email:data.get('email'),role:data.get('role')};
    const fingerprint=JSON.stringify(input);
    const commandId=attempt.current?.fingerprint===fingerprint ? attempt.current.id:crypto.randomUUID();
    attempt.current={id:commandId,fingerprint};
    void submit({...input,commandId});
  }

  return <Card>
    <CardHeader><CardTitle>Novo operador</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><Label htmlFor="staff-name">Nome</Label><Input name="name" id="staff-name" required minLength={2} maxLength={150} /></div>
        <div className="space-y-1"><Label htmlFor="staff-email">E-mail</Label><Input name="email" id="staff-email" required type="email" /></div>
        <div className="space-y-1"><Label htmlFor="staff-role">Função</Label>
          <select className="h-10 w-full rounded-md border bg-background px-3" name="role" id="staff-role" defaultValue="gestor">
            <option value="gestor">Gestor</option><option value="socio">Sócio</option>
            {role==='admin' && <option value="admin">Administrador</option>}
          </select>
        </div>
        <div className="sm:col-span-3"><Button disabled={saving}>{saving?'Preparando…':'Preparar acesso'}</Button></div>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      {pending.map(item=><div key={item.commandId} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
        <div><p className="font-medium">{item.name}</p><p className="text-sm text-muted-foreground">{item.email}</p></div>
        {item.state==='reserved' ?
          <Button size="sm" variant="outline" disabled={saving} onClick={()=>void submit({action:'resume',commandId:item.commandId})}>Retomar cadastro</Button>:
          <Button variant="outline" size="sm" asChild><Link href="/driver/conta?next=%2Fdashboard">Abrir primeiro acesso</Link></Button>}
      </div>)}
    </CardContent>
  </Card>;
}
