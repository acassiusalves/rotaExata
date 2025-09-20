
'use client';

import * as React from 'react';
import {
  Home,
  Loader2,
  Route as RouteIcon,
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

const Rotograma: React.FC<{ stops: PlaceValue[], color?: string }> = ({ stops, color }) => (
  <div className="flex items-center gap-1">
    <div
      className="flex h-7 w-7 items-center justify-center rounded-md"
      style={{ backgroundColor: color || 'hsl(var(--accent))' }}
    >
      <Home className="h-4 w-4 text-white" />
    </div>
    {stops.slice(0, 10).map((stop, index) => (
      <div
        key={stop.id || index}
        className="flex h-7 w-7 items-center justify-center rounded-md border bg-muted text-xs font-semibold text-muted-foreground"
        title={stop.address}
      >
        {index + 1}
      </div>
    ))}
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
            {routes.map((route) => (
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
                    <p className="font-semibold">{route.driverInfo?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {route.driverInfo?.vehicle ? `${route.driverInfo.vehicle} - ${route.driverInfo.plate}` : 'Veículo não informado'}
                    </p>
                  </div>
                </div>
                <div className="col-span-1">
                  <Badge variant="secondary">{route.status}</Badge>
                </div>
                <div className="col-span-1 text-center font-medium">0/{route.stops.length}</div>
                <div className="col-span-1 text-center font-medium">0/{route.stops.length}</div>
                <div className="col-span-1 text-center font-medium text-destructive">0</div>
                <div className="col-span-1 text-center font-medium text-green-600">0</div>
                <div className="col-span-3">
                   <Rotograma stops={route.stops} color={route.color} />
                </div>
                <div className="col-span-1 text-right">
                  <Button variant="link" size="sm" onClick={() => handleOpenMap(route)}>
                    VER MAPA
                  </Button>
                </div>
              </div>
            ))}
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
    </>
  );
}
