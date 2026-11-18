'use client';
import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  EarningsStatusBadge, PeriodFilters, PeriodMessage, PeriodTotals, useEarningsPeriod,
} from '@/components/earnings/period-view';
import { useEarnings } from '@/components/earnings/earnings-shell';
import { displayCents, displayWorkedAt, earningsComponentLabel, type StatementPage } from '@/lib/driver-statement';

export default function DriverEarningsPage() {
  const { client,userId } = useEarnings();
  const period = useEarningsPeriod<StatementPage>('/api/driver/earnings');
  const [live,setLive] = useState(false);
  const { refresh } = period;
  useEffect(() => {
    const channel = client.channel('driver-statement-' + userId).on('postgres_changes',{
      event: '*', schema: 'public', table: 'driver_earning_statement', filter: 'driver_id=eq.' + userId,
    },() => refresh()).subscribe(status => {
      setLive(status === 'SUBSCRIBED');
      if (status === 'SUBSCRIBED') refresh();
    });
    const interval = setInterval(refresh,30000);
    return () => { clearInterval(interval); void client.removeChannel(channel); };
  },[client,userId,refresh]);

  return <section className="mx-auto max-w-2xl space-y-5">
    <div className="flex items-start gap-3">
      <span className="rounded-lg bg-primary/10 p-2 text-primary"><Wallet aria-hidden="true" className="size-5" /></span>
      <div><h1 className="text-2xl font-semibold tracking-tight">Meus ganhos</h1>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe os valores das rotas e as baixas de pagamento.</p></div>
    </div>
    <PeriodFilters {...period} />
    <PeriodMessage online={period.online} error={period.error} loading={!period.result} retry={refresh} />
    {period.result && <>
      <PeriodTotals totals={period.result.totals} />
      {!live && <p role="status" className="text-xs text-muted-foreground">Atualização automática em reconexão.</p>}
      {period.result.progress.length>0 && <ul aria-label="Apuração das rotas" className="space-y-2">
        {period.result.progress.map(route => <li key={route.routeId} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
          <span>Rota {route.routeReference}{route.workedAt ? ' · '+displayWorkedAt(route.workedAt) : ''}</span>
          <span className="font-medium">{route.status==='processing' ? 'Em apuração' : 'Em revisão'}</span>
        </li>)}
      </ul>}
      {!period.result.rows.length ? (!period.result.progress.length && <p className="rounded-lg border p-5 text-sm text-muted-foreground">Nenhum lançamento para estes filtros.</p>) :
        <ul className="space-y-2">
          {period.result.rows.map(row => <li key={row.id} className="rounded-lg border bg-card">
            <details className="group">
              <summary className="cursor-pointer px-4 py-3">
                <span className="ml-1 inline-flex w-[calc(100%-1.5rem)] flex-wrap items-center justify-between gap-2 align-middle">
                  <span><span className="block text-sm font-medium">Rota {row.route_reference} · {displayWorkedAt(row.worked_at)}</span><EarningsStatusBadge status={row.status} />
                    {row.under_review && <span className="ml-1 text-xs text-muted-foreground">Em revisão</span>}</span>
                  <span className="font-semibold tabular-nums">{displayCents(row.total_cents)}</span>
                </span>
              </summary>
              <div className="space-y-3 border-t p-4 text-sm">
                {row.historical && <p className="text-muted-foreground">Lançamento histórico. Os detalhes exibidos seguem o registro disponível.</p>}
                <dl className="space-y-2">
                  {row.lines.map((line,index) => <div key={line.component+index} className="flex justify-between gap-2">
                    <dt>{earningsComponentLabel[line.component] ?? 'Item'}{line.unit === 'meter' ? ` · ${line.quantity.toLocaleString('pt-BR')} m` : ''}</dt>
                    <dd className="tabular-nums">{displayCents(line.cents)}</dd>
                  </div>)}
                </dl>
                {row.paid_at && <p className="text-muted-foreground">Baixa registrada em {displayWorkedAt(row.paid_at)}.</p>}
              </div>
            </details>
          </li>)}
        </ul>}
      <div className="flex gap-2">
        {period.cursor && <Button size="sm" variant="outline" onClick={refresh}>Primeira página</Button>}
        {period.result.nextCursor && <Button size="sm" variant="outline" onClick={period.next}>Próxima página</Button>}
      </div>
    </>}
  </section>;
}
