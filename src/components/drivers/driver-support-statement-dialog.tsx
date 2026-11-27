'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { DriverStatementView } from '@/components/earnings/driver-statement-view';
import { EarningsRequestError, earningsMessage } from '@/components/earnings/earnings-shell';
import { PeriodFilters } from '@/components/earnings/period-view';
import { useStaff } from '@/components/staff/staff-session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { currentCompetence, type EarningsCursor, type SupportStatementPage } from '@/lib/driver-statement';

export function DriverSupportStatementDialog({ target, onClose }: {
  target: { id: string; name: string }; onClose: () => void;
}) {
  const { request } = useStaff();
  const reasonId = useId();
  const pending = useRef<AbortController>();
  const [reason,setReason] = useState('');
  const [month,setMonth] = useState(currentCompetence);
  const [status,setStatus] = useState('');
  const [page,setPage] = useState<{ data: SupportStatementPage; cursor: EarningsCursor | null } | null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');

  useEffect(() => () => pending.current?.abort(),[]);

  function clear() {
    pending.current?.abort();
    setPage(null);
    setError('');
    setLoading(false);
  }

  async function load(cursor: EarningsCursor | null) {
    clear();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    try {
      const data = await request<SupportStatementPage>('/api/financeiro/motoristas/extrato',{
        method:'POST', signal:controller.signal, body:JSON.stringify({
          sourceUid:target.id, month, reason:reason.trim(), status:status || undefined,
          after:cursor?.workedAt, afterId:cursor?.id, limit:50,
        }),
      });
      if (controller.signal.aborted) return;
      if (data.target.sourceUid !== target.id) throw new EarningsRequestError(503,'earnings_unavailable');
      setPage({data,cursor});
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof EarningsRequestError && failure.code === 'earnings_driver_not_found'
          ? 'O extrato não está disponível para este motorista.' : earningsMessage(failure));
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return <Dialog open onOpenChange={open => { if (!open) { clear(); onClose(); } }}>
    <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Visualização de suporte — {page?.data.target.name ?? target.name}</DialogTitle>
        <DialogDescription>Somente leitura. Cada consulta é registrada com a justificativa informada.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!loading && month && reason.trim()) void load(null); }}>
        <div className="space-y-1">
          <Label htmlFor={reasonId}>Justificativa</Label>
          <Textarea id={reasonId} required maxLength={1000} rows={2} value={reason}
            onChange={event => { clear(); setReason(event.target.value); }} />
        </div>
        <PeriodFilters month={month} status={status}
          setMonth={value => { clear(); setMonth(value); }} setStatus={value => { clear(); setStatus(value); }} />
        <Button type="submit" disabled={loading || !month || !reason.trim()}>
          {page ? 'Atualizar extrato' : 'Consultar extrato'}
        </Button>
      </form>
      {loading && <p role="status" className="text-sm text-muted-foreground">Carregando lançamentos…</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {page && <>
        <DriverStatementView statement={page.data} />
        <div className="flex gap-2">
          {page.cursor && <Button size="sm" variant="outline" onClick={() => void load(null)}>Primeira página</Button>}
          {page.data.nextCursor && <Button size="sm" variant="outline" onClick={() => void load(page.data.nextCursor)}>Próxima página</Button>}
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
