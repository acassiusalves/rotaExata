'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, DollarSign, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/earnings-calculator';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface EditStopValueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop: any;
  stopNumber: number;
  currentValue: number;
  onSave: (newValue: number, reason: string) => Promise<void>;
}

export function EditStopValueDialog({
  open,
  onOpenChange,
  stop,
  stopNumber,
  currentValue,
  onSave,
}: EditStopValueDialogProps) {
  const [newValue, setNewValue] = React.useState(currentValue.toFixed(2));
  const [reason, setReason] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');

  // Reseta o formulário quando o diálogo abre
  React.useEffect(() => {
    if (open) {
      setNewValue(currentValue.toFixed(2));
      setReason('');
      setError('');
    }
  }, [open, currentValue]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const valueNum = parseFloat(newValue);

    // Validações
    if (isNaN(valueNum)) {
      setError('Por favor, insira um valor numérico válido.');
      return;
    }

    if (valueNum < 0) {
      setError('O valor não pode ser negativo.');
      return;
    }

    if (valueNum === currentValue) {
      setError('O novo valor deve ser diferente do valor atual.');
      return;
    }

    if (!reason.trim()) {
      setError('Por favor, informe o motivo da alteração.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(valueNum, reason.trim());
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar alteração');
    } finally {
      setIsSubmitting(false);
    }
  };

  const difference = parseFloat(newValue) - currentValue;
  const hasChanges = !isNaN(difference) && difference !== 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar Valor da Parada</DialogTitle>
          <DialogDescription>
            Ajuste o valor pago pela Parada {stopNumber}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Informações da Parada */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Cliente:</span>
                <span className="font-medium">
                  {stop.customerName || 'Não especificado'}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status:</span>
                <span className="font-medium capitalize">
                  {stop.deliveryStatus === 'completed' ? 'Entregue' :
                   stop.deliveryStatus === 'failed' ? 'Falhou' : 'Pendente'}
                </span>
              </div>
            </div>

            {/* Valor Atual */}
            <div className="rounded-lg border p-3 bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Valor Atual:</span>
                <span className="text-lg font-semibold">
                  {formatCurrency(currentValue)}
                </span>
              </div>
            </div>

            {/* Novo Valor */}
            <div className="space-y-2">
              <Label htmlFor="newValue">Novo Valor</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="newValue"
                  type="number"
                  step="0.01"
                  min="0"
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                  disabled={isSubmitting}
                />
              </div>
              {hasChanges && (
                <p className={`text-sm ${difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {difference > 0 ? '+' : ''}{formatCurrency(difference)} em relação ao valor atual
                </p>
              )}
            </div>

            {/* Motivo */}
            <div className="space-y-2">
              <Label htmlFor="reason">
                Motivo da Alteração <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Ajuste por negociação com cliente, erro no cálculo original, etc."
                rows={3}
                disabled={isSubmitting}
              />
            </div>

            {/* Mensagem de Erro */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting || !hasChanges}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Alteração'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
