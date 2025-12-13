'use client';

import * as React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  MapPin,
  Route as RouteIcon,
  Car,
  CheckCircle,
  Clock,
  Weight,
} from 'lucide-react';
import { MyRoutesPageSkeleton } from '@/components/skeletons/route-card-skeleton';
import { db } from '@/lib/firebase/client';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';

type RouteDocument = {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  plannedDate: Timestamp;
  stops: any[];
  distanceMeters: number;
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(0);

const getRouteMapUrl = (stops: any[]) => {
  if (!stops || stops.length === 0) return null;

  const apiKey = process.env.NEXT_PUBLIC_GMAPS_KEY;
  if (!apiKey) return null;

  // Pegar primeiro e último ponto da rota
  const origin = stops[0];
  const destination = stops[stops.length - 1];

  // Verificar diferentes formatos de coordenadas
  const getCoords = (stop: any) => {
    // Formato 1: stop.location.lat/lng
    if (stop?.location?.lat && stop?.location?.lng) {
      return { lat: stop.location.lat, lng: stop.location.lng };
    }
    // Formato 2: stop.lat/lng direto
    if (stop?.lat && stop?.lng) {
      return { lat: stop.lat, lng: stop.lng };
    }
    // Formato 3: stop.latitude/longitude
    if (stop?.latitude && stop?.longitude) {
      return { lat: stop.latitude, lng: stop.longitude };
    }
    return null;
  };

  const originCoords = getCoords(origin);
  const destCoords = getCoords(destination);

  if (!originCoords || !destCoords) return null;

  const originLatLng = `${originCoords.lat},${originCoords.lng}`;
  const destinationLatLng = `${destCoords.lat},${destCoords.lng}`;

  // Criar waypoints para os pontos intermediários (máximo 8 waypoints)
  const waypoints = stops.slice(1, -1).slice(0, 8)
    .map((stop: any) => {
      const coords = getCoords(stop);
      return coords ? `${coords.lat},${coords.lng}` : null;
    })
    .filter(Boolean)
    .join('|');

  // Construir URL do Google Maps Static API
  let url = `https://maps.googleapis.com/maps/api/staticmap?`;
  url += `size=600x300`;
  url += `&scale=2`;
  url += `&maptype=roadmap`;
  url += `&markers=color:green|label:A|${originLatLng}`;
  url += `&markers=color:red|label:B|${destinationLatLng}`;

  // Adicionar waypoints como markers
  if (waypoints) {
    const waypointArray = waypoints.split('|');
    waypointArray.forEach((wp: string, idx: number) => {
      url += `&markers=color:blue|label:${idx + 1}|${wp}`;
    });
  }

  // Adicionar a rota
  url += `&path=color:0x4285F4|weight:3|${originLatLng}`;
  if (waypoints) {
    url += `|${waypoints}`;
  }
  url += `|${destinationLatLng}`;

  url += `&key=${apiKey}`;

  return url;
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'in_progress':
      return {
        label: 'Em Andamento',
        icon: Car,
        className: 'bg-blue-500/20 text-blue-500 dark:text-blue-400',
      };
    case 'dispatched':
      return {
        label: 'Pendente',
        icon: Clock,
        className: 'bg-orange-500/20 text-orange-500 dark:text-orange-400',
      };
    case 'completed':
      return {
        label: 'Concluída',
        icon: CheckCircle,
        className: 'bg-green-500/20 text-green-500 dark:text-green-400',
      };
    default:
      return {
        label: 'Desconhecido',
        icon: Clock,
        className: 'bg-gray-500/20 text-gray-500',
      };
  }
};

const getTotalWeight = (stops: any[]) => {
  // Placeholder - você pode calcular o peso real se tiver essa informação
  return Math.floor(Math.random() * 100) + 50;
};

export default function MyRoutesPage() {
  const { user } = useAuth();
  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }

    const q = query(
      collection(db, 'routes'),
      where('driverId', '==', user.uid),
      where('status', 'in', ['dispatched', 'in_progress'])
    );

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

        // Ordenar: in_progress > dispatched
        routesData.sort((a, b) => {
          const order = { in_progress: 0, dispatched: 1 };
          return order[a.status] - order[b.status];
        });

        setRoutes(routesData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching routes: ', error);
        toast({
          variant: 'destructive',
          title: 'Erro ao buscar rotas',
          description: 'Ocorreu um erro ao carregar suas rotas.',
        });
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, toast]);

  const stats = React.useMemo(() => {
    return {
      totalRoutes: routes.length,
      totalStops: routes.reduce((acc, route) => acc + route.stops.length, 0),
      totalDistance: routes.reduce((acc, route) => acc + (route.distanceMeters || 0), 0),
    };
  }, [routes]);

  if (isLoading) {
    return <MyRoutesPageSkeleton />;
  }

  if (routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-12 h-[calc(100vh-10rem)]">
        <RouteIcon className="h-16 w-16 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Nenhuma rota disponível</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Quando uma rota for atribuída a você, ela aparecerá aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Headline */}
      <h2 className="text-2xl font-bold px-4 pb-3 pt-5">Seu resumo de hoje</h2>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 p-4">
        <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-xl p-4 bg-card border">
          <p className="text-sm font-medium text-muted-foreground">Rotas</p>
          <p className="text-3xl font-bold">{stats.totalRoutes}</p>
        </div>
        <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-xl p-4 bg-card border">
          <p className="text-sm font-medium text-muted-foreground">Paradas</p>
          <p className="text-3xl font-bold">{stats.totalStops}</p>
        </div>
        <div className="flex min-w-[158px] flex-1 flex-col gap-2 rounded-xl p-4 bg-card border">
          <p className="text-sm font-medium text-muted-foreground">Distância</p>
          <p className="text-3xl font-bold">{formatDistance(stats.totalDistance)} km</p>
        </div>
      </div>

      {/* Section Header */}
      <h2 className="text-xl font-bold px-4 pb-3 pt-5">Rotas Atribuídas</h2>

      {/* Route Cards */}
      <div className="px-4 pb-4 space-y-4">
        {routes.map((route) => {
          const statusInfo = getStatusBadge(route.status);
          const StatusIcon = statusInfo.icon;
          const mapUrl = getRouteMapUrl(route.stops);

          return (
            <div
              key={route.id}
              className="flex flex-col items-stretch justify-start rounded-xl shadow-sm bg-card border overflow-hidden"
            >
              {/* Map Thumbnail */}
              <div className="w-full bg-muted aspect-[2/1] relative flex items-center justify-center overflow-hidden">
                {mapUrl ? (
                  <img
                    src={mapUrl}
                    alt={`Mapa da rota ${route.name}`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <MapPin className="h-12 w-12 text-muted-foreground/30" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              </div>

              {/* Content */}
              <div className="flex w-full grow flex-col items-stretch justify-center gap-4 p-4">
                {/* Header with Status */}
                <div className="flex justify-between items-start">
                  <p className="text-lg font-bold">{route.name}</p>
                  <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${statusInfo.className}`}>
                    <StatusIcon className="h-4 w-4" />
                    <span>{statusInfo.label}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 text-muted-foreground text-sm">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4" />
                    <span>{route.stops.length} Paradas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <RouteIcon className="h-4 w-4" />
                    <span>{formatDistance(route.distanceMeters)} km</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Weight className="h-4 w-4" />
                    <span>{getTotalWeight(route.stops)} kg</span>
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  asChild
                  className="w-full mt-2"
                >
                  <Link href={`/my-routes/${route.id}`}>
                    {route.status === 'in_progress' && 'Ver Detalhes'}
                    {route.status === 'dispatched' && 'Iniciar Rota'}
                  </Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
