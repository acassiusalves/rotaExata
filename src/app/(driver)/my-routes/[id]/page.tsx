
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
import { db, storage } from '@/lib/firebase/client';
import { doc, onSnapshot, Timestamp, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import type { PlaceValue, RouteInfo, Payment, RouteChangeNotification } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import WhatsAppIcon from '@/components/icons/whatsapp-icon';
import { notFound } from 'next/navigation';
import { useGeolocationTracking } from '@/hooks/use-geolocation-tracking';
import { useToast } from '@/hooks/use-toast';
import { DeliveryConfirmationDialog } from '@/components/delivery/delivery-confirmation-dialog';
import { RouteChangesNotification } from '@/components/driver/route-changes-notification';
import { StopChangeBadge } from '@/components/driver/stop-change-badge';
import { syncLunnaOrderStatus } from '@/lib/lunna-sync';
import { logPointCompleted, logPointFailed } from '@/lib/firebase/activity-log';
import { useAuth } from '@/hooks/use-auth';
import {
  acknowledgeRouteChangesAtomically,
  confirmRouteStopAtomically,
  RouteStopNotFoundError,
} from '@/lib/firebase/route-stop-mutations';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  driverId?: string;
  driverInfo: {
    name: string;
    vehicle: string;
    plate: string;
  } | null;
  plannedDate: Timestamp;
  origin: PlaceValue;
  source?: string;
};


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
  const { user } = useAuth();
  const [route, setRoute] = React.useState<RouteDocument | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedStopIndex, setSelectedStopIndex] = React.useState<number | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = React.useState(false);
  const [notification, setNotification] = React.useState<RouteChangeNotification | null>(null);
  const [isAcknowledging, setIsAcknowledging] = React.useState(false);
  const { toast } = useToast();

  // GPS Tracking
  const { location, isTracking, trackingHealth, startTracking, stopTracking, error } = useGeolocationTracking({
    routeId,
    enableHighAccuracy: true,
    updateInterval: 5000, // 5 segundos
    distanceFilter: 10, // 10 metros
  });

  React.useEffect(() => {
    if (!routeId) return;
    const docRef = doc(db, 'routes', routeId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setRoute({ id: docSnap.id, ...docSnap.data() } as RouteDocument);
        } else {
          console.error('No such document!');
          notFound();
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching route:', error);
        setIsLoading(false);
        notFound();
      }
    );

    return () => unsubscribe();
  }, [routeId]);

  // Auto-restart tracking if route is in_progress and tracking is not active
  React.useEffect(() => {
    if (!route) return;

    // Se a rota está em progresso mas o tracking não está ativo, reinicia automaticamente
    if (route.status === 'in_progress' && !isTracking) {
      console.log('🔄 [Auto-restart] Rota em progresso detectada, reiniciando tracking...');
      startTracking();
    }
  }, [route?.status, isTracking, startTracking]);

  // Monitor tracking health and show alerts
  React.useEffect(() => {
    if (!isTracking) return;

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
  }, [trackingHealth, isTracking, toast]);

  // Listen for route change notifications
  React.useEffect(() => {
    if (!routeId) return;

    const notificationRef = doc(db, 'routeChangeNotifications', routeId);
    const unsubscribe = onSnapshot(
      notificationRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as RouteChangeNotification;
          if (!data.acknowledged) {
            setNotification({ ...data, id: docSnap.id });
          } else {
            setNotification(null);
          }
        } else {
          setNotification(null);
        }
      },
      (error) => {
        console.error('Error fetching notification:', error);
      }
    );

    return () => unsubscribe();
  }, [routeId]);

  const handleAcknowledgeChanges = async () => {
    if (!notification) return;

    setIsAcknowledging(true);
    try {
      await acknowledgeRouteChangesAtomically(routeId);

      toast({
        title: 'Alterações confirmadas',
        description: 'Você confirmou o recebimento das alterações.',
      });

      setNotification(null);
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
      ? `Olá ${firstName}, tudo bem?\n\nSou entregador da Sol de Maria Calçados e estou com o seu pedido. Poderia me enviar sua localização fixa?`
      : `Olá, tudo bem?\n\nSou entregador da Sol de Maria Calçados e estou com o seu pedido. Poderia me enviar sua localização fixa?`;

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
    if (!route) return;

    try {
      const routeRef = doc(db, 'routes', routeId);
      await updateDoc(routeRef, {
        status: 'in_progress',
        startedAt: Timestamp.now(),
        currentStopIndex: 0,
      });

      startTracking();

      toast({
        title: 'Rota iniciada!',
        description: 'Seu rastreamento está ativo.',
      });
    } catch (error) {
      console.error('Error starting route:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível iniciar a rota.',
      });
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
      stopTracking();

      const routeRef = doc(db, 'routes', routeId);
      await updateDoc(routeRef, {
        status: 'completed',
        completedAt: Timestamp.now(),
      });

      toast({
        title: 'Rota finalizada!',
        description: 'Obrigado pelo trabalho.',
      });
    } catch (error) {
      console.error('Error stopping route:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível finalizar a rota.',
      });
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
    if (!route || selectedStopIndex === null || !user) {
      console.error('Confirmação falhou: rota, parada ou motorista ausente.');
      return;
    }

    const selectedStop = route.stops[selectedStopIndex];
    let resolvedPhotoUrl: string | null = selectedStop.photoUrl || null;
    let resolvedAttemptPhotoUrl: string | null = selectedStop.attemptPhotoUrl || null;

    try {
      // Upload da foto para o Storage se houver nova foto (base64)
      if (data.photo?.startsWith('data:')) {
        try {
          // Cria referência única para a foto
          const photoRef = ref(
            storage,
            `delivery-photos/${routeId}/${selectedStop.id || selectedStop.placeId}-${Date.now()}.jpg`,
          );

          // Faz upload da foto em base64
          await uploadString(photoRef, data.photo, 'data_url');

          // Obtém a URL de download
          const photoURL = await getDownloadURL(photoRef);

          // Salva apenas a URL no documento
          resolvedPhotoUrl = photoURL;
        } catch (photoError) {
          console.error('❌ Erro ao fazer upload da foto:', photoError);
          // Se falhar o upload, mantém a foto anterior
          toast({
            variant: 'destructive',
            title: 'Aviso',
            description: 'Não foi possível salvar a foto, mas a entrega foi registrada.',
          });
        }
      } else if (data.photo?.startsWith('http')) {
        // Manter URL existente (não foi alterada)
        resolvedPhotoUrl = data.photo;
      } else if (!data.photo) {
        resolvedPhotoUrl = null;
      }

      // Upload da foto da tentativa de entrega se houver nova foto (base64)
      if (data.attemptPhoto?.startsWith('data:')) {
        try {
          const attemptPhotoRef = ref(
            storage,
            `delivery-attempt-photos/${routeId}/${selectedStop.id || selectedStop.placeId}-${Date.now()}.jpg`,
          );
          await uploadString(attemptPhotoRef, data.attemptPhoto, 'data_url');
          const attemptPhotoURL = await getDownloadURL(attemptPhotoRef);
          resolvedAttemptPhotoUrl = attemptPhotoURL;
        } catch (photoError) {
          console.error('❌ Erro ao fazer upload da foto de tentativa:', photoError);
          toast({
            variant: 'destructive',
            title: 'Aviso',
            description: 'Não foi possível salvar a foto de tentativa, mas a entrega foi registrada.',
          });
        }
      } else if (data.attemptPhoto?.startsWith('http')) {
        // Manter URL existente
        resolvedAttemptPhotoUrl = data.attemptPhoto;
      } else if (!data.attemptPhoto) {
        resolvedAttemptPhotoUrl = null;
      }

      const deliveryPatch: Record<string, unknown> = {
        deliveryStatus: data.status,
        completedAt: Timestamp.now(),
        notes: data.notes || null,
        failureReason: data.status === 'failed' ? data.failureReason || null : null,
        wentToLocation: data.status === 'failed' ? Boolean(data.wentToLocation) : null,
        payments: data.status === 'completed' ? data.payments || [] : null,
        deliveredItemIds: data.status === 'completed' ? data.deliveredItemIds || [] : null,
        photoUrl: resolvedPhotoUrl,
        attemptPhotoUrl: resolvedAttemptPhotoUrl,
      };

      const result = await confirmRouteStopAtomically({
        routeId,
        driverId: user.uid,
        targetStop: selectedStop,
        patch: deliveryPatch as Partial<PlaceValue>,
      });

      // Registrar no activity log
      const updatedStop = result.updatedStop;
      try {
        if (updatedStop.deliveryStatus === 'completed') {
          await logPointCompleted({
            userId: user.uid,
            userName: user.email || route.driverInfo?.name || 'Motorista',
            pointId: updatedStop.id || updatedStop.placeId,
            pointCode: updatedStop.pointCode,
            routeId: routeId,
            routeCode: route.code || 'Rota',
            serviceId: route.serviceId,
            serviceCode: route.serviceCode,
            photoUrl: updatedStop.photoUrl,
            address: updatedStop.address,
            customerName: updatedStop.customerName,
            notes: updatedStop.notes,
          });
        } else if (updatedStop.deliveryStatus === 'failed') {
          await logPointFailed({
            userId: user.uid,
            userName: user.email || route.driverInfo?.name || 'Motorista',
            pointId: updatedStop.id || updatedStop.placeId,
            pointCode: updatedStop.pointCode,
            routeId: routeId,
            routeCode: route.code || 'Rota',
            serviceId: route.serviceId,
            serviceCode: route.serviceCode,
            failureReason: updatedStop.failureReason,
            wentToLocation: updatedStop.wentToLocation,
            attemptPhotoUrl: updatedStop.attemptPhotoUrl,
            address: updatedStop.address,
            customerName: updatedStop.customerName,
          });
        }
      } catch (logError) {
        console.error('⚠️ Erro ao registrar activity log (não crítico):', logError);
      }

      // Sincronizar status com pedidos do Lunna se a rota for importada
      if (route.source === 'lunna') {
        try {
          await syncLunnaOrderStatus(
            route,
            updatedStop,
            updatedStop.deliveryStatus === 'completed' ? 'entregue' : 'falha',
          );
        } catch (syncError) {
          console.error('⚠️ Erro ao sincronizar com Lunna (não crítico):', syncError);
          // Não bloqueia a operação se a sincronização falhar
        }
      }

      // Notificar admin quando motorista editar uma entrega já concluída
      if (result.wasPreviouslyFinalized) {
        try {
          const driverName = route.driverInfo?.name || 'Motorista';
          const committedStopIndex = result.stops.indexOf(updatedStop);
          const stopName = updatedStop.customerName || updatedStop.address || 'Ponto confirmado';

          await addDoc(collection(db, 'notifications'), {
            type: 'delivery_edited',
            title: 'Entrega editada pelo motorista',
            message: `${driverName} editou as informações do ponto "${stopName}" na rota "${route.name}".`,
            priority: 'normal',
            routeId: routeId,
            routeName: route.name,
            stopIndex: committedStopIndex,
            driverId: route.driverId,
            driverName: driverName,
            read: false,
            opened: false,
            openedAt: null,
            timestamp: serverTimestamp(),
            // Para admins verem (não tem driverId específico, então todos admins veem)
            forAdmin: true,
          });
          console.log('✅ Notificação de edição enviada para admin');
        } catch (notifError) {
          console.error('⚠️ Erro ao criar notificação (não crítico):', notifError);
        }
      }

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

      setIsConfirmDialogOpen(false);
      setSelectedStopIndex(null);
    } catch (error) {
      if (error instanceof RouteStopNotFoundError) {
        setIsConfirmDialogOpen(false);
        setSelectedStopIndex(null);
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

  const handleOpenConfirmDialog = (index: number) => {
    setSelectedStopIndex(index);
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
                {isTracking && (
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
                    <Button size="sm" onClick={handleStartRoute}>
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
          <Card className="border-blue-300 bg-blue-50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <PlayCircle className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-semibold text-blue-900">Rota pronta para iniciar</p>
                  <p className="text-sm text-blue-700">Clique em &quot;Iniciar&quot; no topo para começar as entregas</p>
                </div>
              </div>
            </CardContent>
          </Card>
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02]"
            onClick={() => handleNavigateRoute('google')}
          >
            <Navigation className="mr-2 h-5 w-5" />
            Iniciar Rota Completa em Ordem
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
                                        onClick={() => handleOpenConfirmDialog(index)}
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
                                        onClick={() => handleOpenConfirmDialog(index)}
                                        disabled={route.status === 'dispatched'}
                                        title={route.status === 'dispatched' ? 'Inicie a rota primeiro' : ''}
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
                                        onClick={() => handleOpenConfirmDialog(index)}
                                    >
                                        <Pencil className="mr-2 h-4 w-4" />
                                        Editar
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            ))}
        </div>
      </main>

      {/* Delivery Confirmation Dialog */}
      {selectedStopIndex !== null && (
        <DeliveryConfirmationDialog
          isOpen={isConfirmDialogOpen}
          onClose={() => {
            setIsConfirmDialogOpen(false);
            setSelectedStopIndex(null);
          }}
          onConfirm={handleConfirmDelivery}
          customerName={route.stops[selectedStopIndex]?.customerName}
          address={route.stops[selectedStopIndex]?.address}
          complement={route.stops[selectedStopIndex]?.complemento}
          viewOnly={route.status === 'completed'}
          stopLocation={
            route.stops[selectedStopIndex]?.lat && route.stops[selectedStopIndex]?.lng
              ? {
                  lat: route.stops[selectedStopIndex].lat!,
                  lng: route.stops[selectedStopIndex].lng!,
                }
              : undefined
          }
          currentLocation={
            location ? { lat: location.coords.latitude, lng: location.coords.longitude } : null
          }
          existingData={
            route.stops[selectedStopIndex]?.deliveryStatus
              ? {
                  photoUrl: route.stops[selectedStopIndex].photoUrl,
                  notes: route.stops[selectedStopIndex].notes,
                  deliveryStatus: route.stops[selectedStopIndex].deliveryStatus as 'completed' | 'failed' | undefined,
                  failureReason: route.stops[selectedStopIndex].failureReason,
                  wentToLocation: route.stops[selectedStopIndex].wentToLocation,
                  attemptPhotoUrl: route.stops[selectedStopIndex].attemptPhotoUrl,
                  payments: route.stops[selectedStopIndex].payments,
                  deliveredItemIds: route.stops[selectedStopIndex].deliveredItemIds,
                }
              : undefined
          }
          // Props Lunna
          isLunnaOrder={route.source === 'lunna'}
          expectedValue={route.stops[selectedStopIndex]?.expectedValue}
          orderNumber={route.stops[selectedStopIndex]?.orderNumber}
          items={route.stops[selectedStopIndex]?.items}
          hasExchangeItems={route.stops[selectedStopIndex]?.hasExchangeItems}
          operationType={route.stops[selectedStopIndex]?.operationType}
        />
      )}

      {/* Route Changes Notification */}
      <RouteChangesNotification
        notification={notification}
        onAcknowledge={handleAcknowledgeChanges}
        isAcknowledging={isAcknowledging}
      />
    </div>
  );
}
