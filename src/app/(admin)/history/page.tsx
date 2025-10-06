
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { History, Loader2, MapPin, Milestone, User } from 'lucide-react';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import type { Driver, PlaceValue, RouteInfo } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';
import { RouteMapDialog } from '@/components/routes/route-map-dialog';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  plannedDate: Timestamp;
  completedAt?: Timestamp;
  origin: PlaceValue;
  driverInfo: {
    name: string;
    vehicle: string;
    plate: string;
  } | null;
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(2);

export default function HistoryPage() {
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = React.useState<string | null>(null);
  const [completedRoutes, setCompletedRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = React.useState(true);
  const [isLoadingRoutes, setIsLoadingRoutes] = React.useState(false);
  const [selectedRoute, setSelectedRoute] = React.useState<RouteDocument | null>(null);
  const [isMapOpen, setIsMapOpen] = React.useState(false);


  // Fetch drivers
  React.useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'driver'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const driversData: Driver[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        driversData.push({
          id: doc.id,
          name: data.displayName || data.name || 'Motorista sem nome',
          avatarUrl: data.photoURL || '',
          email: data.email,
          phone: data.phone,
          status: data.status,
          vehicle: data.vehicle,
          lastSeenAt: data.lastSeenAt,
          totalDeliveries: data.totalDeliveries,
          rating: data.rating,
        });
      });
      setDrivers(driversData);
      setIsLoadingDrivers(false);
    }, (error) => {
        console.error("Error fetching drivers: ", error);
        setIsLoadingDrivers(false);
    });

    return () => unsubscribe();
  }, []);
  
  // Fetch routes when a driver is selected
  React.useEffect(() => {
    if (!selectedDriverId) {
        setCompletedRoutes([]);
        return;
    }

    setIsLoadingRoutes(true);
    const q = query(
      collection(db, 'routes'),
      where('driverId', '==', selectedDriverId),
      where('status', '==', 'completed')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const routesData: RouteDocument[] = [];
      snapshot.forEach((doc) => {
        routesData.push({ id: doc.id, ...doc.data() } as RouteDocument);
      });
      // Sort by completion date descending
      routesData.sort((a, b) => (b.completedAt?.toMillis() || 0) - (a.completedAt?.toMillis() || 0));
      setCompletedRoutes(routesData);
      setIsLoadingRoutes(false);
    }, (error) => {
        console.error("Error fetching routes: ", error);
        setIsLoadingRoutes(false);
    });

    return () => unsubscribe();
  }, [selectedDriverId]);

  const handleOpenMap = (route: RouteDocument) => {
    setSelectedRoute(route);
    setIsMapOpen(true);
  };

  return (
    <>
      <div className="flex-1 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Histórico de Rotas</h2>
            <p className="text-muted-foreground">
              Selecione um motorista para consultar as rotas que já foram concluídas.
            </p>
          </div>
          <Select onValueChange={setSelectedDriverId} value={selectedDriverId || ''} disabled={isLoadingDrivers}>
            <SelectTrigger className="w-full sm:w-[300px]">
              <SelectValue placeholder={isLoadingDrivers ? "Carregando motoristas..." : "Selecione um motorista"} />
            </SelectTrigger>
            <SelectContent>
              {drivers.map(driver => (
                  <SelectItem key={driver.id} value={driver.id}>
                      <div className="flex items-center gap-2">
                          <Avatar className='h-6 w-6'>
                              <AvatarImage src={driver.avatarUrl} alt={driver.name} />
                              <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span>{driver.name}</span>
                      </div>
                  </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedDriverId && (
          <Card className="min-h-[400px] flex items-center justify-center border-dashed">
              <CardContent className="text-center pt-6">
                  <User className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Selecione um Motorista</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                      Escolha um motorista no menu acima para ver seu histórico.
                  </p>
              </CardContent>
          </Card>
        )}

        {isLoadingRoutes && (
          <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )}

        {!isLoadingRoutes && selectedDriverId && completedRoutes.length === 0 && (
          <Card className="min-h-[400px] flex items-center justify-center border-dashed">
              <CardContent className="text-center pt-6">
                  <History className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Nenhuma Rota no Histórico</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                      Este motorista ainda não completou nenhuma rota.
                  </p>
              </CardContent>
          </Card>
        )}

        {!isLoadingRoutes && completedRoutes.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {completedRoutes.map(route => (
                  <Card key={route.id} className="flex flex-col">
                      <CardHeader>
                          <CardTitle>{route.name}</CardTitle>
                          <CardDescription>
                              {route.completedAt ? `Concluída em ${format(route.completedAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` : 'Data de conclusão não registrada'}
                          </CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 space-y-4">
                          <div className="flex items-center gap-3 text-sm">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{route.stops.length} paradas</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                              <Milestone className="h-4 w-4 text-muted-foreground" />
                              <span>{formatDistance(route.distanceMeters)} km</span>
                          </div>
                      </CardContent>
                      <CardFooter>
                          <Button className="w-full" variant="secondary" onClick={() => handleOpenMap(route)}>
                            Ver detalhes no mapa
                          </Button>
                      </CardFooter>
                  </Card>
              ))}
            </div>
        )}
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
