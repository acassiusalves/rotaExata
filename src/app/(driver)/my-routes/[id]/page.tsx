
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase/client';
import { doc, onSnapshot, Timestamp, updateDoc } from 'firebase/firestore';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';
import WhatsAppIcon from '@/components/icons/whatsapp-icon';
import { notFound } from 'next/navigation';
import { useGeolocationTracking } from '@/hooks/use-geolocation-tracking';
import { useToast } from '@/hooks/use-toast';
import { DeliveryConfirmationDialog } from '@/components/delivery/delivery-confirmation-dialog';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  driverInfo: {
    name: string;
    vehicle: string;
    plate: string;
  } | null;
  plannedDate: Timestamp;
  origin: PlaceValue;
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
  const routeId = params.id as string;
  const [route, setRoute] = React.useState<RouteDocument | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedStopIndex, setSelectedStopIndex] = React.useState<number | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = React.useState(false);
  const { toast } = useToast();

  // GPS Tracking
  const { location, isTracking, startTracking, stopTracking, error } = useGeolocationTracking({
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

  const handleNavigation = (stop: PlaceValue) => {
    if (!stop) return;
    const query = stop.lat && stop.lng 
      ? `${stop.lat},${stop.lng}` 
      : encodeURIComponent(stop.address);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    window.open(url, '_blank');
  };

  const handleWhatsApp = (phone: string | undefined) => {
    if (!phone) return;
    const sanitizedPhone = phone.replace(/\D/g, ''); // Remove non-digit characters
    const url = `https://wa.me/55${sanitizedPhone}`; // Adiciona o código do Brasil
    window.open(url, '_blank');
  };
  
  const handleNavigateRoute = () => {
    if (!route || !route.origin || route.stops.length === 0) return;

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

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destinationStr}&waypoints=${waypoints}&travelmode=driving`;
    window.open(url, '_blank');
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
    const completedCount = route.stops.filter(stop => stop.deliveryStatus === 'completed').length;
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
    signature?: string;
    notes?: string;
    status: 'completed' | 'failed';
    failureReason?: string;
    paymentMethod?: string;
  }) => {
    if (!route || selectedStopIndex === null) return;

    try {
      const updatedStops = [...route.stops];
      updatedStops[selectedStopIndex] = {
        ...updatedStops[selectedStopIndex],
        deliveryStatus: data.status,
        completedAt: Timestamp.now(),
        photoUrl: data.photo,
        signatureUrl: data.signature,
        notes: data.notes,
        failureReason: data.failureReason,
        paymentMethod: data.paymentMethod,
      };

      const routeRef = doc(db, 'routes', routeId);
      await updateDoc(routeRef, {
        stops: updatedStops,
        currentStopIndex: selectedStopIndex + 1,
      });

      toast({
        title: data.status === 'completed' ? 'Entrega confirmada!' : 'Falha registrada',
        description: data.status === 'completed'
          ? 'A entrega foi registrada com sucesso.'
          : 'A falha na entrega foi registrada.',
      });

      setIsConfirmDialogOpen(false);
      setSelectedStopIndex(null);
    } catch (error) {
      console.error('Error confirming delivery:', error);
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
                    <Badge variant="default" className="flex items-center gap-1 w-fit">
                        <RadioTower className="h-3 w-3 animate-pulse" />
                        <span className="text-xs">Rastreando</span>
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
                <Avatar className="h-8 w-8">
                    <AvatarFallback>{route.driverInfo ? getInitials(route.driverInfo.name) : 'N/A'}</AvatarFallback>
                </Avatar>
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
                  <p className="text-sm text-blue-700">Clique em "Iniciar" no topo para começar as entregas</p>
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
                  {route.stops.filter(s => s.deliveryStatus === 'completed').length} de {route.stops.length} entregas concluídas
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

        <div className="space-y-4">
            {route.stops.map((stop, index) => (
                <div key={stop.id || index}>
                    <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center gap-1">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-primary font-bold">
                                {index + 1}
                            </div>
                            {index < route.stops.length - 1 && (
                                <div className="w-px h-8 bg-border"></div>
                            )}
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="flex justify-between items-start">
                                <div className="font-semibold">{stop.customerName || 'Endereço'}</div>
                                {stop.deliveryStatus === 'completed' && (
                                    <Badge variant="default" className="bg-green-600">
                                        <CheckCircle2 className="mr-1 h-3 w-3" />
                                        Entregue
                                    </Badge>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground">{stop.address}</p>
                            {stop.orderNumber && (
                                <p className="text-xs text-muted-foreground">Pedido: #{stop.orderNumber}</p>
                            )}
                            {stop.notes && (
                                <p className="text-xs text-muted-foreground italic">{stop.notes}</p>
                            )}
                            <div className="flex gap-2 pt-2">
                                 <Button size="sm" variant="outline" onClick={() => handleNavigation(stop)}>
                                    <Navigation className="mr-2 h-4 w-4" />
                                    Navegar
                                 </Button>
                                 {stop.phone && (
                                     <Button size="sm" variant="outline" className="text-green-600 border-green-600/50 hover:bg-green-50 hover:text-green-700" onClick={() => handleWhatsApp(stop.phone)}>
                                        <WhatsAppIcon className="mr-2 h-4 w-4" />
                                        WhatsApp
                                    </Button>
                                 )}
                                {(route.status === 'in_progress' || route.status === 'dispatched') && stop.deliveryStatus !== 'completed' && (
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
                            </div>
                        </div>
                    </div>
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
        />
      )}
    </div>
  );
}
