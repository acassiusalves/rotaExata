
'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Home,
  Image as ImageIcon,
  MapPin,
  Milestone,
  User,
  Wallet,
  Truck,
  CreditCard,
} from 'lucide-react';
import type { PlaceValue, RouteInfo, Payment } from '@/lib/types';
import { Timestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Image from 'next/image';
import { RouteMapDialog, RouteDocument } from './route-map-dialog';
import { LunnaBadge } from './lunna-badge';

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(2);
const formatDuration = (durationString: string = '0s') => {
  const seconds = parseInt(durationString.replace('s', ''), 10);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};
const formatTimestamp = (ts: Timestamp | Date | undefined) => {
  if (!ts) return 'N/A';
  const date = ts instanceof Timestamp ? ts.toDate() : ts;
  return format(date, 'HH:mm', { locale: ptBR });
};

const getPaymentMethodLabel = (value?: string) => {
  const map: Record<string, string> = {
    dinheiro: 'Dinheiro',
    pix: 'PIX',
    cartao_credito: 'Cartão de Crédito',
    cartao_debito: 'Cartão de Débito',
    boleto: 'Boleto',
    outro: 'Outro',
  };
  return value ? map[value] || 'Não informado' : 'Não informado';
};

const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};


const getFailureReasonLabel = (value?: string) => {
    const map: Record<string, string> = {
        ausente: 'Cliente ausente',
        recusou: 'Cliente recusou',
        endereco_incorreto: 'Endereço incorreto',
        outro: 'Outro motivo',
    };
    return value ? map[value] || 'Motivo não especificado' : 'Motivo não especificado';
};


interface RouteDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  route: RouteDocument;
}

export function RouteDetailsDialog({
  isOpen,
  onClose,
  route,
}: RouteDetailsDialogProps) {
  const [isMapOpen, setIsMapOpen] = React.useState(false);
  
  if (!route) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <FileText />
              Detalhes da Rota: {route.name}
              {route.source === 'lunna' && <LunnaBadge />}
            </DialogTitle>
            <DialogDescription>
              Resumo completo da rota e de todas as suas paradas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-[250px_1fr] gap-6 py-4">
            {/* Sidebar */}
            <div className="space-y-6">
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Motorista</h4>
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={route.driverInfo?.avatarUrl} />
                    <AvatarFallback>
                      {route.driverInfo?.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{route.driverInfo?.name}</span>
                </div>
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Status</h4>
                <Badge variant="secondary">Concluída</Badge>
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Data</h4>
                <p className="text-sm">
                  {format(route.plannedDate.toDate(), 'dd/MM/yyyy')}
                </p>
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Duração</h4>
                <p className="text-sm">{formatDuration(route.duration)}</p>
              </div>
              <div className="space-y-1">
                <h4 className="font-semibold text-sm">Distância</h4>
                <p className="text-sm">{formatDistance(route.distanceMeters)} km</p>
              </div>
               <Button variant="outline" className="w-full" onClick={() => setIsMapOpen(true)}>
                  <MapPin className="mr-2 h-4 w-4" /> Ver no Mapa
               </Button>
            </div>

            {/* Main Content */}
            <div className="max-h-[65vh] overflow-y-auto pr-4">
              <Accordion type="single" collapsible defaultValue="item-0">
                {route.stops.map((stop, index) => (
                  <AccordionItem value={`item-${index}`} key={stop.id || index}>
                    <AccordionTrigger>
                      <div className="flex items-center gap-3 text-left">
                        {stop.deliveryStatus === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-destructive" />
                        )}
                        <span className="font-semibold">
                          Parada {index + 1}: {stop.customerName || 'Endereço'}
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pl-4">
                      <p className="text-xs text-muted-foreground">{stop.address}</p>

                      {stop.deliveryStatus === 'completed' ? (
                        <>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                                <span>Concluído às: {formatTimestamp(stop.completedAt)}</span>
                            </div>
                          </div>

                          {stop.payments && stop.payments.length > 0 && (
                            <div>
                                <h5 className="text-xs font-semibold mb-2 flex items-center gap-2"><Wallet className="h-4 w-4" /> Pagamentos</h5>
                                <div className='space-y-2'>
                                {stop.payments.map(p => (
                                    <div key={p.id} className="text-sm flex justify-between items-center bg-muted/50 p-2 rounded-md">
                                        <span>{getPaymentMethodLabel(p.method)} {p.installments ? ` (${p.installments}x)` : ''}</span>
                                        <span className="font-mono">{formatCurrency(p.value)}</span>
                                    </div>
                                ))}
                                </div>
                            </div>
                          )}

                           {stop.notes && (
                            <div>
                                <h5 className="text-xs font-semibold mb-1">Obs. do Motorista:</h5>
                                <p className="text-sm italic">"{stop.notes}"</p>
                            </div>
                          )}
                          {stop.photoUrl && (
                            <div>
                                <h5 className="text-xs font-semibold mb-1">Comprovante:</h5>
                                <a href={stop.photoUrl} target="_blank" rel="noopener noreferrer">
                                    <Image
                                        src={stop.photoUrl}
                                        alt={`Comprovante da parada ${index + 1}`}
                                        width={200}
                                        height={150}
                                        className="rounded-md object-cover border"
                                    />
                                </a>
                            </div>
                          )}
                        </>
                      ) : (
                         <div className="text-sm space-y-2">
                            <div className="flex items-center gap-2 text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                <span>Falha na entrega</span>
                            </div>
                            <p><strong>Motivo:</strong> {getFailureReasonLabel(stop.failureReason)}</p>
                            {stop.notes && <p className="italic"><strong>Obs:</strong> {stop.notes}</p>}
                        </div>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Re-use the map dialog */}
      <RouteMapDialog isOpen={isMapOpen} onClose={() => setIsMapOpen(false)} route={route} />
    </>
  );
}
