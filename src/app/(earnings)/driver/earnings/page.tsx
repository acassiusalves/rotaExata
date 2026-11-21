'use client';
import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  PeriodFilters, PeriodMessage, useEarningsPeriod,
} from '@/components/earnings/period-view';
import { useEarnings } from '@/components/earnings/earnings-shell';
import { DriverStatementView } from '@/components/earnings/driver-statement-view';
import type { StatementPage } from '@/lib/driver-statement';

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
      <DriverStatementView statement={period.result} notice={!live &&
        <p role="status" className="text-xs text-muted-foreground">Atualização automática em reconexão.</p>} />
      <div className="flex gap-2">
        {period.cursor && <Button size="sm" variant="outline" onClick={refresh}>Primeira página</Button>}
        {period.result.nextCursor && <Button size="sm" variant="outline" onClick={period.next}>Próxima página</Button>}
      </div>
    </>}
  </section>;
}
