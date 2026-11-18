'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogHeader } from '@/components/ui/dialog';
import { earningsMessage, useEarnings } from '@/components/earnings/earnings-shell';
import { EarningsStatusBadge, PeriodFilters, PeriodMessage, PeriodTotals, useEarningsPeriod } from '@/components/earnings/period-view';
import {
  displayCents, displayWorkedAt, earningsComponentLabel, type EarningsCursor, type EarningsStatus, type EarningsTotals,
} from '@/lib/driver-statement';
import { defaultBrlInput, parseBrlInput } from '@/lib/earnings/currency-input';

const endpoint = '/api/financeiro/pagamentos';
type PaymentRow = {
  id: string; logical_route_id: string; worked_at: string; driver_name: string | null; total_cents: number;
  status: EarningsStatus; revision: number; rule_version: number | null; review_reasons: string[];
};
type PaymentPage = {
  rows: PaymentRow[]; totals: EarningsTotals; nextCursor: EarningsCursor | null;
  processing: number; review: number; stagingOnly: number; reviewReasons: Record<string,number>;
};
type Detail = {
  id: string; routeId: string; workedAt: string; plannedAt: string | null; paidAt: string | null;
  originalCents: number; totalCents: number; status: EarningsStatus; revision: number;
  historical: boolean; ruleVersion: number | null; ruleEffectiveAt: string | null; legacyDocumentId: string | null;
  reviewReasons: string[];
  items: { key: string; component: string; stopId: string | null; cents: number; effectiveCents: number }[];
  history: { id: string; kind: Command; at: string; payload: { reason?: string; reference?: string; method?: string }; result?: { previousTotalCents:string; totalCents:string; deltaCents:number } }[];
};
type Command = 'approve' | 'pay' | 'cancel' | 'adjust_total' | 'adjust_stop' | 'resolve_review';
const commands: Record<Command,string> = {
  approve: 'Aprovar', pay: 'Registrar baixa', cancel: 'Cancelar lançamento',
  adjust_total: 'Ajustar total', adjust_stop: 'Ajustar parada', resolve_review:'Concluir conferência',
};
const reasonLabels: Record<string,string> = {
  driver_uid_missing: 'Identificador histórico do motorista ausente',
  driver_unmapped: 'Vínculo do motorista pendente',
  components_do_not_reconcile: 'Total histórico em conferência',
  orphan_route: 'Rota histórica indisponível',
  source_unproven: 'Confirmação da rota pendente',
  forced_closure: 'Encerramento forçado',
  source_deleted: 'Rota excluída',
  route_already_accounted: 'Rota com lançamento anterior',
  source_revision_requires_review: 'A origem da rota mudou após o lançamento',
  revision_conflict: 'Revisões da rota divergentes',
  no_rule_at_work_time: 'Sem regra vigente na data do trabalho',
  partial_work: 'Rota com paradas em aberto',
};

function PaymentDetails({ payment,onCommit }: { payment: Detail; onCommit: () => void }) {
  const { request } = useEarnings();
  const [kind,setKind] = useState<Command | ''>('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const requestKey = useRef<{ fingerprint: string; id: string }>();
  const canResolve = payment.reviewReasons.includes('source_revision_requires_review') && ['pending','approved'].includes(payment.status);
  const allowed: Command[] = payment.reviewReasons.length ? (canResolve ? ['resolve_review'] : []) : payment.status === 'pending'
    ? ['approve','adjust_total',...(payment.items.some(item => item.stopId) ? ['adjust_stop' as const] : []),'cancel']
    : payment.status === 'approved' ? ['pay','cancel'] : [];
  function choose(action: Command) {
    setError(''); setKind(action);
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!kind) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get('reason') ?? '').trim();
    const at = String(form.get('paidAt') ?? '');
    const cents = parseBrlInput(String(form.get('amount') ?? ''));
    if ((kind === 'adjust_total' || kind === 'adjust_stop') && cents === undefined) {
      setError('Informe um valor em reais com até duas casas decimais.'); return;
    }
    const payload = kind === 'approve' ? {} : (kind === 'cancel' || kind === 'resolve_review') ? { reason } : kind === 'pay'
      ? { method: form.get('method'), reference: String(form.get('reference')).trim(), paidAt: at ? new Date(at).toISOString() : null }
      : { reason, valueCents: cents, ...(kind === 'adjust_stop' ? { stopId: form.get('stopId') } : {}) };
    const fingerprint = JSON.stringify({ kind, revision: payment.revision,
      values: Object.fromEntries(form.entries()) });
    if (requestKey.current?.fingerprint !== fingerprint) requestKey.current = { fingerprint,id: crypto.randomUUID() };
    const cacheKey = requestKey.current.id;
    // Keep the original payload and request id if a response is lost.
    const body = JSON.stringify({ paymentId: payment.id, expectedRevision: payment.revision, requestId: cacheKey, kind, payload });
    const stored = commandBody.current?.key === cacheKey ? commandBody.current.body : body;
    commandBody.current = { key: cacheKey,body: stored };
    setBusy(true); setError('');
    try {
      await request(endpoint,{ method:'PATCH',body:stored });
      setKind(''); onCommit();
    } catch (failure) { setError(earningsMessage(failure)); }
    finally { setBusy(false); }
  }
  const commandBody = useRef<{ key: string; body: string }>();
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <EarningsStatusBadge status={payment.status} /><p className="text-xl font-semibold tabular-nums">{displayCents(payment.totalCents)}</p>
    </div>
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted-foreground">Trabalho</dt><dd>{displayWorkedAt(payment.workedAt)}</dd></div>
      <div><dt className="text-muted-foreground">Regra</dt><dd>{payment.ruleVersion ? 'Versão ' + payment.ruleVersion : 'Sem versão'}</dd></div>
      <div><dt className="text-muted-foreground">Valor original</dt><dd>{displayCents(payment.originalCents)}</dd></div>
      <div><dt className="text-muted-foreground">Baixa</dt><dd>{displayWorkedAt(payment.paidAt)}</dd></div>
    </dl>
    {payment.historical && <p className="rounded-md bg-muted p-3 text-sm">Registro histórico{payment.legacyDocumentId ? ' · ' + payment.legacyDocumentId : ''}. A apuração segue os dados preservados na origem.</p>}
    {payment.reviewReasons.length > 0 && <ul className="space-y-1 rounded-md border bg-muted p-3 text-sm">
      {payment.reviewReasons.map(reason => <li key={reason}>{reasonLabels[reason] ?? 'Registro em conferência'}</li>)}
    </ul>}
    <dl className="space-y-2 border-t pt-3 text-sm">
      {payment.items.map(item => <div className="flex justify-between gap-2" key={item.key}>
        <dt>{earningsComponentLabel[item.component]}{item.stopId ? ' · ' + item.stopId : ''}</dt>
        <dd className="font-medium tabular-nums">{displayCents(item.effectiveCents)}</dd>
      </div>)}
    </dl>
    {payment.history.length > 0 && <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Histórico de ações</summary>
      <ul className="mt-2 space-y-2 text-sm">{payment.history.map(item => <li key={item.id}>
        {commands[item.kind]} · {displayWorkedAt(item.at)}{item.payload.reason ? ' · ' + item.payload.reason : ''}
        {item.payload.reference ? ' · ' + item.payload.reference : ''}
        {item.result?.deltaCents ? ' · '+displayCents(item.result.previousTotalCents)+' → '+displayCents(item.result.totalCents)
          +' ('+displayCents(item.result.deltaCents)+')' : ''}
      </li>)}</ul>
    </details>}
    {!kind && <div className="flex flex-wrap gap-2">{allowed.map(action =>
      <Button key={action} type="button" size="sm" variant={action === 'approve' || action === 'pay' ? 'default' : 'outline'} onClick={() => choose(action)}>{commands[action]}</Button>)}</div>}
    {kind && <form key={kind} onSubmit={submit} className="space-y-3 rounded-md border p-3 text-sm">
      <h3 className="font-semibold">{commands[kind]}</h3>
      {kind === 'resolve_review' && <p>Confirme o valor lançado após verificar a divergência da rota.</p>}
      {kind === 'approve' && <p>O valor atual será aprovado. A baixa é registrada em outra etapa.</p>}
      {kind === 'adjust_stop' && <div className="space-y-1"><Label htmlFor="command-stop">Parada</Label>
        <select name="stopId" id="command-stop" className="w-full rounded-md border bg-background p-2">
          {payment.items.filter(item => item.stopId).map(item => <option key={item.key} value={item.stopId ?? ''}>{item.stopId} · {displayCents(item.effectiveCents)}</option>)}
        </select></div>}
      {(kind === 'adjust_total' || kind === 'adjust_stop') && <div className="space-y-1"><Label htmlFor="command-amount">Novo valor em reais</Label>
        <Input name="amount" id="command-amount" inputMode="decimal" defaultValue={kind === 'adjust_total' ? defaultBrlInput(payment.totalCents) : ''} required /></div>}
      {kind === 'pay' && <>
        <div className="space-y-1"><Label htmlFor="command-method">Forma de pagamento</Label>
          <select id="command-method" name="method" className="w-full rounded-md border bg-background p-2">
            <option value="pix">Pix</option><option value="bank_transfer">Transferência</option><option value="cash">Dinheiro</option><option value="other">Outra</option>
          </select></div>
        <div className="space-y-1"><Label htmlFor="command-reference">Referência do comprovante</Label><Input id="command-reference" name="reference" maxLength={200} required /></div>
        <div className="space-y-1"><Label htmlFor="command-at">Data e hora da baixa</Label><Input type="datetime-local" id="command-at" name="paidAt" />
          <p className="text-xs text-muted-foreground">Horário deste dispositivo. Deixe em branco para registrar agora.</p></div>
      </>}
      {(kind === 'cancel' || kind === 'adjust_total' || kind === 'adjust_stop' || kind === 'resolve_review') && <div className="space-y-1">
        <Label htmlFor="command-reason">Motivo</Label><Textarea name="reason" id="command-reason" maxLength={1000} required /></div>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={busy}>{busy ? 'Registrando…' : 'Confirmar ação'}</Button>
        <Button size="sm" type="button" variant="ghost" disabled={busy} onClick={() => setKind('')}>Voltar</Button>
      </div>
    </form>}
  </div>;
}

export default function PaymentsPage() {
  const { request } = useEarnings();
  const period = useEarningsPeriod<PaymentPage>(endpoint);
  const [paymentId,setPaymentId] = useState<string | null>(null);
  const [detail,setDetail] = useState<Detail | null>(null);
  const [error,setError] = useState('');
  const [detailReload,setDetailReload] = useState(0);
  useEffect(() => {
    if (!paymentId) return;
    const controller = new AbortController();
    setDetail(null); setError('');
    request<Detail>(endpoint + '?id=' + encodeURIComponent(paymentId),{ signal:controller.signal }).then(result => {
      if (!controller.signal.aborted) setDetail(result);
    }).catch(error => {
      if (!controller.signal.aborted) setError(earningsMessage(error));
    });
    return () => controller.abort();
  },[paymentId,detailReload,request]);

  const result = period.result;
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-semibold tracking-tight">Pagamentos</h1>
      <p className="mt-1 text-sm text-muted-foreground">Confira os lançamentos e registre aprovação e baixa de cada rota.</p></div>
    <PeriodFilters {...period} />
    <PeriodMessage online={period.online} error={period.error} loading={!result} retry={period.refresh} />
    {result && <>
      <PeriodTotals totals={result.totals} />
      {(result.processing > 0 || result.review > 0 || result.stagingOnly > 0) && <details className="rounded-lg border bg-muted/40 p-3 text-sm">
        <summary className="cursor-pointer font-medium">{result.processing} em processamento · {result.review} eventos em revisão · {result.stagingOnly} registros históricos na fila</summary>
        <ul className="mt-2 space-y-1 text-muted-foreground">{Object.entries(result.reviewReasons).map(([reason,count]) =>
          <li key={reason}>{reasonLabels[reason] ?? 'Verificação técnica pendente'} · {count}</li>)}</ul>
      </details>}
      {!result.rows.length ? <p className="rounded-lg border p-5 text-sm text-muted-foreground">Nenhum lançamento para estes filtros.</p> :
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="bg-muted/60 text-muted-foreground"><tr>
              <th className="p-3 font-medium">Trabalho</th><th className="p-3 font-medium">Rota</th><th className="p-3 font-medium">Motorista</th>
              <th className="p-3 font-medium">Situação</th><th className="p-3 text-right font-medium">Valor</th>
              <th className="p-3"><span className="sr-only">Ações</span></th>
            </tr></thead>
            <tbody>{result.rows.map(row => <tr key={row.id} className="border-t">
              <td className="p-3">{displayWorkedAt(row.worked_at)}</td>
              <td className="max-w-56 truncate p-3" title={row.logical_route_id}>{row.logical_route_id}</td>
              <td className="p-3">{row.driver_name ?? 'Vínculo em conferência'}</td>
              <td className="space-y-1 p-3"><EarningsStatusBadge status={row.status} />{row.review_reasons.length > 0 && <p className="text-xs text-muted-foreground">Conferência necessária</p>}</td>
              <td className="p-3 text-right font-medium tabular-nums">{displayCents(row.total_cents)}</td>
              <td className="p-3"><Button variant="outline" size="sm" onClick={() => setPaymentId(row.id)}>Detalhes</Button></td>
            </tr>)}</tbody>
          </table>
        </div>}
      <div className="flex gap-2">
        {period.cursor && <Button variant="outline" size="sm" onClick={period.refresh}>Primeira página</Button>}
        {result.nextCursor && <Button variant="outline" size="sm" onClick={period.next}>Próxima página</Button>}
      </div>
    </>}
    <Dialog open={Boolean(paymentId)} onOpenChange={open => { if (!open) setPaymentId(null); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Detalhes do lançamento</DialogTitle><DialogDescription>{detail ? 'Rota ' + detail.routeId : 'Pagamento da rota'}</DialogDescription></DialogHeader>
        {error ? <div role="alert" className="space-y-2 text-sm"><p>{error}</p><Button variant="outline" onClick={() => setDetailReload(value => value+1)}>Recarregar lançamento</Button></div> :
          detail ? <PaymentDetails key={detail.id+detail.revision} payment={detail} onCommit={() => {setDetailReload(value => value+1); period.refresh();}} /> :
            <p role="status" className="text-sm text-muted-foreground">Carregando detalhes…</p>}
      </DialogContent>
    </Dialog>
  </section>;
}
