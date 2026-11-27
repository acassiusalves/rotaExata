'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { EarningsFactor } from '@/lib/earnings/mfa';

const factorNames = { totp:'Aplicativo autenticador',phone:'Celular cadastrado',webauthn:'Chave de segurança' };

export function EarningsMfa({ client,factors,onCancel }: { client: SupabaseClient; factors: EarningsFactor[]; onCancel:()=>void }) {
  const [selected,setSelected] = useState(factors[0].id);
  const [challengeId,setChallengeId] = useState<string>();
  const [notice,setNotice] = useState('');
  const [busy,setBusy] = useState(false);
  const abort = useRef<AbortController>();
  useEffect(() => () => abort.current?.abort(),[]);
  const factor = factors.find(entry => entry.id===selected) ?? factors[0];

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code=String(new FormData(event.currentTarget).get('code') ?? '');
    setBusy(true); setNotice('');
    try {
      if (factor.kind==='phone' && !challengeId) {
        const result = await client.auth.mfa.challenge({factorId:factor.id});
        if (result.error || !result.data?.id) throw new Error('challenge');
        setChallengeId(result.data.id);
        return;
      }
      abort.current = new AbortController();
      const result = factor.kind==='webauthn'
        ? await client.auth.mfa.webauthn._authenticate({factorId:factor.id,webauthn:{signal:abort.current.signal}})
        : factor.kind==='phone' && challengeId
        ? await client.auth.mfa.verify({factorId:factor.id,challengeId,code})
        : await client.auth.mfa.challengeAndVerify({factorId:factor.id,code});
      if (result.error) setNotice('A verificação falhou. Confira o código ou tente novamente.');
    } catch {
      setNotice('A verificação está indisponível. Tente novamente.');
    } finally { setBusy(false); }
  }

  const needsCode = factor.kind==='totp' || (factor.kind==='phone' && Boolean(challengeId));
  return <form onSubmit={verify} className="mx-auto max-w-sm space-y-4 rounded-xl border bg-card p-6">
    <div><h1 className="text-xl font-semibold">Verificação em duas etapas</h1><p className="mt-1 text-sm text-muted-foreground">Confirme o fator cadastrado na sua conta Lunna.</p></div>
    {factors.length>1 && <div className="space-y-1"><Label htmlFor="earnings-factor">Método de verificação</Label>
      <select id="earnings-factor" className="w-full rounded-md border bg-background p-2 text-sm" value={selected} disabled={busy}
        onChange={event => {setSelected(event.target.value);setChallengeId(undefined);setNotice('');}}>
        {factors.map(entry => <option key={entry.id} value={entry.id}>{factorNames[entry.kind]}</option>)}
      </select>
    </div>}
    {needsCode && <div className="space-y-1"><Label htmlFor="earnings-otp">Código de verificação</Label>
      <Input id="earnings-otp" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required /></div>}
    {notice && <p role="alert" className="text-sm text-destructive">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      <Button disabled={busy}>{busy?'Verificando…':factor.kind==='phone'&&!challengeId?'Enviar código':'Verificar'}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancelar e sair</Button>
    </div>
  </form>;
}
