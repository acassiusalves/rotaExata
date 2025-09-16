
'use client';

import * as React from 'react';
import Link from 'next/link';
import { PlusCircle, Route as RouteIcon, Truck, MapPin, Milestone, Clock, User, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase/client';
import { collection, onSnapshot, query, orderBy, Timestamp } from 'firebase/firestore';
import type { RouteInfo } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Extend RouteInfo to include fields from Firestore doc
type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  driverInfo: {
    name: string;
    vehicle: string;
  } | null;
  plannedDate: Timestamp;
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(2);
const formatDuration = (durationString: string = '0s') => {
  const seconds = parseInt(durationString.replace('s', ''), 10);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};


export default function RoutesPage() {
  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const q = query(collection(db, 'routes'), orderBy('plannedDate', 'desc'));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const routesData: RouteDocument[] = [];
      querySnapshot.forEach((doc) => {
        routesData.push({
          id: doc.id,
          ...doc.data(),
        } as RouteDocument);
      });
      setRoutes(routesData);
      setIsLoading(false);
    }, (error) => {
        console.error("Error fetching routes: ", error);
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Rotas Ativas</h2>
          <p className="text-muted-foreground">
            Visualize e gerencie as rotas que estão em andamento.
          </p>
        </div>
        <Button asChild>
          <Link href="/routes/new">
            <PlusCircle className="mr-2 h-4 w-4" />
            Criar Nova Rota
          </Link>
        </Button>
      </div>

      {isLoading ? (
         <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
         </div>
      ) : routes.length === 0 ? (
        <Card className="min-h-[400px] flex items-center justify-center border-dashed">
            <CardContent className="text-center pt-6">
                <RouteIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Nenhuma Rota Ativa</h3>
            <p className="mt-2 text-sm text-muted-foreground">
                As rotas criadas e despachadas aparecerão aqui.
            </p>
            <Button className="mt-4" asChild>
                <Link href="/routes/new">Criar Primeira Rota</Link>
            </Button>
            </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {routes.map((route) => (
            <Card key={route.id} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{route.name}</span>
                  <Badge variant={route.status === 'dispatched' ? 'default' : 'secondary'}>
                    {route.status === 'dispatched' ? 'Despachada' : 'Em Andamento'}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {format(route.plannedDate.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 space-y-4">
                 <div className="flex items-center gap-3 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{route.driverInfo?.name || 'Motorista não informado'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>{route.stops.length} paradas</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <Milestone className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDistance(route.distanceMeters)} km</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{formatDuration(route.duration)}</span>
                </div>
              </CardContent>
              <CardFooter>
                <Button className="w-full" variant="outline">
                    <Truck className="mr-2 h-4 w-4" />
                    Acompanhar Rota
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
