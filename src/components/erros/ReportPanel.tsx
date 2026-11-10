'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ReportClassification, ReportImprovement } from './ReportClassification';
import { ReportFilters } from './ReportFilters';
import { useReportList } from './useReportList';
import { reportStatusLabels, serializeReportDate, type ReportStatus, type ReportSummary } from '@/lib/reporting/report-contract';

type Detail = ReportSummary & {
  capabilities: { manage: boolean; reopen: boolean };
  reopenHistory?: Array<{ details: string; reopenedAt: unknown }>;
  statusHistory?: Array<{ next: keyof typeof reportStatusLabels; at: unknown }>;
  context?: { url?: string; resolution?: string; userAgent?: string };
  logs?: unknown[];
};

type PanelMode = 'admin' | 'mine';
type ReportCommand = { action: 'reopen'; details: string } | { status: Exclude<ReportStatus, 'pending'> };

function displayDate(value: unknown) {
  const date = serializeReportDate(value);
  return date ? new Date(date).toLocaleString('pt-BR') : 'Data indisponível';
}

export function ReportPanel({ mode }: { mode: PanelMode }) {
  const { user } = useAuth();
  return (
    <Suspense fallback={<div className="grid place-items-center p-8"><Loader2 className="animate-spin" /></div>}>
      <AuthenticatedReports key={user?.uid ?? 'anonymous'} mode={mode} />
    </Suspense>
  );
}

function AuthenticatedReports({ mode }: { mode: PanelMode }) {
  const { user, loading: authLoading } = useAuth();
  const reportIdFromUrl = useSearchParams().get('report');
  const { reports, loading, load, error, filters, counts, updateFilters, next, previous } = useReportList(user, mode === 'mine');
  const [selected, setSelected] = useState<Detail | null>(null);
  const [problem, setProblem] = useState('');
  const [details, setDetails] = useState('');
  const [updating, setUpdating] = useState(false);
  const detailRequest = useRef<AbortController | null>(null);
  const command = useRef<{ key: string; id: string } | null>(null);

  const openReport = useCallback(async (id: string) => {
    if (!user) return;
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setProblem('');
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/feedbacks/${encodeURIComponent(id)}${mode === 'mine' ? '?scope=mine' : ''}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível abrir o chamado.');
      if (!controller.signal.aborted) {
        setSelected(data.report);
        setDetails('');
      }
    } catch (error) {
      if (!controller.signal.aborted) setProblem(error instanceof Error ? error.message : 'Chamado indisponível.');
    }
  }, [mode, user]);

  useEffect(() => {
    setSelected(null);
    command.current = null;
    if (reportIdFromUrl) void openReport(reportIdFromUrl);
    return () => detailRequest.current?.abort();
  }, [openReport, reportIdFromUrl]);

  async function updateReport(update: ReportCommand) {
    if (!user || !selected || updating) return;
    setUpdating(true);
    setProblem('');
    const key = JSON.stringify([selected.id, update]);
    if (command.current?.key !== key) command.current = { key, id: crypto.randomUUID() };
    const requestId = command.current.id;
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/feedbacks/admin', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reportId: selected.id, ...update, requestId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o chamado.');
      if (command.current?.id === requestId) command.current = null;
      setSelected((current) => current?.id === selected.id ? data.report : current);
      setDetails('');
      void load();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Não foi possível atualizar o chamado.');
    } finally {
      setUpdating(false);
    }
  }

  if (authLoading) return <div className="grid place-items-center p-8"><Loader2 className="animate-spin" /></div>;
  if (!user) return <div className="p-6"><Link className="underline" href="/login">Entre para acompanhar seus chamados</Link></div>;

  const manage = mode === 'admin' && selected?.capabilities.manage;
  const reopen = selected?.status === 'resolved' && selected.capabilities.reopen;

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{mode === 'admin' ? 'Chamados' : 'Meus chamados'}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'admin' ? 'Acompanhe os chamados disponíveis para o seu perfil.' : 'Acompanhe os erros e as melhorias que você enviou.'}
          </p>
        </div>
      </header>
      <ReportFilters values={filters} onChange={updateFilters} counts={counts} />
      {!selected && problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : loading ? (
        <div className="grid place-items-center p-8"><Loader2 className="animate-spin" /></div>
      ) : reports.length ? (
        <ul className="space-y-2">
          {reports.map((report) => (
            <li key={report.id}>
              <button type="button" className="grid w-full gap-2 rounded-lg border bg-card p-3 text-left hover:bg-muted/50"
                onClick={() => void openReport(report.id)}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <ReportClassification origin={report.originSystem} category={report.category} />
                  <span className="text-xs font-semibold">{reportStatusLabels[report.status]}</span>
                </span>
                <span className="line-clamp-2 break-words text-sm">{report.improvement?.goal ?? report.description}</span>
                <span className="text-xs text-muted-foreground">
                  {mode === 'admin' && report.user.name ? `${report.user.name} · ` : ''}{displayDate(report.createdAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="p-5 text-center text-sm text-muted-foreground">Nenhum chamado encontrado.</p>}
      {(previous || next) && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={previous} disabled={!previous}>Anterior</Button>
          <Button variant="outline" size="sm" onClick={next} disabled={!next}>Próxima</Button>
        </div>
      )}
      <Dialog open={!!selected} onOpenChange={(open) => {
        if (!open) {
          detailRequest.current?.abort();
          setSelected(null);
          setProblem('');
        }
      }}>
        {selected && (
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[640px]">
            <DialogHeader>
              <DialogTitle>Detalhes do chamado</DialogTitle>
              <DialogDescription>{reportStatusLabels[selected.status]} · {displayDate(selected.createdAt)}</DialogDescription>
            </DialogHeader>
            <ReportClassification origin={selected.originSystem} category={selected.category} />
            {selected.improvement ? <ReportImprovement improvement={selected.improvement} /> :
              <p className="whitespace-pre-wrap break-words rounded-md border p-3 text-sm">{selected.description}</p>}
            {!!selected.statusHistory?.length && (
              <section className="space-y-2 text-sm">
                <h2 className="font-semibold">Histórico de status</h2>
                {[...selected.statusHistory].reverse().map((entry, index) => (
                  <p key={index}>{displayDate(entry.at)} · {reportStatusLabels[entry.next]}</p>
                ))}
              </section>
            )}
            {!!selected.reopenHistory?.length && (
              <section className="space-y-2 text-sm">
                <h2 className="font-semibold">Complementos</h2>
                {[...selected.reopenHistory].reverse().map((entry, index) => (
                  <p key={index} className="whitespace-pre-wrap break-words">{displayDate(entry.reopenedAt)} · {entry.details}</p>
                ))}
              </section>
            )}
            {(selected.context || selected.logs?.length) && (
              <details className="rounded-md border p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Contexto técnico</summary>
                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify({ contexto: selected.context, logs: selected.logs }, null, 2)}
                </pre>
              </details>
            )}
            {reopen && (
              <label className="grid gap-1 text-sm font-medium">
                O que ainda precisa ser resolvido?
                <Textarea value={details} maxLength={5000} onChange={(event) => setDetails(event.target.value)} disabled={updating} />
              </label>
            )}
            {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
            <DialogFooter>
              {manage && selected.status !== 'in_progress' && (
                <Button variant="secondary" disabled={updating} onClick={() => void updateReport({ status: 'in_progress' })}>
                  {selected.status === 'resolved' ? 'Voltar para análise' : 'Marcar em análise'}
                </Button>
              )}
              {manage && selected.status !== 'resolved' && (
                <Button disabled={updating} onClick={() => void updateReport({ status: 'resolved' })}>Resolver chamado</Button>
              )}
              {reopen && (
                <Button onClick={() => void updateReport({ action: 'reopen', details: details.trim() })}
                  disabled={updating || !details.trim()}>Reabrir chamado</Button>
              )}
              <Button variant="outline" onClick={() => setSelected(null)}>Fechar</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </main>
  );
}
