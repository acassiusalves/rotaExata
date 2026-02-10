'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { DriverPayment, PaymentStatus, Timestamp } from '@/lib/types';
import { formatCurrency } from '@/lib/earnings-calculator';

interface PaymentDetailsDialogProps {
  payment: DriverPayment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusMap: Record<PaymentStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  approved: { label: 'Aprovado', variant: 'default' },
  paid: { label: 'Pago', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
};

export function PaymentDetailsDialog({
  payment,
  open,
  onOpenChange,
}: PaymentDetailsDialogProps) {
  const formatDate = (date: Date | Timestamp | undefined) => {
    if (!date) return '-';
    const d = date instanceof Date ? date : 'toDate' in date ? date.toDate() : new Date(date);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const status = statusMap[payment.status];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Pagamento</DialogTitle>
          <DialogDescription>
            Informações completas sobre o pagamento da rota {payment.routeCode}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas */}
          <div>
            <h3 className="font-semibold mb-3">Informações Básicas</h3>
            <div className="grid gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Código da Rota:</span>
                <Badge variant="outline">{payment.routeCode}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Motorista:</span>
                <span className="font-medium">{payment.driverName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <Badge variant={status.variant}>{status.label}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rota Completada:</span>
                <span>{formatDate(payment.routeCompletedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pagamento Calculado:</span>
                <span>{formatDate(payment.calculatedAt)}</span>
              </div>
              {payment.paidAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Data do Pagamento:</span>
                  <span>{formatDate(payment.paidAt)}</span>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* Estatísticas da Rota */}
          <div>
            <h3 className="font-semibold mb-3">Estatísticas da Rota</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total de Paradas:</span>
                <span className="font-medium">{payment.routeStats.totalStops}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entregas Sucesso:</span>
                <span className="font-medium text-green-600">
                  {payment.routeStats.successfulDeliveries}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entregas Falhadas:</span>
                <span className="font-medium text-red-600">
                  {payment.routeStats.failedDeliveries}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tentativas:</span>
                <span className="font-medium">{payment.routeStats.failedWithAttempt}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Distância:</span>
                <span className="font-medium">{payment.routeStats.distanceKm.toFixed(2)} km</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pedidos Lunna:</span>
                <span className="font-medium">{payment.routeStats.lunnaOrderCount}</span>
              </div>
            </div>
          </div>

          <Separator />

          {/* Detalhamento de Ganhos */}
          <div>
            <h3 className="font-semibold mb-3">Detalhamento de Ganhos</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pagamento Base:</span>
                <span>{formatCurrency(payment.breakdown.basePay)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Ganhos por Distância ({payment.routeStats.distanceKm.toFixed(2)} km):
                </span>
                <span>{formatCurrency(payment.breakdown.distanceEarnings)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Bônus Entregas ({payment.routeStats.successfulDeliveries}):
                </span>
                <span>{formatCurrency(payment.breakdown.deliveryBonuses)}</span>
              </div>
              {payment.breakdown.failedAttemptBonuses > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Bônus Tentativas ({payment.routeStats.failedWithAttempt}):
                  </span>
                  <span>{formatCurrency(payment.breakdown.failedAttemptBonuses)}</span>
                </div>
              )}
              {payment.breakdown.stopTierBonus > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bônus Volume:</span>
                  <span>{formatCurrency(payment.breakdown.stopTierBonus)}</span>
                </div>
              )}
              {payment.breakdown.lunnaBonus > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Bônus Lunna ({payment.routeStats.lunnaOrderCount}):
                  </span>
                  <span>{formatCurrency(payment.breakdown.lunnaBonus)}</span>
                </div>
              )}
              {payment.breakdown.timeBonusAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Bônus Horário ({payment.breakdown.timeBonusMultiplier}x):
                  </span>
                  <span>{formatCurrency(payment.breakdown.timeBonusAmount)}</span>
                </div>
              )}

              <Separator className="my-2" />

              <div className="flex justify-between font-bold text-base">
                <span>Total de Ganhos:</span>
                <span className="text-primary">{formatCurrency(payment.totalEarnings)}</span>
              </div>
            </div>
          </div>

          {/* Informações de Pagamento */}
          {payment.status === 'paid' && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3">Informações de Pagamento</h3>
                <div className="space-y-2 text-sm">
                  {payment.paymentMethod && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Método:</span>
                      <span className="capitalize">{payment.paymentMethod.replace('_', ' ')}</span>
                    </div>
                  )}
                  {payment.paymentReference && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Referência:</span>
                      <span className="font-mono text-xs">{payment.paymentReference}</span>
                    </div>
                  )}
                  {payment.paidBy && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pago por:</span>
                      <span>{payment.paidBy}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Informações de Cancelamento */}
          {payment.status === 'cancelled' && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3">Informações de Cancelamento</h3>
                <div className="space-y-2 text-sm">
                  {payment.cancellationReason && (
                    <div>
                      <span className="text-muted-foreground">Motivo:</span>
                      <p className="mt-1 p-2 bg-muted rounded text-sm">{payment.cancellationReason}</p>
                    </div>
                  )}
                  {payment.cancelledAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Cancelado em:</span>
                      <span>{formatDate(payment.cancelledAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* Notas */}
          {payment.notes && (
            <>
              <Separator />
              <div>
                <h3 className="font-semibold mb-3">Notas</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{payment.notes}</p>
              </div>
            </>
          )}

          {/* Metadados */}
          <Separator />
          <div>
            <h3 className="font-semibold mb-3">Metadados</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex justify-between">
                <span>ID do Pagamento:</span>
                <span className="font-mono text-xs">{payment.id}</span>
              </div>
              <div className="flex justify-between">
                <span>ID da Rota:</span>
                <span className="font-mono text-xs">{payment.routeId}</span>
              </div>
              <div className="flex justify-between">
                <span>Versão das Regras:</span>
                <span>{payment.rulesVersion}</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
