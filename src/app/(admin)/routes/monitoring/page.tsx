
'use client';

import * as React from 'react';
import {
  Home,
  Loader2,
  Route as RouteIcon,
  MapPin,
  Phone,
  Package,
  Clock,
  Camera,
  FileText,
  CheckCircle,
  XCircle,
  DollarSign,
  User,
  ClipboardList,
} from 'lucide-react';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase/client';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RouteMapDialog } from '@/components/routes/route-map-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  driverInfo: {
    name: string;
    vehicle: { type: string, plate: string };
  } | null;
  plannedDate: Timestamp;
  origin: PlaceValue;
};

const DateBadge: React.FC<{ date: Date }> = ({ date }) => (
  <div className="flex flex-col items-center justify-center rounded-md border bg-card p-1 text-center text-sm">
    <span className="text-xs font-bold uppercase text-primary">
      {format(date, 'MMM', { locale: ptBR })}
    </span>
    <span className="text-lg font-bold leading-none">
      {format(date, 'dd')}
    </span>
  </div>
);

const Rotograma: React.FC<{
  stops: PlaceValue[],
  color?: string,
  onStopClick?: (stop: PlaceValue, index: number) => void
}> = ({ stops, color, onStopClick }) => (
  <div className="flex items-center gap-1">
    <div
      className="flex h-7 w-7 items-center justify-center rounded-md"
      style={{ backgroundColor: color || 'hsl(var(--accent))' }}
    >
      <Home className="h-4 w-4 text-white" />
    </div>
    {stops.slice(0, 10).map((stop, index) => {
      const isCompleted = stop.deliveryStatus === 'completed';
      const isFailed = stop.deliveryStatus === 'failed';

      return (
        <div
          key={stop.id || index}
          className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-semibold transition-colors ${
            isCompleted
              ? 'bg-green-500 text-white border-green-600 cursor-pointer hover:bg-green-600'
              : isFailed
              ? 'bg-red-500 text-white border-red-600 cursor-pointer hover:bg-red-600'
              : 'bg-muted text-muted-foreground'
          }`}
          title={stop.address}
          onClick={() => {
            if ((isCompleted || isFailed) && onStopClick) {
              onStopClick(stop, index);
            }
          }}
        >
          {index + 1}
        </div>
      );
    })}
    {stops.length > 10 && (
      <div className="text-xs text-muted-foreground">+{stops.length - 10}</div>
    )}
  </div>
);

export default function MonitoringPage() {
  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedRoute, setSelectedRoute] = React.useState<RouteDocument | null>(null);
  const [isMapOpen, setIsMapOpen] = React.useState(false);
  const [selectedStop, setSelectedStop] = React.useState<{ stop: PlaceValue; index: number } | null>(null);
  const [isStopInfoOpen, setIsStopInfoOpen] = React.useState(false);

  React.useEffect(() => {
    const q = query(collection(db, 'routes'), orderBy('plannedDate', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const routesData: RouteDocument[] = [];
        querySnapshot.forEach((doc) => {
          routesData.push({
            id: doc.id,
            ...doc.data(),
          } as RouteDocument);
        });
        setRoutes(routesData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching routes: ', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const getInitials = (name: string) => {
    if (!name) return 'N/A';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name.substring(0, 2);
  };
  
  const handleOpenMap = (route: RouteDocument) => {
    setSelectedRoute(route);
    setIsMapOpen(true);
  };

  const handleStopClick = (stop: PlaceValue, index: number) => {
    setSelectedStop({ stop, index });
    setIsStopInfoOpen(true);
  };

  const getRouteStats = (stops: PlaceValue[]) => {
    const completed = stops.filter(s => s.deliveryStatus === 'completed').length;
    const failed = stops.filter(s => s.deliveryStatus === 'failed').length;
    const total = stops.length;
    const occurrences = total;

    return { completed, failed, total, occurrences };
  };

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <Card className="min-h-[400px] flex items-center justify-center border-dashed">
        <CardContent className="text-center pt-6">
          <RouteIcon className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">
            Nenhuma Rota para Monitorar
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            As rotas despachadas e em andamento aparecerão aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-md border bg-card text-card-foreground shadow-sm">
          {/* Header */}
          <div className="grid grid-cols-12 gap-4 border-b px-4 py-2 font-medium text-muted-foreground">
            <div className="col-span-1">Data</div>
            <div className="col-span-2">Operador</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1 text-center">Ocorrências</div>
            <div className="col-span-1 text-center">Sucessos</div>
            <div className="col-span-1 text-center">Falhas</div>
            <div className="col-span-1 text-center">Sucessos</div>
            <div className="col-span-3">Rotograma</div>
            <div className="col-span-1 text-right"></div>
          </div>
          {/* Body */}
          <div className="divide-y">
            {routes.map((route) => {
              const stats = getRouteStats(route.stops);
              return (
                <div
                  key={route.id}
                  className="grid grid-cols-12 gap-4 items-center px-4 py-3"
                >
                  <div className="col-span-1">
                    <DateBadge date={route.plannedDate.toDate()} />
                  </div>
                  <div className="col-span-2 flex items-center gap-2">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>
                        {route.driverInfo ? getInitials(route.driverInfo.name) : 'N/A'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{route.driverInfo?.name || 'Não atribuído'}</p>
                      <p className="text-xs text-muted-foreground">
                        {route.driverInfo?.vehicle?.plate ? `${route.driverInfo?.vehicle.type} - ${route.driverInfo?.vehicle.plate}` : 'Veículo não informado'}
                      </p>
                    </div>
                  </div>
                  <div className="col-span-1">
                    <Badge variant="secondary">{route.status}</Badge>
                  </div>
                  <div className="col-span-1 text-center font-medium">{stats.occurrences}/{stats.total}</div>
                  <div className="col-span-1 text-center font-medium">{stats.completed + stats.failed}/{stats.total}</div>
                  <div className="col-span-1 text-center font-medium text-destructive">{stats.failed}</div>
                  <div className="col-span-1 text-center font-medium text-green-600">{stats.completed}</div>
                  <div className="col-span-3">
                    <Rotograma stops={route.stops} color={route.color} onStopClick={handleStopClick} />
                  </div>
                  <div className="col-span-1 text-right">
                    <Button variant="link" size="sm" onClick={() => handleOpenMap(route)}>
                      VER MAPA
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {selectedRoute && (
          <RouteMapDialog
              isOpen={isMapOpen}
              onClose={() => setIsMapOpen(false)}
              route={selectedRoute}
          />
      )}

      {/* Dialog de Informações da Parada */}
      <Dialog open={isStopInfoOpen} onOpenChange={setIsStopInfoOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedStop?.stop.deliveryStatus === 'completed' ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Entrega Concluída - Parada #{(selectedStop?.index || 0) + 1}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span>Entrega Falhou - Parada #{(selectedStop?.index || 0) + 1}</span>
                </div>
              )}
            </DialogTitle>
            <DialogDescription>
              Informações registradas pelo motorista no momento da confirmação
            </DialogDescription>
          </DialogHeader>

          {selectedStop && (
            <Tabs defaultValue="delivery" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="delivery" className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Dados da Entrega
                </TabsTrigger>
                <TabsTrigger value="customer" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Dados do Cliente
                </TabsTrigger>
              </TabsList>

              {/* Aba: Dados da Entrega */}
              <TabsContent value="delivery" className="space-y-6 pt-4">
                {/* Horários */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Horários</h3>
                  <div className="space-y-2">
                    {selectedStop.stop.arrivedAt && (() => {
                      try {
                        const date = selectedStop.stop.arrivedAt instanceof Timestamp
                          ? selectedStop.stop.arrivedAt.toDate()
                          : new Date(selectedStop.stop.arrivedAt);

                        if (isNaN(date.getTime())) return null;

                        return (
                          <div className="flex items-start gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Chegada</p>
                              <p className="text-sm text-muted-foreground">
                                {format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                        );
                      } catch (error) {
                        console.error('Erro ao formatar data de chegada:', error);
                        return null;
                      }
                    })()}

                    {selectedStop.stop.completedAt && (() => {
                      try {
                        const date = selectedStop.stop.completedAt instanceof Timestamp
                          ? selectedStop.stop.completedAt.toDate()
                          : new Date(selectedStop.stop.completedAt);

                        if (isNaN(date.getTime())) return null;

                        return (
                          <div className="flex items-start gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Conclusão</p>
                              <p className="text-sm text-muted-foreground">
                                {format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                        );
                      } catch (error) {
                        console.error('Erro ao formatar data de conclusão:', error);
                        return null;
                      }
                    })()}
                  </div>
                </div>

                {/* Pagamentos */}
                {selectedStop.stop.payments && selectedStop.stop.payments.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase">Pagamentos</h3>
                    <div className="space-y-2">
                      {selectedStop.stop.payments.map((payment, idx) => (
                        <div key={payment.id || idx} className="flex items-start gap-3">
                          <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{payment.method}</p>
                            <p className="text-sm text-muted-foreground">
                              R$ {payment.value.toFixed(2)}
                              {payment.installments && ` (${payment.installments}x)`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Motivo da Falha */}
                {selectedStop.stop.deliveryStatus === 'failed' && selectedStop.stop.failureReason && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase">Motivo da Falha</h3>
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                      <p className="text-sm text-red-900">{selectedStop.stop.failureReason}</p>
                    </div>
                  </div>
                )}

                {/* Foto */}
                {selectedStop.stop.photoUrl && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase flex items-center gap-2">
                      <Camera className="h-4 w-4" />
                      Foto da Entrega
                    </h3>
                    <div className="rounded-lg overflow-hidden border">
                      <img
                        src={selectedStop.stop.photoUrl}
                        alt="Foto da entrega"
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                )}

                {/* Assinatura */}
                {selectedStop.stop.signatureUrl && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Assinatura
                    </h3>
                    <div className="rounded-lg overflow-hidden border bg-white">
                      <img
                        src={selectedStop.stop.signatureUrl}
                        alt="Assinatura"
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                )}

                {/* Observações da Entrega */}
                {selectedStop.stop.notes && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase">Observações da Entrega</h3>
                    <div className="rounded-lg bg-muted p-3">
                      <p className="text-sm">{selectedStop.stop.notes}</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Aba: Dados do Cliente */}
              <TabsContent value="customer" className="space-y-6 pt-4">
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Informações do Cliente</h3>
                  <div className="space-y-4">
                    {selectedStop.stop.customerName && (
                      <div className="flex items-start gap-3">
                        <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Nome</p>
                          <p className="text-sm text-muted-foreground">{selectedStop.stop.customerName}</p>
                        </div>
                      </div>
                    )}

                    {selectedStop.stop.phone && (
                      <div className="flex items-start gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Telefone</p>
                          <p className="text-sm text-muted-foreground">{selectedStop.stop.phone}</p>
                        </div>
                      </div>
                    )}

                    {selectedStop.stop.orderNumber && (
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Número do Pedido</p>
                          <p className="text-sm text-muted-foreground">{selectedStop.stop.orderNumber}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Endereço</p>
                        <p className="text-sm text-muted-foreground">{selectedStop.stop.address}</p>
                      </div>
                    </div>

                    {/* Janela de Tempo */}
                    {(selectedStop.stop.timeWindowStart || selectedStop.stop.timeWindowEnd) && (
                      <div className="flex items-start gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Janela de Atendimento</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedStop.stop.timeWindowStart && selectedStop.stop.timeWindowEnd
                              ? `${selectedStop.stop.timeWindowStart} às ${selectedStop.stop.timeWindowEnd}`
                              : selectedStop.stop.timeWindowStart || selectedStop.stop.timeWindowEnd}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
