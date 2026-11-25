
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import {
  ChevronLeft,
  Navigation,
  Loader2,
  MapPin,
  Clock,
  Milestone,
  PlayCircle,
  CheckCircle2,
  StopCircle,
  RadioTower,
  XCircle,
  Info,
  Pencil,
  Package,
  RefreshCw,
  DollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useDriverRuntime } from '@/components/driver/driver-runtime';
import { useDriverResource } from '@/hooks/use-driver-resource';
import { driverCommand,driverQuery } from '@/lib/driver/runtime-client';
import { routeActionProblem } from '@/lib/driver/route-action-feedback';
import type { DriverRoute,DriverNotice,DriverDeliveryValidation } from '@/lib/driver/runtime-contract';
import { EarningsRequestError } from '@/components/earnings/earnings-shell';
import type { PlaceValue, Payment } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import WhatsAppIcon from '@/components/icons/whatsapp-icon';
import { useGeolocationTracking } from '@/hooks/use-geolocation-tracking';
import { useToast } from '@/hooks/use-toast';
import { DeliveryConfirmationDialog } from '@/components/delivery/delivery-confirmation-dialog';
import { RouteChangesNotification } from '@/components/driver/route-changes-notification';
import { StopChangeBadge } from '@/components/driver/stop-change-badge';
import { RouteStartCard } from '@/components/driver/route-start-card';

const getInitials = (name: string) => {
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name.substring(0, 2);
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(1);
const formatDuration = (durationString: string = '0s') => {
  const seconds = parseInt(durationString.replace('s', ''), 10);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};


export default function RouteDetailsPage() {
  const params = useParams();
  const routeId = params?.id as string;
  const { profile:user,request,endpoint,readOnly }=useDriverRuntime();
  const detail=useDriverResource<{route:DriverRoute;notice:DriverNotice|null;deliveryValidation:DriverDeliveryValidation}>(driverQuery(endpoint,'routes',{id:routeId}),6000);
  const route=detail.data?.route;
  const [dismissed, setDismissed] = React.useState<string>();
  const notification=detail.data?.notice?.fingerprint!==dismissed ? detail.data?.notice?.notification ?? null : null;
  const isLoading=detail.loading;

  async function routeAction<Result=unknown>(action:string,details:Record<string,unknown>={}):Promise<Result> {
    const result=await driverCommand<Result>(request,endpoint,{kind:'route',command:{action,routeId,...details}});
    detail.refresh();
    return result;
  }

  const [selectedStop, setSelectedStop] = React.useState<PlaceValue | null>(null);
  const confirmationAttempt=React.useRef<{signature:string;requestId:string;media:Partial<Record<'delivery'|'attempt',{id:string;url:string}>>} | undefined>(undefined);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = React.useState(false);
  const [isAcknowledging, setIsAcknowledging] = React.useState(false);
  const [isStarting, setIsStarting] = React.useState(false);
  const { toast } = useToast();

  // GPS Tracking
  const { location, isTracking, trackingHealth, startTracking, stopTracking, error } = useGeolocationTracking({
    routeId,
    enabled:!readOnly && (route?.status==='dispatched' || route?.status==='in_progress'),
    enableHighAccuracy: true,
    updateInterval: 5000, // 5 segundos
    distanceFilter: 10, // 10 metros
  });

  // Auto-restart tracking if route is in_progress and tracking is not active
  React.useEffect(() => {
    if (!route) return;

    // Se a rota está em progresso mas o tracking não está ativo, reinicia automaticamente
    if (route.status === 'in_progress' && !isTracking && !readOnly) {
      console.log('🔄 [Auto-restart] Rota em progresso detectada, reiniciando tracking...');
      startTracking();
    }
  }, [route?.status, isTracking, startTracking]);

  // Monitor tracking health and show alerts
  React.useEffect(() => {
    if (!isTracking || route?.status!=='in_progress') return;

    if (trackingHealth === 'error') {
      toast({
        variant: 'destructive',
        title: 'GPS com problemas',
        description: 'Tentando reconectar automaticamente. Verifique se o GPS está ativado.',
      });
    } else if (trackingHealth === 'warning') {
      toast({
        variant: 'default',
        title: 'GPS instável',
        description: 'Sinal de GPS fraco. A localização pode não estar sendo atualizada.',
      });
    }
  }, [trackingHealth, isTracking, route?.status, toast]);

  const handleAcknowledgeChanges = async () => {
    if (!notification) return;
    if (readOnly) return;

    setIsAcknowledging(true);
    try {
      await routeAction('acknowledge', { fingerprint: detail.data?.notice?.fingerprint });

      toast({
        title: 'Alterações confirmadas',
        description: 'Você confirmou o recebimento das alterações.',
      });

      detail.refresh();
    } catch (error) {
      console.error('Error acknowledging changes:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível confirmar as alterações.',
      });
    } finally {
      setIsAcknowledging(false);
    }
  };

  const handleNavigation = (stop: PlaceValue, app: 'google' | 'waze') => {
    if (!stop) return;

    let url: string;

    if (app === 'waze') {
      if (stop.lat && stop.lng) {
        url = `https://waze.com/ul?ll=${stop.lat},${stop.lng}&navigate=yes`;
      } else {
        url = `https://waze.com/ul?q=${encodeURIComponent(stop.address)}`;
      }
    } else {
      const query = stop.lat && stop.lng
        ? `${stop.lat},${stop.lng}`
        : encodeURIComponent(stop.address);
      url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    }

    window.location.href = url;
  };

  const handleWhatsApp = (phone: string | undefined, customerName?: string) => {
    if (!phone) return;

    // Pega o primeiro nome do cliente
    const firstName = customerName ? customerName.split(' ')[0] : '';

    // Monta a mensagem personalizada
    const message = firstName
      ? `Olá ${firstName}! Sou entregador da Sol de Maria e seu pedido está em rota de entrega. 🛵\n\nPara facilitar, ENVIE SUA LOCALIZAÇÃO 📍 e tire o celular do silencioso, pois entrarei em contato quando chegar ao seu endereço.`
      : `Olá! Sou entregador da Sol de Maria e seu pedido está em rota de entrega. 🛵\n\nPara facilitar, ENVIE SUA LOCALIZAÇÃO 📍 e tire o celular do silencioso, pois entrarei em contato quando chegar ao seu endereço.`;

    const sanitizedPhone = phone.replace(/\D/g, ''); // Remove non-digit characters
    const encodedMessage = encodeURIComponent(message);
    const url = `https://wa.me/55${sanitizedPhone}?text=${encodedMessage}`;
    window.open(url, '_blank');
  };
  
  const handleNavigateRoute = (app: 'google' | 'waze') => {
    if (!route || !route.origin || route.stops.length === 0) return;

    let url: string;

    if (app === 'waze') {
      // Waze não suporta múltiplos waypoints, então vamos para o primeiro destino
      const firstStop = route.stops[0];
      if (firstStop.lat && firstStop.lng) {
        url = `https://waze.com/ul?ll=${firstStop.lat},${firstStop.lng}&navigate=yes`;
      } else {
        url = `https://waze.com/ul?q=${encodeURIComponent(firstStop.address)}`;
      }
    } else {
      const origin = route.origin.lat && route.origin.lng
          ? `${route.origin.lat},${route.origin.lng}`
          : encodeURIComponent(route.origin.address);

      const destination = route.stops[route.stops.length - 1];
      const destinationStr = destination.lat && destination.lng
          ? `${destination.lat},${destination.lng}`
          : encodeURIComponent(destination.address);

      const waypoints = route.stops.slice(0, -1).map(stop =>
          stop.lat && stop.lng ? `${stop.lat},${stop.lng}` : encodeURIComponent(stop.address)
      ).join('|');

      url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destinationStr}&waypoints=${waypoints}&travelmode=driving`;
    }

    window.location.href = url;
  };

  const handleStartRoute = async () => {
    if (!route || readOnly || isStarting) return;

    setIsStarting(true);
    try {
      await routeAction('start');

      startTracking();

      toast({
        title: 'Rota iniciada!',
        description: 'Seu rastreamento está ativo.',
      });
    } catch (error) {
      console.error('Error starting route:', error);
      toast({ variant: 'destructive', ...routeActionProblem('start', error) });
    } finally {
      setIsStarting(false);
    }
  };

  const getCompletionPercentage = () => {
    if (!route || route.stops.length === 0) return 0;
    const completedCount = route.stops.filter(stop =>
      stop.deliveryStatus === 'completed' || stop.deliveryStatus === 'failed'
    ).length;
    return (completedCount / route.stops.length) * 100;
  };

  const canFinishRoute = () => {
    return getCompletionPercentage() >= 80;
  };

  const handleStopRoute = async () => {
    if (!route) return;

    // Validação de 80% de conclusão
    if (!canFinishRoute()) {
      const completionPercentage = getCompletionPercentage().toFixed(0);
      toast({
        variant: 'destructive',
        title: 'Não é possível finalizar',
        description: `Você precisa concluir pelo menos 80% das entregas. Atual: ${completionPercentage}%`,
      });
      return;
    }

    try {
      await routeAction('finish');
      stopTracking();

      toast({
        title: 'Rota finalizada!',
        description: 'Obrigado pelo trabalho.',
      });
    } catch (error) {
      console.error('Error stopping route:', error);
      toast({ variant: 'destructive', ...routeActionProblem('finish', error) });
    }
  };

  const handleConfirmDelivery = async (data: {
    photo?: string;
    notes?: string;
    status: 'completed' | 'failed';
    failureReason?: string;
    wentToLocation?: boolean;
    attemptPhoto?: string;
    payments?: Payment[];
    deliveredItemIds?: string[];
  }) => {
    if (!route || !selectedStop || !user || readOnly) {
      console.error('Confirmação falhou: rota, parada ou motorista ausente.');
      return;
    }

    const targetStop={id:selectedStop.id,pointCode:selectedStop.pointCode,placeId:selectedStop.placeId,orderNumber:selectedStop.orderNumber};
    const signature=JSON.stringify([targetStop,selectedStop.driverRevision,data]);
    const attempt=confirmationAttempt.current?.signature===signature ? confirmationAttempt.current :
      {signature,requestId:crypto.randomUUID(),media:{}};
    confirmationAttempt.current=attempt;
    const media:{delivery?:string;attempt?:string}={};
    async function resolvePhoto(value:string|undefined,previous:string|undefined,kind:'delivery'|'attempt') {
      if (!value) return null;
      if (value===previous) return previous;
      if (!value.startsWith('data:')) throw new Error('Foto inválida.');
      const uploaded=attempt.media[kind] ?? await driverCommand<{id:string;url:string}>(request,endpoint,{kind:'upload',routeId,targetStop,mediaKind:kind,data:value});
      attempt.media[kind]=uploaded;
      media[kind]=uploaded.id;
      return uploaded.url;
    }
    try {
      const resolvedPhotoUrl=await resolvePhoto(data.photo,selectedStop.photoUrl,'delivery');
      const resolvedAttemptPhotoUrl=await resolvePhoto(data.attemptPhoto,selectedStop.attemptPhotoUrl,'attempt');
      const deliveryPatch: Record<string, unknown> = {
        deliveryStatus: data.status,
        notes: data.notes || null,
        failureReason: data.status === 'failed' ? data.failureReason || null : null,
        wentToLocation: data.status === 'failed' ? Boolean(data.wentToLocation) : null,
        payments: data.status === 'completed' ? data.payments || [] : null,
        deliveredItemIds: data.status === 'completed' ? data.deliveredItemIds || [] : null,
        photoUrl: resolvedPhotoUrl,
        attemptPhotoUrl: resolvedAttemptPhotoUrl,
      };

      const result = await routeAction<{ updatedStop: PlaceValue; stopIndex: number; wasPreviouslyFinalized: boolean }>('confirm', {
        targetStop,media,patch:deliveryPatch,requestId:attempt.requestId,expectedRevision:selectedStop.driverRevision,
      });

      const updatedStop=result.updatedStop;
      toast({
        title: result.wasPreviouslyFinalized
          ? 'Informações atualizadas!'
          : (updatedStop.deliveryStatus === 'completed' ? 'Entrega confirmada!' : 'Falha registrada'),
        description: result.wasPreviouslyFinalized
          ? 'As informações da entrega foram atualizadas com sucesso.'
          : (updatedStop.deliveryStatus === 'completed'
            ? 'A entrega foi registrada com sucesso.'
            : 'A falha na entrega foi registrada.'),
      });

      confirmationAttempt.current=undefined;
      setIsConfirmDialogOpen(false);
      setSelectedStop(null);
    } catch (error) {
      if (error instanceof EarningsRequestError && error.code==='route_stop_changed') {
        setIsConfirmDialogOpen(false);
        setSelectedStop(null);
        toast({
          variant: 'destructive',
          title: 'Esta parada mudou',
          description: 'A parada foi removida ou movida enquanto você confirmava. A rota foi atualizada sem recriá-la.',
        });
        return;
      }

      toast({
        variant: 'destructive',
        title: 'Erro ao confirmar',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      throw error;
    }
  };

  const handleOpenConfirmDialog = (stop: PlaceValue) => {
    confirmationAttempt.current=undefined;
    setSelectedStop(stop);
    setIsConfirmDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!route) {
    return null; // or a not found component
  }

  return (
    <div className="bg-background">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4">
            <Button asChild variant="ghost" size="icon">
                <Link href="/my-routes">
                    <ChevronLeft className="h-6 w-6" />
                </Link>
            </Button>
            <div className="flex-1">
                <h1 className="text-lg font-semibold">{route.name}</h1>
                {isTracking && route.status==='in_progress' && (
                    <Badge
                        variant={trackingHealth === 'error' ? 'destructive' : trackingHealth === 'warning' ? 'secondary' : 'default'}
                        className="flex items-center gap-1 w-fit"
                    >
                        <RadioTower className={`h-3 w-3 ${trackingHealth === 'healthy' ? 'animate-pulse' : ''}`} />
                        <span className="text-xs">
                            {trackingHealth === 'error' ? 'GPS com problemas' :
                             trackingHealth === 'warning' ? 'GPS instável' :
                             'Rastreando'}
                        </span>
                    </Badge>
                )}
            </div>
            <div className="ml-auto flex items-center gap-2">
                {route.status === 'dispatched' && (
                    <Button size="sm" onClick={handleStartRoute} disabled={isStarting || readOnly}>
                        <PlayCircle className="mr-2 h-4 w-4" />
                        Iniciar
                    </Button>
                )}
                {route.status === 'in_progress' && (
                    <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleStopRoute}
                        disabled={!canFinishRoute()}
                        title={!canFinishRoute() ? `Complete pelo menos 80% das entregas (${getCompletionPercentage().toFixed(0)}% concluído)` : ''}
                    >
                        <StopCircle className="mr-2 h-4 w-4" />
                        Finalizar {!canFinishRoute() && `(${getCompletionPercentage().toFixed(0)}%)`}
                    </Button>
                )}
            </div>
      </header>

      <main className="p-4 space-y-4">
        {route.status === 'dispatched' && (
          <RouteStartCard starting={isStarting} disabled={readOnly} onStart={handleStartRoute} />
        )}

        {route.status === 'in_progress' && (
          <Card className={!canFinishRoute() ? 'border-orange-300' : 'border-green-300'}>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">Progresso das Entregas</span>
                  <span className={`font-bold ${canFinishRoute() ? 'text-green-600' : 'text-orange-600'}`}>
                    {getCompletionPercentage().toFixed(0)}%
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-gray-200">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      canFinishRoute() ? 'bg-green-600' : 'bg-orange-500'
                    }`}
                    style={{ width: `${getCompletionPercentage()}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {route.stops.filter(s => s.deliveryStatus === 'completed' || s.deliveryStatus === 'failed').length} de {route.stops.length} entregas processadas
                  {!canFinishRoute() && ' • Mínimo 80% para finalizar'}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
            <CardContent className="grid grid-cols-3 gap-4 pt-6 text-center text-sm">
                <div className="flex flex-col items-center gap-1">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    <span className="font-bold">{route.stops.length}</span>
                    <span className="text-xs text-muted-foreground">PARADAS</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <Milestone className="h-5 w-5 text-muted-foreground" />
                    <span className="font-bold">{formatDistance(route.distanceMeters)}</span>
                    <span className="text-xs text-muted-foreground">KM</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <span className="font-bold">{formatDuration(route.duration)}</span>
                     <span className="text-xs text-muted-foreground">TEMPO</span>
                </div>
            </CardContent>
        </Card>
        
        {route.status !== 'completed' && (
          <Button
            size="lg"
            variant={route.status === 'dispatched' ? 'outline' : 'default'}
            className={route.status === 'dispatched'
              ? 'w-full'
              : 'w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02]'}
            onClick={() => handleNavigateRoute('google')}
          >
            <Navigation className="mr-2 h-5 w-5" />
            Abrir rota completa no mapa
          </Button>
        )}

        <div className="relative flex flex-col">
            {/* Linha vertical conectora */}
            <div className="absolute left-5 top-5 h-[calc(100%-2.5rem)] w-px bg-border"></div>

            {route.stops.map((stop, index) => (
                <div key={stop.id || index} className="relative flex gap-4 pb-8 last:pb-0">
                    <div className="z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-primary bg-background text-primary font-bold">
                        {index + 1}
                    </div>
                    <Card className="flex-1 w-full">
                        <CardContent className="p-4 space-y-3">
                            <div className="flex justify-between items-start">
                                <div className="font-semibold">{stop.customerName || 'Endereço'}</div>
                                {stop.deliveryStatus === 'completed' && (
                                    <Badge variant="default" className="bg-green-600">
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        Entregue
                                    </Badge>
                                )}
                                {stop.deliveryStatus === 'failed' && (
                                    <Badge variant="destructive">
                                        <XCircle className="mr-1 h-3 w-3" />
                                        Falhou
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground">{stop.address}</p>
                            {stop.complemento && (
                              <p className="text-xs text-muted-foreground">{stop.complemento}</p>
                            )}
                            {stop.wasModified && (
                              <StopChangeBadge
                                modificationType={stop.modificationType}
                                originalSequence={stop.originalSequence}
                                currentSequence={index}
                              />
                            )}
                            {stop.orderNumber && route.source === 'lunna' ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Badge variant="outline" className="text-xs font-mono bg-blue-50 text-blue-700 border-blue-200">
                                        <Package className="mr-1 h-3 w-3" />
                                        #{stop.orderNumber}
                                    </Badge>
                                    {stop.operationType === 'troca' && (
                                        <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">
                                            <RefreshCw className="mr-1 h-3 w-3" />
                                            Troca
                                        </Badge>
                                    )}
                                    {stop.operationType === 'misto' && (
                                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                                            Venda + Troca
                                        </Badge>
                                    )}
                                    {stop.expectedValue !== undefined && (
                                        <Badge variant="outline" className="text-xs font-medium bg-green-50 text-green-700 border-green-200">
                                            <DollarSign className="mr-1 h-3 w-3" />
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(stop.expectedValue)}
                                        </Badge>
                                    )}
                                </div>
                            ) : stop.orderNumber ? (
                                <p className="text-xs text-muted-foreground">Pedido: #{stop.orderNumber}</p>
                            ) : null}
                            {stop.notes && (
                                <p className="text-xs text-muted-foreground italic">{stop.notes}</p>
                            )}
                            <div className="flex gap-2 pt-2">
                                 {route.status !== 'completed' ? (
                                   <DropdownMenu>
                                     <DropdownMenuTrigger asChild>
                                       <Button size="sm" variant="outline">
                                         <Navigation className="mr-2 h-4 w-4" />
                                         Navegar
                                       </Button>
                                     </DropdownMenuTrigger>
                                     <DropdownMenuContent align="start">
                                       <DropdownMenuItem onClick={() => handleNavigation(stop, 'google')}>
                                         <MapPin className="mr-2 h-4 w-4" />
                                         Google Maps
                                       </DropdownMenuItem>
                                       <DropdownMenuItem onClick={() => handleNavigation(stop, 'waze')}>
                                         <Navigation className="mr-2 h-4 w-4" />
                                         Waze
                                       </DropdownMenuItem>
                                     </DropdownMenuContent>
                                   </DropdownMenu>
                                 ) : (
                                   <Button size="sm" variant="outline" disabled>
                                     <Navigation className="mr-2 h-4 w-4" />
                                     Navegar
                                   </Button>
                                 )}
                                 {stop.phone && (
                                     <Button size="icon" variant="outline" className="text-green-600 border-green-600/50 hover:bg-green-50 hover:text-green-700" onClick={() => handleWhatsApp(stop.phone, stop.customerName)}>
                                        <WhatsAppIcon className="h-4 w-4" />
                                    </Button>
                                 )}
                                {route.status === 'completed' && stop.deliveryStatus && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="ml-auto"
                                        onClick={() => handleOpenConfirmDialog(stop)}
                                    >
                                        <Info className="mr-2 h-4 w-4" />
                                        Ver Detalhes
                                    </Button>
                                )}
                                {(route.status === 'in_progress' || route.status === 'dispatched') &&
                                 !stop.deliveryStatus && (
                                    <Button
                                        size="sm"
                                        variant="default"
                                        className="ml-auto bg-green-600 hover:bg-green-700"
                                        onClick={() => handleOpenConfirmDialog(stop)}
                                        disabled={route.status === 'dispatched'}
                                        aria-describedby={route.status === 'dispatched' ? `start-route-first-${index}` : undefined}
                                    >
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Confirmar
                                    </Button>
                                )}
                                {(route.status === 'in_progress' || route.status === 'dispatched') &&
                                 stop.deliveryStatus && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="ml-auto"
                                        onClick={() => handleOpenConfirmDialog(stop)}
                                    >
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Editar
                                    </Button>
                                )}
                            </div>
                            {route.status === 'dispatched' && !stop.deliveryStatus && (
                                <p id={`start-route-first-${index}`} className="text-right text-xs text-muted-foreground">Inicie a rota para confirmar esta entrega.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>
            ))}
        </div>
      </main>

      {/* Delivery Confirmation Dialog */}
      {selectedStop && detail.data && (
        <DeliveryConfirmationDialog
          validationSettings={detail.data!.deliveryValidation}
          isOpen={isConfirmDialogOpen}
          onClose={() => {
            setIsConfirmDialogOpen(false);
            setSelectedStop(null);
          }}
          onConfirm={handleConfirmDelivery}
          customerName={selectedStop.customerName}
          address={selectedStop.address}
          complement={selectedStop.complemento}
          viewOnly={route.status === 'completed' || route.status==='completed_auto' || readOnly}
          stopLocation={
            selectedStop.lat && selectedStop.lng
              ? {
                  lat: selectedStop.lat,
                  lng: selectedStop.lng,
                }
              : undefined
          }
          currentLocation={
            location ? { lat: location.coords.latitude, lng: location.coords.longitude } : null
          }
          existingData={
            selectedStop.deliveryStatus
              ? {
                  photoUrl: selectedStop.photoUrl,
                  notes: selectedStop.notes,
                  deliveryStatus: selectedStop.deliveryStatus as 'completed' | 'failed' | undefined,
                  failureReason: selectedStop.failureReason,
                  wentToLocation: selectedStop.wentToLocation,
                  attemptPhotoUrl: selectedStop.attemptPhotoUrl,
                  payments: selectedStop.payments,
                  deliveredItemIds: selectedStop.deliveredItemIds,
                }
              : undefined
          }
          // Props Lunna
          isLunnaOrder={route.source === 'lunna'}
          expectedValue={selectedStop.expectedValue}
          orderNumber={selectedStop.orderNumber}
          items={selectedStop.items}
          hasExchangeItems={selectedStop.hasExchangeItems}
          operationType={selectedStop.operationType}
        />
      )}

      {/* Route Changes Notification */}
      <RouteChangesNotification
        isPreview={readOnly}
        onDismissPreview={() => setDismissed(detail.data?.notice?.fingerprint)}
        notification={notification}
        onAcknowledge={handleAcknowledgeChanges}
        isAcknowledging={isAcknowledging}
      />
    </div>
  );
}
