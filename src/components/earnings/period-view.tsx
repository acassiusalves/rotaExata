'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  currentCompetence, displayCents, earningsStatusLabel, earningsStatuses, periodQuery,
  type EarningsCursor, type EarningsStatus, type EarningsTotals,
} from '@/lib/driver-statement';
import { earningsMessage, useEarnings } from './earnings-shell';

export function useEarningsPeriod<Page extends { nextCursor: EarningsCursor | null }>(path: string) {
  const { request } = useEarnings();
  const [month,setMonth] = useState(currentCompetence);
  const [status,setStatus] = useState('');
  const [cursor,setCursor] = useState<EarningsCursor | null>(null);
  const [result,setResult] = useState<Page | null>(null);
  const [online,setOnline] = useState(true);
  const [error,setError] = useState('');
  const [reload,setReload] = useState(0);
  const refresh = useCallback(() => { setCursor(null); setReload(value => value+1); },[]);
  useEffect(() => {
    function reconnect() { setOnline(true); refresh(); }
    function disconnect() { setOnline(false); setResult(null); }
    setOnline(navigator.onLine);
    window.addEventListener('online',reconnect);
    window.addEventListener('offline',disconnect);
    window.addEventListener('focus',refresh);
    return () => {
      window.removeEventListener('online',reconnect);
      window.removeEventListener('offline',disconnect);
      window.removeEventListener('focus',refresh);
    };
  },[refresh]);
  useEffect(() => {
    if (!online || !month) return;
    const controller = new AbortController();
    setError('');
    request<Page>(path + '?' + periodQuery(month,status,cursor),{ signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setResult(result);
    }).catch(error => {
      if (!controller.signal.aborted) { setResult(null); setError(earningsMessage(error)); }
    });
    return () => controller.abort();
  },[request,path,month,status,cursor,online,reload]);

  return {
    month,status,cursor,result,error,online,refresh,
    setMonth: (value: string) => { setMonth(value); setCursor(null); setResult(null); },
    setStatus: (value: string) => { setStatus(value); setCursor(null); setResult(null); },
    next: () => { if (result?.nextCursor) { setCursor(result.nextCursor); setResult(null); } },
  };
}

export function PeriodFilters({ month,status,setMonth,setStatus }: {
  month: string; status: string; setMonth: (value: string) => void; setStatus: (value: string) => void;
}) {
  return <div className="flex flex-wrap items-end gap-3">
    <div className="space-y-1"><Label htmlFor="earnings-month">Competência</Label>
      <Input type="month" id="earnings-month" value={month} onChange={event => setMonth(event.target.value)} /></div>
    <div className="space-y-1"><Label htmlFor="earnings-status">Situação</Label>
      <select id="earnings-status" className="h-10 rounded-md border bg-background px-3 text-sm" value={status} onChange={event => setStatus(event.target.value)}>
        <option value="">Todas</option>
        {earningsStatuses.map(value => <option key={value} value={value}>{earningsStatusLabel[value]}</option>)}
      </select></div>
  </div>;
}

export function PeriodTotals({ totals }: { totals: EarningsTotals }) {
  return <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    {earningsStatuses.map(status => <div key={status} className="rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground sm:text-sm">{earningsStatusLabel[status]}</dt>
      <dd className="text-base font-semibold tabular-nums sm:text-lg">{displayCents(totals[status]?.cents)}</dd>
      <dd className="text-xs text-muted-foreground">{totals[status]?.count ?? 0} lançamentos</dd>
    </div>)}
  </dl>;
}

export function EarningsStatusBadge({ status }: { status: EarningsStatus }) {
  const tone = { pending: 'bg-amber-100 text-amber-950', approved: 'bg-blue-100 text-blue-950', paid: 'bg-emerald-100 text-emerald-950', cancelled: 'bg-muted text-foreground' };
  return <span className={'inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ' + tone[status]}>{earningsStatusLabel[status]}</span>;
}

export function PeriodMessage({ online,error,loading,retry }: { online: boolean; error: string; loading: boolean; retry: () => void }) {
  if (!online) return <p role="status" className="rounded-lg border p-4 text-sm">Você está sem conexão. Volte à internet para atualizar os valores.</p>;
  if (error) return <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">
    <p>{error}</p><Button variant="outline" size="sm" className="mt-2" onClick={retry}>Tentar novamente</Button>
  </div>;
  return loading ? <p role="status" className="text-sm text-muted-foreground">Carregando lançamentos…</p> : null;
}
