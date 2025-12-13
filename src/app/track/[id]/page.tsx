
'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2,
  MapPin,
  Clock,
  Package,
  CheckCircle2,
  Truck,
  AlertCircle,
  Phone,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { db } from '@/lib/firebase/client';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import type { PlaceValue, RouteInfo, DriverLocation } from '@/lib/types';
import { RouteMap } from '@/components/maps/RouteMap';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import WhatsAppIcon from '@/components/icons/whatsapp-icon';

// Funções para mascarar dados sensíveis em página pública
const maskPhone = (phone: string | undefined): string => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length >= 10) {
    return `(${cleaned.slice(0, 2)}) *****-${cleaned.slice(-4)}`;
  }
  return '***';
};

const maskPlate = (plate: string | undefined): string => {
  if (!plate) return '';
  // Formato brasileiro: ABC-1234 ou ABC1D23 (Mercosul)
  if (plate.length >= 7) {
    return `${plate.slice(0, 3)}-****`;
  }
  return '***';
};

// Formatar telefone para WhatsApp de forma segura
const formatPhoneForWhatsApp = (phone: string | undefined): string => {
  if (!phone) return '';
  const cleaned = phone.replace(/\D/g, '');
  // Se já começa com 55, não adiciona
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    return cleaned;
  }
  // Se tem 10-11 dígitos (DDD + número), adiciona 55
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    return `55${cleaned}`;
  }
  return cleaned;
};

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  driverInfo: {
    name: string;
    vehicle: string;
    plate: string;
    phone?: string;
  } | null;
  plannedDate: Timestamp;
  origin: PlaceValue;
  currentStopIndex?: number;
};

export default function PublicTrackingPage() {
  const params = useParams();
  const routeId = params?.id as string;
  const [route, setRoute] = React.useState<RouteDocument | null>(null);
  const [driverLocation, setDriverLocation] = React.useState<DriverLocation | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!routeId) return;

    const docRef = doc(db, 'routes', routeId);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setRoute({ id: docSnap.id, ...data } as RouteDocument);

          if (data.currentLocation) {
            setDriverLocation(data.currentLocation as DriverLocation);
          }
        } else {
          setError('Rota não encontrada');
        }
        setIsLoading(false);
      },
      (err) => {
        console.error('Error fetching route:', err);
        setError('Erro ao carregar rastreamento');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [routeId]);

  const getDeliveredCount = () => {
    if (!route) return 0;
    return route.stops.filter((stop) => stop.deliveryStatus === 'completed').length;
  };

  const getProgressPercentage = () => {
    if (!route || route.stops.length === 0) return 0;
    return (getDeliveredCount() / route.stops.length) * 100;
  };

  const getEstimatedArrival = () => {
    if (!route || !route.currentStopIndex) return 'Calculando...';

    const currentIndex = route.currentStopIndex;
    if (currentIndex >= route.stops.length) return 'Entrega concluída';

    // Estimativa simples - pode ser melhorada com cálculo real baseado em distância
    return 'Em breve';
  };

  const getCurrentStop = () => {
    if (!route || route.currentStopIndex === undefined) return null;
    return route.stops[route.currentStopIndex];
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-lg text-muted-foreground">Carregando rastreamento...</p>
        </div>
      </div>
    );
  }

  if (error || !route) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-destructive" />
            <h3 className="mt-4 text-lg font-semibold">Erro ao Carregar</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {error || 'Não foi possível encontrar esta rota.'}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentStop = getCurrentStop();
  const deliveredCount = getDeliveredCount();
  const progressPercentage = getProgressPercentage();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="mx-auto max-w-7xl px-4 py-6">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-3">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Rastreamento de Entrega</h1>
              <p className="text-sm text-muted-foreground">
                {format(route.plannedDate.toDate(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content - Map & Progress */}
          <div className="space-y-6 lg:col-span-2">
            {/* Status Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    {route.status === 'completed' ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        Entrega Concluída
                      </>
                    ) : route.status === 'in_progress' ? (
                      <>
                        <Truck className="h-5 w-5 text-blue-600" />
                        Em Rota
                      </>
                    ) : (
                      <>
                        <Clock className="h-5 w-5 text-orange-600" />
                        Aguardando Início
                      </>
                    )}
                  </CardTitle>
                  {route.status === 'in_progress' && driverLocation && (
                    <Badge variant="default" className="animate-pulse">
                      Ao vivo
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progresso da Rota</span>
                    <span className="font-semibold">
                      {deliveredCount} de {route.stops.length} entregas
                    </span>
                  </div>
                  <Progress value={progressPercentage} className="h-2" />
                </div>

                {route.status === 'in_progress' && currentStop && (
                  <div className="rounded-lg bg-blue-50 p-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-blue-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-semibold text-blue-900">Próxima Parada</p>
                        <p className="text-sm text-blue-700">{currentStop.address}</p>
                        {currentStop.customerName && (
                          <p className="text-xs text-blue-600 mt-1">
                            {currentStop.customerName}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-blue-600">Chegada estimada</p>
                        <p className="font-semibold text-blue-900">{getEstimatedArrival()}</p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Map */}
            <Card className="overflow-hidden">
              <div className="h-[500px]">
                <RouteMap
                  height={-1}
                  origin={route.origin}
                  routes={[route]}
                  driverLocation={
                    driverLocation
                      ? {
                          lat: driverLocation.lat,
                          lng: driverLocation.lng,
                          heading: driverLocation.heading,
                        }
                      : undefined
                  }
                />
              </div>
            </Card>
          </div>

          {/* Sidebar - Details */}
          <div className="space-y-6">
            {/* Driver Info */}
            {route.driverInfo && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Seu Motorista</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="font-semibold text-lg">{route.driverInfo.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {route.driverInfo.vehicle}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {maskPlate(route.driverInfo.plate)}
                    </p>
                  </div>

                  {route.driverInfo.phone && (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Tel: {maskPhone(route.driverInfo.phone)}
                      </p>
                      <Button
                        variant="outline"
                        className="w-full text-green-600 border-green-600/50 hover:bg-green-50"
                        onClick={() => {
                          const phone = formatPhoneForWhatsApp(route.driverInfo?.phone);
                          if (phone) {
                            window.open(`https://wa.me/${phone}`, '_blank');
                          }
                        }}
                      >
                        <WhatsAppIcon className="mr-2 h-4 w-4" />
                        Falar com motorista
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stops List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Paradas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {route.stops.map((stop, index) => (
                    <div
                      key={stop.id || index}
                      className={`flex items-start gap-3 rounded-lg p-3 transition-colors ${
                        stop.deliveryStatus === 'completed'
                          ? 'bg-green-50'
                          : index === route.currentStopIndex
                          ? 'bg-blue-50'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div
                        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                          stop.deliveryStatus === 'completed'
                            ? 'bg-green-600 text-white'
                            : index === route.currentStopIndex
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-300 text-gray-600'
                        }`}
                      >
                        {stop.deliveryStatus === 'completed' ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : (
                          index + 1
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {stop.customerName || 'Endereço'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {stop.address}
                        </p>
                        {stop.deliveryStatus === 'completed' && stop.completedAt && (
                          <p className="text-xs text-green-700 mt-1">
                            ✓ Entregue às{' '}
                            {format(
                              (stop.completedAt as Timestamp).toDate(),
                              'HH:mm',
                              { locale: ptBR }
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t bg-white py-6">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground">
          <p>Rastreamento em tempo real • Atualizado automaticamente</p>
        </div>
      </footer>
    </div>
  );
}
