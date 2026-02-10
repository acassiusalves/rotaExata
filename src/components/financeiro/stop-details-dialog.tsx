'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  MapPin,
  User,
  Phone,
  Mail,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Calendar,
  Navigation,
  MessageSquare,
  DollarSign,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/earnings-calculator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface StopDetailsDialogProps {
  stop: any;
  stopNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const getPaymentMethodLabel = (method: string) => {
  const labels: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao_credito: 'Cartão de Crédito',
    cartao_debito: 'Cartão de Débito',
    boleto: 'Boleto',
  };
  return labels[method] || method;
};

export function StopDetailsDialog({
  stop,
  stopNumber,
  open,
  onOpenChange,
}: StopDetailsDialogProps) {
  if (!stop) return null;

  const getStatusBadge = () => {
    if (stop.deliveryStatus === 'completed') {
      return (
        <Badge className="bg-green-600 hover:bg-green-700">
          <CheckCircle className="mr-1 h-3 w-3" />
          Entregue
        </Badge>
      );
    }
    if (stop.deliveryStatus === 'failed') {
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Falhou
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <AlertCircle className="mr-1 h-3 w-3" />
        Pendente
      </Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da Entrega</DialogTitle>
          <DialogDescription>
            Informações completas sobre a entrega #{stopNumber}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="info" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="info">Informações</TabsTrigger>
            <TabsTrigger value="payment">Pagamento</TabsTrigger>
            <TabsTrigger value="proof">Comprovantes</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Cliente</label>
                <p className="text-sm font-semibold">{stop.customerName || 'Nome não informado'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <div className="mt-1">{getStatusBadge()}</div>
              </div>
              <div className="col-span-2">
                <label className="text-sm font-medium text-muted-foreground">Endereço</label>
                <p className="text-sm">
                  {stop.addressString || stop.address?.formattedAddress || stop.address || 'Endereço não disponível'}
                </p>
                {stop.complemento && (
                  <p className="text-xs text-muted-foreground mt-1">{stop.complemento}</p>
                )}
                {(stop.bairro || stop.cidade) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {[stop.bairro, stop.cidade, stop.state].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              {(stop.lat && stop.lng) && (
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Coordenadas</label>
                  <p className="text-sm font-mono text-xs">
                    {stop.lat.toFixed(6)}, {stop.lng.toFixed(6)}
                  </p>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                <p className="text-sm">
                  {stop.customerPhone || stop.phone ? (
                    <a
                      href={`tel:${stop.customerPhone || stop.phone}`}
                      className="text-primary hover:underline"
                    >
                      {stop.customerPhone || stop.phone}
                    </a>
                  ) : (
                    '-'
                  )}
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Pedido</label>
                <p className="text-sm">{stop.orderNumber || '-'}</p>
              </div>
              {stop.completedAt && (
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Entregue em</label>
                  <p className="text-sm">
                    {stop.completedAt instanceof Date
                      ? format(stop.completedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : stop.completedAt.toDate
                      ? format(stop.completedAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      : new Date(stop.completedAt).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
              {stop.failureReason && (
                <>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Motivo da Falha</label>
                    <p className="text-sm text-red-600">{stop.failureReason}</p>
                  </div>
                  {stop.wentToLocation !== undefined && (
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Foi até o local?</label>
                      <p className="text-sm">
                        {stop.wentToLocation ? (
                          <span className="text-green-600 font-medium">✓ Sim, foi até o local</span>
                        ) : (
                          <span className="text-red-600 font-medium">✗ Não foi até o local</span>
                        )}
                      </p>
                    </div>
                  )}
                  {stop.attemptPhotoUrl && (
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Foto do Local (Comprovante de Tentativa)</label>
                      <div className="mt-2">
                        <img
                          src={stop.attemptPhotoUrl}
                          alt="Foto da tentativa de entrega"
                          className="rounded-lg border max-w-md cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(stop.attemptPhotoUrl, '_blank')}
                        />
                        <p className="text-xs text-muted-foreground mt-1">Clique para ampliar</p>
                      </div>
                    </div>
                  )}
                </>
              )}
              {stop.notes && (
                <div className="col-span-2">
                  <label className="text-sm font-medium text-muted-foreground">Observações</label>
                  <p className="text-sm whitespace-pre-wrap">{stop.notes}</p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="payment" className="space-y-4 mt-4">
            {stop.payments && stop.payments.length > 0 ? (
              <div className="space-y-3">
                {stop.payments.map((payment: any, idx: number) => (
                  <Card key={idx}>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Método</label>
                          <p className="text-sm font-semibold capitalize">
                            {getPaymentMethodLabel(payment.method)}
                            {payment.method === 'pix' && payment.pixType && (
                              <span className="ml-2 text-xs font-normal text-muted-foreground">
                                ({payment.pixType === 'qrcode' ? 'QR Code' : 'CNPJ'})
                              </span>
                            )}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Valor</label>
                          <p className="text-sm font-semibold text-green-600">
                            {formatCurrency(payment.value || 0)}
                          </p>
                        </div>
                        {payment.installments && (
                          <div className="col-span-2">
                            <label className="text-sm font-medium text-muted-foreground">Parcelas</label>
                            <p className="text-sm">{payment.installments}x</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <div className="pt-4 border-t">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Total:</span>
                    <span className="text-xl font-bold text-green-600">
                      {formatCurrency(
                        stop.payments.reduce((s: number, p: any) => s + (p.value || 0), 0)
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma informação de pagamento registrada
              </p>
            )}
          </TabsContent>

          <TabsContent value="proof" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 gap-4">
              {stop.photoUrl && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Foto da Entrega
                  </label>
                  <img
                    src={stop.photoUrl}
                    alt="Comprovante"
                    className="w-full rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(stop.photoUrl, '_blank')}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Clique para ampliar</p>
                </div>
              )}
              {stop.signatureUrl && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    Assinatura
                  </label>
                  <img
                    src={stop.signatureUrl}
                    alt="Assinatura"
                    className="w-full rounded-lg border bg-white cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(stop.signatureUrl, '_blank')}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Clique para ampliar</p>
                </div>
              )}
              {!stop.photoUrl && !stop.signatureUrl && (
                <p className="text-center text-muted-foreground py-8">
                  Nenhum comprovante registrado
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
