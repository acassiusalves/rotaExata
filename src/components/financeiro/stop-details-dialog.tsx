'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
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
} from 'lucide-react';
import { formatCurrency } from '@/lib/earnings-calculator';

interface StopDetailsDialogProps {
  stop: any;
  stopNumber: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StopDetailsDialog({
  stop,
  stopNumber,
  open,
  onOpenChange,
}: StopDetailsDialogProps) {
  if (!stop) return null;

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          icon: CheckCircle,
          label: 'Entregue',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
        };
      case 'failed':
        return {
          icon: XCircle,
          label: 'Falhou',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
        };
      default:
        return {
          icon: Clock,
          label: 'Pendente',
          color: 'text-gray-400',
          bgColor: 'bg-gray-50',
        };
    }
  };

  const statusInfo = getStatusInfo(stop.deliveryStatus);
  const StatusIcon = statusInfo.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Parada {stopNumber}
          </DialogTitle>
        </DialogHeader>

        <div className={`p-4 rounded-lg ${statusInfo.bgColor} flex items-center gap-3`}>
          <StatusIcon className={`h-6 w-6 ${statusInfo.color}`} />
          <div>
            <p className={`font-semibold ${statusInfo.color}`}>
              {statusInfo.label}
            </p>
            {stop.wentToLocation && stop.deliveryStatus === 'failed' && (
              <p className="text-sm text-muted-foreground">
                Motorista foi até o local
              </p>
            )}
          </div>
        </div>

        <Tabs defaultValue="delivery" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="delivery">Dados da Entrega</TabsTrigger>
            <TabsTrigger value="customer">Dados do Cliente</TabsTrigger>
          </TabsList>

          <TabsContent value="delivery" className="space-y-4 mt-4">
            {/* Endereço */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      Endereço
                    </p>
                    <p className="text-sm">
                      {stop.addressString || stop.address?.formattedAddress || stop.address || 'Endereço não disponível'}
                    </p>
                    {stop.complemento && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {stop.complemento}
                      </p>
                    )}
                    {(stop.bairro || stop.cidade) && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {[stop.bairro, stop.cidade, stop.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                {(stop.lat && stop.lng) && (
                  <div className="flex items-start gap-3">
                    <Navigation className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        Coordenadas
                      </p>
                      <p className="text-sm font-mono text-xs">
                        {stop.lat.toFixed(6)}, {stop.lng.toFixed(6)}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Informações da Entrega */}
            <Card>
              <CardContent className="pt-6 space-y-3">
                {stop.deliveryTime && (
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        Horário da Entrega
                      </p>
                      <p className="text-sm">
                        {new Date(stop.deliveryTime).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                )}

                {stop.expectedTime && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        Horário Esperado
                      </p>
                      <p className="text-sm">
                        {new Date(stop.expectedTime).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  </div>
                )}

                {stop.packages && stop.packages.length > 0 && (
                  <div className="flex items-start gap-3">
                    <Package className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        Pacotes ({stop.packages.length})
                      </p>
                      <div className="space-y-1 mt-2">
                        {stop.packages.map((pkg: any, idx: number) => (
                          <div key={idx} className="text-sm bg-muted p-2 rounded">
                            <p className="font-medium">{pkg.description || `Pacote ${idx + 1}`}</p>
                            {pkg.weight && (
                              <p className="text-xs text-muted-foreground">
                                Peso: {pkg.weight}kg
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {stop.orderNumber && (
                  <div className="flex items-start gap-3">
                    <Package className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        Número do Pedido
                      </p>
                      <p className="text-sm font-mono">{stop.orderNumber}</p>
                    </div>
                  </div>
                )}

                {stop.notes && (
                  <div className="flex items-start gap-3">
                    <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        Observações
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{stop.notes}</p>
                    </div>
                  </div>
                )}

                {stop.deliveryStatus === 'failed' && stop.failureReason && (
                  <div className="flex items-start gap-3">
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-600">
                        Motivo da Falha
                      </p>
                      <p className="text-sm">{stop.failureReason}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="customer" className="space-y-4 mt-4">
            <Card>
              <CardContent className="pt-6 space-y-3">
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      Nome do Cliente
                    </p>
                    <p className="text-sm font-semibold">
                      {stop.customerName || 'Nome não informado'}
                    </p>
                  </div>
                </div>

                {(stop.customerPhone || stop.phone) && (
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        Telefone
                      </p>
                      <a
                        href={`tel:${stop.customerPhone || stop.phone}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {stop.customerPhone || stop.phone}
                      </a>
                    </div>
                  </div>
                )}

                {stop.customerEmail && (
                  <div className="flex items-start gap-3">
                    <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        E-mail
                      </p>
                      <a
                        href={`mailto:${stop.customerEmail}`}
                        className="text-sm text-primary hover:underline"
                      >
                        {stop.customerEmail}
                      </a>
                    </div>
                  </div>
                )}

                {stop.customerDocument && (
                  <div className="flex items-start gap-3">
                    <User className="h-5 w-5 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-muted-foreground">
                        CPF/CNPJ
                      </p>
                      <p className="text-sm font-mono">{stop.customerDocument}</p>
                    </div>
                  </div>
                )}

                {!stop.customerPhone && !stop.customerEmail && !stop.customerDocument && (
                  <div className="text-center py-8 text-muted-foreground">
                    <p className="text-sm">Informações adicionais não disponíveis</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
