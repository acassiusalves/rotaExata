'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EarningsRequestError,earningsMessage,useEarnings } from '@/components/earnings/earnings-shell';

const errors:Record<string,string> = {
  driver_account_revision_conflict:'A segurança da conta mudou durante a troca. Entre novamente para verificar se há uma nova exigência.',
  driver_password_weak:'Escolha uma senha forte com pelo menos 8 caracteres.',
  driver_password_unchanged:'Escolha uma senha diferente da atual.',
  driver_password_reauthentication:'Entre novamente para confirmar sua identidade antes de trocar a senha.',
  driver_password_rate_limited:'Aguarde alguns minutos antes de tentar novamente.',
};

export function DriverPasswordForm({onUpdated,firstAccess=false}:{onUpdated:()=>void;firstAccess?:boolean}) {
  const {request,signOut}=useEarnings();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const password=String(fields.get('password'));
    if (password!==fields.get('confirmation')) {
      setError('As duas senhas precisam ser iguais.');
      return;
    }
    setBusy(true); setError('');
    try {
      await request(firstAccess?'/api/driver/onboarding':'/api/driver/password',{method:'POST',
        body:JSON.stringify(firstAccess?{action:'password',password}:{password})});
      onUpdated();
      await signOut();
    } catch (error) {
      setError(error instanceof EarningsRequestError && errors[error.code] || earningsMessage(error));
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mx-auto max-w-sm space-y-4 rounded-xl border bg-card p-6">
    <div><h1 className="text-xl font-semibold">Defina uma nova senha</h1>
      <p className="mt-1 text-sm text-muted-foreground">Depois de salvar, entre com a nova senha.</p></div>
    <div className="space-y-1"><Label htmlFor="driver-password">Nova senha</Label>
      <Input id="driver-password" name="password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></div>
    <div className="space-y-1"><Label htmlFor="driver-confirmation">Repita a nova senha</Label>
      <Input id="driver-confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={72} required /></div>
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    <Button disabled={busy} className="w-full">{busy?'Salvando…':'Salvar nova senha'}</Button>
    <Button type="button" variant="ghost" className="w-full" onClick={()=>void signOut()}>Sair</Button>
  </form>;
}
