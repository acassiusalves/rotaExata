
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
  ArrowRight,
  ArrowRightLeft,
  Info,
  Trash2,
  Package,
} from 'lucide-react';
import type { PlaceValue, RouteInfo, Payment, ActivityLogEntry } from '@/lib/types';
import { Timestamp, collection, query, where, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
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
  const [removedStops, setRemovedStops] = React.useState<ActivityLogEntry[]>([]);
  const [destinationRoutes, setDestinationRoutes] = React.useState<Record<string, { routeCode: string; routeId: string }>>({});

  // Buscar paradas que foram removidas desta rota
  React.useEffect(() => {
    if (!route?.id) return;

    const q = query(
      collection(db, 'activity_log'),
      where('routeId', '==', route.id),
      where('eventType', '==', 'point_removed_from_route'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const entries: ActivityLogEntry[] = [];
      snapshot.forEach((doc) => {
        entries.push({ id: doc.id, ...doc.data() } as ActivityLogEntry & { id: string });
      });
      setRemovedStops(entries);

      // Para cada ponto removido, buscar se foi transferido para outra rota
      const destinations: Record<string, { routeCode: string; routeId: string }> = {};
      for (const entry of entries) {
        const pointId = entry.pointId || entry.entityId;
        if (!pointId) continue;

        // Buscar transferência (point_transferred) com esse pointId como origem
        const transferQuery = query(
          collection(db, 'activity_log'),
          where('pointId', '==', pointId),
          where('eventType', '==', 'point_transferred'),
          orderBy('timestamp', 'desc'),
          limit(1)
        );
        const transferSnap = await getDocs(transferQuery);
        if (!transferSnap.empty) {
          const transferData = transferSnap.docs[0].data();
          if (transferData.metadata?.targetRouteName || transferData.metadata?.targetRouteId) {
            destinations[pointId] = {
              routeCode: transferData.metadata.targetRouteName || 'Rota desconhecida',
              routeId: transferData.metadata.targetRouteId || '',
            };
          }
        }

        // Se não achou transferência, buscar point_added_to_route em outra rota
        if (!destinations[pointId]) {
          const addedQuery = query(
            collection(db, 'activity_log'),
            where('pointId', '==', pointId),
            where('eventType', '==', 'point_added_to_route'),
            orderBy('timestamp', 'desc'),
            limit(1)
          );
          const addedSnap = await getDocs(addedQuery);
          if (!addedSnap.empty) {
            const addedData = addedSnap.docs[0].data();
            if (addedData.routeId && addedData.routeId !== route.id) {
              destinations[pointId] = {
                routeCode: addedData.routeCode || 'Rota desconhecida',
                routeId: addedData.routeId,
              };
            }
          }
        }
      }
      setDestinationRoutes(destinations);
    });

    return () => unsubscribe();
  }, [route?.id]);

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
                      <div className="flex items-center gap-3 text-left w-full">
                        {stop.deliveryStatus === 'completed' ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-destructive shrink-0" />
                        )}
                        <span className="font-semibold flex-1">
                          Parada {index + 1}: {stop.customerName || 'Endereço'}
                        </span>
                        {stop.previousRouteCode && (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 shrink-0">
                            <ArrowRight className="h-3 w-3 mr-1" />
                            De {stop.previousRouteCode}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pl-4">
                      <p className="text-xs text-muted-foreground">{stop.address}</p>

                      {stop.previousRouteCode && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2 text-amber-900">
                            <Info className="h-4 w-4" />
                            <span className="font-semibold text-sm">Parada Transferida</span>
                          </div>
                          <div className="text-sm text-amber-800 space-y-1">
                            <p>
                              <strong>Rota de Origem:</strong> {stop.previousRouteCode}
                              {stop.movedFromPointCode && ` (${stop.movedFromPointCode})`}
                            </p>
                            {stop.movedAt && (
                              <p>
                                <strong>Transferida em:</strong>{' '}
                                {format(
                                  stop.movedAt instanceof Timestamp ? stop.movedAt.toDate() : new Date(stop.movedAt),
                                  "dd/MM/yyyy 'às' HH:mm",
                                  { locale: ptBR }
                                )}
                              </p>
                            )}
                            {stop.movedByName && (
                              <p>
                                <strong>Transferida por:</strong> {stop.movedByName}
                              </p>
                            )}
                            {stop.moveReason && (
                              <p>
                                <strong>Motivo:</strong> {stop.moveReason}
                              </p>
                            )}
                          </div>
                        </div>
                      )}

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

              {removedStops.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                    Paradas Removidas desta Rota ({removedStops.length})
                  </h4>
                  <div className="space-y-3">
                    {removedStops.map((entry) => {
                      const pointId = entry.pointId || entry.entityId;
                      const destination = pointId ? destinationRoutes[pointId] : null;
                      const deliveryStatus = entry.metadata?.deliveryStatus;
                      const customerName = entry.metadata?.customerName;
                      const orderNumber = entry.metadata?.orderNumber;

                      return (
                        <div
                          key={entry.id}
                          className="bg-muted/50 rounded-lg p-3 text-sm space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              {deliveryStatus === 'failed' ? (
                                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                              ) : (
                                <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                              )}
                              <span className="font-medium truncate">
                                {customerName || entry.metadata?.address || 'Endereço'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {deliveryStatus === 'failed' && (
                                <Badge variant="destructive" className="text-xs">
                                  Falha
                                </Badge>
                              )}
                              {entry.pointCode && (
                                <Badge variant="outline" className="text-xs">
                                  {entry.pointCode}
                                </Badge>
                              )}
                            </div>
                          </div>

                          {customerName && entry.metadata?.address && (
                            <p className="text-xs text-muted-foreground pl-6">{entry.metadata.address}</p>
                          )}

                          {orderNumber && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-6">
                              <Package className="h-3 w-3" />
                              <span>Pedido: {orderNumber}</span>
                            </div>
                          )}

                          <div className="flex items-center justify-between pl-6">
                            <p className="text-xs text-muted-foreground">
                              Removida em {format((entry.timestamp as Timestamp).toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              {entry.userName && ` por ${entry.userName}`}
                            </p>
                            {destination && (
                              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300 text-xs">
                                <ArrowRightLeft className="h-3 w-3 mr-1" />
                                Transferido para {destination.routeCode}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Re-use the map dialog */}
      <RouteMapDialog isOpen={isMapOpen} onClose={() => setIsMapOpen(false)} route={route} />
    </>
  );
}
