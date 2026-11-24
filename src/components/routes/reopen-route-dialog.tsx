'use client';

import * as React from 'react';
import { Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useOptionalStaff } from '@/components/staff/staff-session';
import { reportErrorMessage, useStaffReportCommandIds } from '@/components/reports/use-staff-report-data';
import { EarningsRequestError } from '@/lib/earnings/session-request';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { isReopenReasonValid, MIN_REOPEN_REASON_LENGTH } from '@/lib/route-reopen';
import { reopenRefusalMessage } from '@/lib/staff/reopen-errors';

type ReopenableRouteSummary = {
  id: string;
  name?: string;
  revision?: string;
  driverInfo?: { name: string } | null;
};

type ReopenRouteResult = {
  ok: boolean;
  targetStatus: 'dispatched' | 'in_progress';
  hasPendingPayment: boolean;
  /** Só no caminho nativo: resultado do aviso ao motorista. */
  push?: 'accepted' | 'skipped_no_token' | 'failed' | 'uncertain';
};

type ReopenRouteDialogProps = {
  /** Rota a reabrir; `null` mantém o diálogo fechado. */
  route: ReopenableRouteSummary | null;
  onClose: () => void;
  /** Chamado depois de reabrir, para a lista recarregar. */
  onReopened?: () => void;
};

function successDescription(result: ReopenRouteResult) {
  if (result.push === undefined) return 'O motorista foi notificado e a rota voltou para Rotas Ativas.';
  if (result.push === 'uncertain') return 'A rota foi reaberta. O envio do aviso não pôde ser confirmado.';
  if (result.push === 'accepted') return 'A rota voltou ao app e o envio da notificação foi aceito.';
  return 'A rota voltou ao app. O envio da notificação não foi confirmado.';
}

export function ReopenRouteDialog({ route, onClose, onReopened }: ReopenRouteDialogProps) {
  const { toast } = useToast();
  const staff = useOptionalStaff();
  const commandId = useStaffReportCommandIds();
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // Cada rota abre o diálogo com o motivo em branco.
  React.useEffect(() => {
    setReason('');
  }, [route?.id]);

  const handleConfirm = async () => {
    if (!route || !isReopenReasonValid(reason)) return;
    setIsSubmitting(true);
    try {
      const trimmed = reason.trim();
      let result: ReopenRouteResult;
      if (nativeStaffEnabled) {
        if (!staff || !route.revision) throw new Error('Reabertura indisponível.');
        const command = { routeId: route.id, revision: route.revision, reason: trimmed };
        result = await staff.request<ReopenRouteResult>('/api/staff/history/reopen', {
          method: 'POST',
          body: JSON.stringify({ ...command, commandId: commandId(command) }),
        });
      } else {
        const [{ functions }, { httpsCallable }] = await Promise.all([
          import('@/lib/firebase/client'),
          import('firebase/functions'),
        ]);
        const response = await httpsCallable<{ routeId: string; reason: string }, ReopenRouteResult>(
          functions,
          'reopenRoute',
        )({ routeId: route.id, reason: trimmed });
        result = response.data;
      }

      toast({ title: 'Rota reaberta', description: successDescription(result) });
      if (result.hasPendingPayment) {
        toast({
          title: 'Há um pagamento pendente para esta rota',
          description: 'Recalcule-o em Financeiro depois que o motorista finalizar de novo.',
        });
      }
      onClose();
    } catch (error) {
      console.error('Erro ao reabrir rota:', error);
      const specific = error instanceof EarningsRequestError ? reopenRefusalMessage(error.code) : null;
      toast({
        variant: 'destructive',
        title: 'Não foi possível reabrir a rota',
        description: specific ?? (nativeStaffEnabled
          ? reportErrorMessage(error)
          : error instanceof Error ? error.message : 'Tente novamente.'),
      });
    } finally {
      onReopened?.();
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={route !== null}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reabrir rota?</DialogTitle>
          <DialogDescription>
            A rota <strong>{route?.name}</strong> voltará para{' '}
            <strong>{route?.driverInfo?.name || 'o motorista'}</strong> e sairá
            do histórico. As entregas já registradas são mantidas e o motorista
            poderá concluir as pendentes. O sistema não a finalizará sozinho
            antes de 48h.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="reopen-reason">
            Motivo da reabertura
          </label>
          <Textarea
            id="reopen-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex.: entrega pendente que o motorista ainda vai fazer"
            disabled={isSubmitting}
            rows={3}
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            Obrigatório (mínimo {MIN_REOPEN_REASON_LENGTH} caracteres). Fica
            registrado no log de atividades.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting || !isReopenReasonValid(reason)}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reabrindo...
              </>
            ) : (
              <>
                <RotateCcw className="mr-2 h-4 w-4" />
                Confirmar reabertura
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
