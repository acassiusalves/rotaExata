'use client';

import * as React from 'react';
import { AlertCircle, CheckCircle, Loader2, Plus, Trash2, XCircle } from 'lucide-react';
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
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { Payment } from '@/lib/types';

type DeliveryStatus = 'completed' | 'failed';

export type DeliveryReportEditValues = {
  status: DeliveryStatus;
  payments?: Payment[];
  failureReason?: string;
  adminEditReason: string;
};

export type EditableDeliveryReport = {
  customerName: string;
  routeCode?: string;
  routeName: string;
  stopIndex: number;
  orderNumber?: string;
  deliveryStatus?: DeliveryStatus;
  failureReason?: string;
  payments?: Payment[];
  expectedValue?: number;
};

type DeliveryReportEditDialogProps = {
  open: boolean;
  delivery: EditableDeliveryReport | null;
  isSaving?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: DeliveryReportEditValues) => Promise<void>;
};

const paymentMethodLabels: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  boleto: 'Boleto',
  pago_na_loja: 'Pago na Loja',
  outro: 'Outro',
};

const failureReasonLabels: Record<string, string> = {
  ausente: 'Cliente ausente',
  recusou: 'Cliente recusou',
  endereco_incorreto: 'Endereço incorreto',
  outro: 'Outro motivo',
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

const createPayment = (value = 0): Payment => ({
  id: `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  method: '',
  value,
});

const normalizePayment = (payment: Payment): Payment => ({
  id: payment.id || `payment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  method: payment.method || '',
  value: Number.isFinite(Number(payment.value)) ? Number(payment.value) : 0,
  ...(payment.installments ? { installments: payment.installments } : {}),
  ...(payment.pixType ? { pixType: payment.pixType } : {}),
});

export function DeliveryReportEditDialog({
  open,
  delivery,
  isSaving = false,
  onOpenChange,
  onSubmit,
}: DeliveryReportEditDialogProps) {
  const [status, setStatus] = React.useState<DeliveryStatus>('completed');
  const [payments, setPayments] = React.useState<Payment[]>([createPayment()]);
  const [failureReason, setFailureReason] = React.useState('');
  const [adminEditReason, setAdminEditReason] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !delivery) return;

    setStatus(delivery.deliveryStatus || 'completed');
    setFailureReason(delivery.failureReason || '');
    setAdminEditReason('');
    setError(null);

    if (delivery.payments && delivery.payments.length > 0) {
      setPayments(delivery.payments.map(normalizePayment));
    } else {
      setPayments([createPayment(delivery.expectedValue || 0)]);
    }
  }, [delivery, open]);

  if (!delivery) return null;

  const totalPayments = payments.reduce((sum, payment) => sum + (Number(payment.value) || 0), 0);

  const updatePayment = (index: number, field: keyof Payment, value: string | number) => {
    setPayments(prev =>
      prev.map((payment, paymentIndex) => {
        if (paymentIndex !== index) return payment;

        const updated: Payment = {
          ...payment,
          [field]: value,
        };

        if (field === 'method' && value !== 'cartao_credito') {
          delete updated.installments;
        }

        if (field === 'method' && value !== 'pix') {
          delete updated.pixType;
        }

        return updated;
      })
    );
  };

  const addPayment = () => {
    setPayments(prev => [...prev, createPayment()]);
  };

  const removePayment = (index: number) => {
    setPayments(prev => (prev.length > 1 ? prev.filter((_, itemIndex) => itemIndex !== index) : prev));
  };

  const handleSubmit = async () => {
    setError(null);

    if (!adminEditReason.trim()) {
      setError('Informe o motivo da correção.');
      return;
    }

    if (status === 'completed') {
      const normalizedPayments = payments.map(normalizePayment);

      for (const payment of normalizedPayments) {
        if (!payment.method) {
          setError('Selecione a forma de pagamento.');
          return;
        }

        if (payment.method !== 'pago_na_loja' && payment.value <= 0) {
          setError('Preencha o valor do pagamento maior que zero.');
          return;
        }
      }

      await onSubmit({
        status,
        payments: normalizedPayments,
        adminEditReason: adminEditReason.trim(),
      });
      return;
    }

    if (!failureReason) {
      setError('Selecione o motivo da falha.');
      return;
    }

    await onSubmit({
      status,
      failureReason,
      adminEditReason: adminEditReason.trim(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Entrega</DialogTitle>
          <DialogDescription>
            {delivery.orderNumber ? `Pedido ${delivery.orderNumber}` : 'Pedido sem número'} · Parada #{delivery.stopIndex + 1}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 rounded-md border p-3 text-sm sm:grid-cols-2">
            <div>
              <Label className="text-muted-foreground">Cliente</Label>
              <p className="font-medium">{delivery.customerName}</p>
            </div>
            <div>
              <Label className="text-muted-foreground">Rota</Label>
              <p className="font-medium">{delivery.routeCode || delivery.routeName}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status da entrega</Label>
            <RadioGroup
              value={status}
              onValueChange={(value) => setStatus(value as DeliveryStatus)}
              className="grid gap-2 sm:grid-cols-2"
              disabled={isSaving}
            >
              <Label
                htmlFor="report-delivery-completed"
                className="flex cursor-pointer items-center gap-3 rounded-md border p-3"
              >
                <RadioGroupItem id="report-delivery-completed" value="completed" disabled={isSaving} />
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span>Entregue</span>
              </Label>
              <Label
                htmlFor="report-delivery-failed"
                className="flex cursor-pointer items-center gap-3 rounded-md border p-3"
              >
                <RadioGroupItem id="report-delivery-failed" value="failed" disabled={isSaving} />
                <XCircle className="h-4 w-4 text-destructive" />
                <span>Falhou</span>
              </Label>
            </RadioGroup>
          </div>

          {status === 'completed' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Pagamento</Label>
                <div className="text-sm font-semibold text-green-700">{formatCurrency(totalPayments)}</div>
              </div>

              {payments.map((payment, index) => (
                <div key={payment.id} className="space-y-3 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Forma {index + 1}</Label>
                    {payments.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removePayment(index)}
                        disabled={isSaving}
                        aria-label="Remover pagamento"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Select
                      value={payment.method}
                      onValueChange={(value) => updatePayment(index, 'method', value)}
                      disabled={isSaving}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Forma de pagamento" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(paymentMethodLabels).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder={payment.method === 'pago_na_loja' ? 'Valor opcional' : 'Valor'}
                      value={payment.value > 0 ? String(payment.value) : ''}
                      onChange={(event) => {
                        const parsedValue = parseFloat(event.target.value);
                        updatePayment(index, 'value', Number.isFinite(parsedValue) ? parsedValue : 0);
                      }}
                      disabled={isSaving}
                    />
                  </div>

                  {payment.method === 'cartao_credito' && (
                    <div className="space-y-1">
                      <Label htmlFor={`report-payment-installments-${index}`}>Parcelas</Label>
                      <Input
                        id={`report-payment-installments-${index}`}
                        type="number"
                        min="1"
                        step="1"
                        placeholder="Ex: 1"
                        value={payment.installments || ''}
                        onChange={(event) => {
                          const parsedValue = parseInt(event.target.value, 10);
                          updatePayment(index, 'installments', Number.isFinite(parsedValue) ? parsedValue : 1);
                        }}
                        disabled={isSaving}
                      />
                    </div>
                  )}

                  {payment.method === 'pix' && (
                    <div className="space-y-2">
                      <Label>Tipo de PIX</Label>
                      <RadioGroup
                        value={payment.pixType || ''}
                        onValueChange={(value) => updatePayment(index, 'pixType', value)}
                        className="flex flex-wrap gap-4"
                        disabled={isSaving}
                      >
                        <Label htmlFor={`report-pix-qrcode-${index}`} className="flex items-center gap-2">
                          <RadioGroupItem id={`report-pix-qrcode-${index}`} value="qrcode" disabled={isSaving} />
                          QR Code
                        </Label>
                        <Label htmlFor={`report-pix-cnpj-${index}`} className="flex items-center gap-2">
                          <RadioGroupItem id={`report-pix-cnpj-${index}`} value="cnpj" disabled={isSaving} />
                          CNPJ
                        </Label>
                      </RadioGroup>
                    </div>
                  )}
                </div>
              ))}

              {payments.length < 2 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={addPayment}
                  disabled={isSaving}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar pagamento
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Motivo da falha</Label>
              <RadioGroup
                value={failureReason}
                onValueChange={setFailureReason}
                className="grid gap-2 sm:grid-cols-2"
                disabled={isSaving}
              >
                {Object.entries(failureReasonLabels).map(([value, label]) => (
                  <Label key={value} htmlFor={`report-failure-${value}`} className="flex items-center gap-2 rounded-md border p-3">
                    <RadioGroupItem id={`report-failure-${value}`} value={value} disabled={isSaving} />
                    {label}
                  </Label>
                ))}
              </RadioGroup>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="report-admin-edit-reason">Motivo da correção</Label>
            <Textarea
              id="report-admin-edit-reason"
              value={adminEditReason}
              onChange={(event) => setAdminEditReason(event.target.value)}
              placeholder="Ex: pedido entregue, mas finalizado como falha"
              rows={3}
              disabled={isSaving}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar correção
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
