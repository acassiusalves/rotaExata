'use client';

import * as React from 'react';
import { Loader2, Smartphone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useStaff } from '@/components/staff/staff-session';
import { assistOpenMessage } from '@/lib/driver/assist-policy';
import { assistEntryPath } from '@/lib/driver/assist-session';
import { isReopenReasonValid, MIN_REOPEN_REASON_LENGTH } from '@/lib/route-reopen';

type Props = { driver: { id: string; name: string } | null; onClose: () => void };

export function DriverAssistDialog({ driver, onClose }: Props) {
  const { toast } = useToast();
  const staff = useStaff();
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Cada motorista abre o diálogo com o motivo em branco.
  React.useEffect(() => { setReason(''); }, [driver?.id]);

  const handleConfirm = async () => {
    if (!driver || !isReopenReasonValid(reason)) return;
    // A aba precisa nascer no próprio clique, antes do pedido ao servidor, ou o navegador a bloqueia.
    const tab = window.open('about:blank', '_blank');
    setIsSubmitting(true);
    try {
      const { grantId } = await staff.request<{ grantId: string }>('/api/staff/drivers/' + encodeURIComponent(driver.id) + '/assist', {
        method: 'POST', body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!tab) throw new Error('popup');
      tab.location.href = assistEntryPath(grantId);
      onClose();
    } catch (error) {
      tab?.close();
      toast({ variant: 'destructive', title: 'App do motorista não foi aberto',
        description: !tab ? 'O navegador bloqueou a nova aba. Libere pop-ups para este site e tente de novo.' : assistOpenMessage(error) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!driver} onOpenChange={(open) => { if (!open && !isSubmitting) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Smartphone className="h-5 w-5" aria-hidden="true" />Abrir app do motorista</DialogTitle>
          <DialogDescription>
            Você vai ver o app de {driver?.name} e poderá iniciar, confirmar entregas e finalizar rotas em nome dele por 60 minutos.
            Cada ação fica registrada no seu nome. As entregas que você confirmar ou corrigir vão para a conferência do financeiro.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="driver-assist-reason" className="text-sm font-medium">Motivo</label>
          <Textarea id="driver-assist-reason" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)}
            placeholder="Ex.: motorista sem sinal, pediu para registrar as entregas" disabled={isSubmitting} />
          <p className="text-xs text-muted-foreground">Mínimo de {MIN_REOPEN_REASON_LENGTH} caracteres. Fica no histórico de atividades.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
          <Button onClick={() => void handleConfirm()} disabled={isSubmitting || !isReopenReasonValid(reason)}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Abrir app
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
