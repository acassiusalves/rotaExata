'use client';

import { useCallback,useEffect,useRef,useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EarningsRequestError,EarningsShell,earningsMessage,useEarnings } from '@/components/earnings/earnings-shell';
import { useConfirm } from '@/hooks/use-confirm';
import type { DriverAccount,DriverAccountCommand } from '@/lib/driver/account-contract';

const descriptions:Record<DriverAccountCommand['action'],{label:string;description:string}> = {
  revoke_sessions:{label:'Encerrar sessões',description:'O motorista precisará entrar de novo nos dispositivos conectados.'},
  set_inactive:{label:'Bloquear acesso',description:'As sessões serão encerradas e a conta perderá acesso às rotas e aos ganhos.'},
  set_active:{label:'Reativar acesso',description:'O motorista poderá entrar novamente com a conta Lunna.'},
  require_password_change:{label:'Exigir troca de senha',description:'As sessões serão encerradas. O motorista precisará definir uma nova senha no próximo acesso.'},
};

function accountError(error:unknown) {
  if (error instanceof EarningsRequestError) {
    if (error.status===409) return error.code==='driver_account_source_disabled'
      ? 'Esta conta foi bloqueada na origem e precisa de conferência no cadastro Lunna.'
      : 'A conta mudou desde a última leitura. Atualize a página e confira a situação.';
  }
  return earningsMessage(error);
}

function DriverAccountControls() {
  const {request,signOut}=useEarnings();
  const {confirm}=useConfirm();
  const [rows,setRows]=useState<DriverAccount[] | null>(null);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const retry=useRef<DriverAccountCommand | null>(null);
  const load=useCallback(async (signal?:AbortSignal)=>{
    try {
      const {accounts}=await request<{accounts:DriverAccount[]}>('/api/driver/accounts',{signal});
      if (!signal?.aborted) {setRows(accounts);setError('');}
    } catch (error) {if (!signal?.aborted) setError(accountError(error));}
  },[request]);
  useEffect(()=>{
    const operation=new AbortController();
    void load(operation.signal);
    return ()=>operation.abort();
  },[load]);

  async function run(account:DriverAccount,action:DriverAccountCommand['action']) {
    const text=descriptions[action];
    const accepted=await confirm({title:text.label+' · '+account.name,description:text.description,
      confirmText:text.label,cancelText:'Cancelar',variant:action==='set_active'?'default':'destructive'});
    if (!accepted) return;
    const previous=retry.current;
    const command=previous?.targetId===account.userId && previous.action===action && previous.revision===account.revision
      ? previous:{targetId:account.userId,action,revision:account.revision,commandId:crypto.randomUUID()};
    retry.current=command;
    setPending(true); setError(''); setMessage('');
    try {
      await request<DriverAccount>('/api/driver/accounts',{method:'POST',body:JSON.stringify(command)});
      retry.current=null;
      setMessage(text.label+' · Alteração registrada.');
      await load();
    } catch(error) {
      if (error instanceof EarningsRequestError && error.status<500) retry.current=null;
      setError(accountError(error));
    } finally {setPending(false);}
  }

  return <main className="mx-auto max-w-4xl space-y-5 p-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><Link href="/drivers" className="text-sm underline">Voltar para Motoristas</Link>
        <h1 className="mt-2 text-2xl font-semibold">Contas de motoristas</h1></div>
      <Button variant="outline" onClick={()=>void signOut()}>Sair da conta Lunna</Button>
    </header>
    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
    {message && <p className="text-sm" role="status">{message}</p>}
    {!rows && !error && <p role="status">Carregando contas…</p>}
    <Button size="sm" variant="outline" onClick={()=>void load()} disabled={pending}>Atualizar lista</Button>
    {rows?.length===0 && <p className="text-sm text-muted-foreground">Nenhuma conta de motorista vinculada a esta operação.</p>}
    {rows?.map(account=><article key={account.userId} className="space-y-3 rounded-lg border p-4">
      <div><h2 className="font-semibold">{account.name}</h2><p className="text-sm text-muted-foreground">
        {account.active?'Acesso ativo':'Acesso bloqueado'} · {account.emailVerified?'E-mail confirmado':'E-mail pendente'}
        {account.mustChangePassword && ' · Troca de senha exigida'}
      </p></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={pending || !account.active} onClick={()=>void run(account,'revoke_sessions')}>Encerrar sessões</Button>
        {account.active
          ? <Button size="sm" variant="outline" disabled={pending} onClick={()=>void run(account,'set_inactive')}>Bloquear acesso</Button>
          : <Button size="sm" variant="outline" disabled={pending || account.legacyDisabled} onClick={()=>void run(account,'set_active')}>Reativar acesso</Button>}
        <Button size="sm" variant="outline" disabled={pending || !account.active} onClick={()=>void run(account,'require_password_change')}>Exigir troca de senha</Button>
      </div>
    </article>)}
    <p className="text-sm text-muted-foreground">Convites e exclusões de contas de motoristas estão indisponíveis durante a transição.</p>
  </main>;
}

export function DriverAccountAdmin() {
  return <EarningsShell portal><DriverAccountControls /></EarningsShell>;
}
