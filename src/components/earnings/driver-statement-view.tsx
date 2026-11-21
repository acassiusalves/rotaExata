import type { ReactNode } from 'react';
import { EarningsStatusBadge, PeriodTotals } from './period-view';
import { displayCents, displayWorkedAt, earningsComponentLabel, type StatementPage } from '@/lib/driver-statement';

export function DriverStatementView({ statement, notice }: { statement: StatementPage; notice?: ReactNode }) {
  return <>
    <PeriodTotals totals={statement.totals} />
    {notice}
    {statement.progress.length>0 && <ul aria-label="Apuração das rotas" className="space-y-2">
      {statement.progress.map(route => <li key={route.routeId} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
        <span>Rota {route.routeReference}{route.workedAt ? ' · '+displayWorkedAt(route.workedAt) : ''}</span>
        <span className="font-medium">{route.status==='processing' ? 'Em apuração' : 'Em revisão'}</span>
      </li>)}
    </ul>}
    {!statement.rows.length ? (!statement.progress.length && <p className="rounded-lg border p-5 text-sm text-muted-foreground">Nenhum lançamento para estes filtros.</p>) :
      <ul className="space-y-2">
        {statement.rows.map(row => <li key={row.id} className="rounded-lg border bg-card">
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
  </>;
}
