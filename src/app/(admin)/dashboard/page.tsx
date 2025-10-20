'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Users,
  Package,
  Clock,
  CheckCircle2,
  MapPin,
  LineChart,
  Loader2,
} from 'lucide-react';
import { KpiCard } from '@/components/dashboard/kpi-card';
import {
  DeliveriesChart,
  StatusChart,
} from '@/components/dashboard/charts';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { RouteMap } from '@/components/maps/RouteMap';
import { placeholderImages } from '@/lib/placeholder-images';
import { collection, onSnapshot, query, where, Timestamp, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { Driver, RouteInfo, DriverLocationWithInfo } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  plannedDate: Timestamp;
  driverId?: string;
  driverInfo?: {
    name: string;
    vehicle: {
      type: string;
      plate: string;
    };
  } | null;
};

export default function DashboardPage() {
  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [driverLocations, setDriverLocations] = React.useState<DriverLocationWithInfo[]>([]);
  const { toast } = useToast();

  React.useEffect(() => {
    // Firestore listener for routes
    const routesQuery = query(collection(db, 'routes'), where('status', 'in', ['in_progress', 'dispatched']));
    const unsubscribeRoutes = onSnapshot(routesQuery, (snapshot) => {
      const routesData: RouteDocument[] = [];
      const locationsMap = new Map<string, DriverLocationWithInfo>();
      const now = new Date();

      snapshot.forEach((doc) => {
        const route = { id: doc.id, ...doc.data() } as RouteDocument;
        routesData.push(route);

        // Só adicionar localização se:
        // 1. Tem currentLocation
        // 2. Status é in_progress
        // 3. Tem driverInfo com nome
        // 4. Tem driverId válido
        if (route.currentLocation && route.status === 'in_progress' && route.driverInfo && route.driverId) {
          const timestamp = route.currentLocation.timestamp instanceof Date
            ? route.currentLocation.timestamp
            : route.currentLocation.timestamp.toDate();

          // Filtrar localizações antigas (mais de 30 minutos)
          const minutesAgo = (now.getTime() - timestamp.getTime()) / (1000 * 60);
          if (minutesAgo > 30) {
            console.warn(`⚠️ Localização antiga ignorada: ${route.driverInfo.name} (${minutesAgo.toFixed(1)} minutos atrás)`);
            return;
          }

          const location: DriverLocationWithInfo = {
            ...route.currentLocation,
            driverId: route.driverId, // Usar driverId correto da rota
            driverName: route.driverInfo.name,
          };

          // Manter apenas a localização mais recente de cada motorista
          const existing = locationsMap.get(route.driverId);
          if (!existing) {
            locationsMap.set(route.driverId, location);
          } else {
            const existingTime = existing.timestamp instanceof Date
              ? existing.timestamp
              : existing.timestamp.toDate();
            if (timestamp > existingTime) {
              locationsMap.set(route.driverId, location);
              console.log(`🔄 Atualizando localização mais recente de ${route.driverInfo.name}`);
            }
          }
        }
      });

      setRoutes(routesData);
      setDriverLocations(Array.from(locationsMap.values()));
      setIsLoading(false);
    });

    // Firestore listener for drivers
    const driversQuery = query(collection(db, 'users'), where('role', '==', 'driver'));
    const unsubscribeDrivers = onSnapshot(driversQuery, (snapshot) => {
      const driversData: Driver[] = [];
      snapshot.forEach((doc) => {
        driversData.push({ id: doc.id, ...doc.data() } as Driver);
      });
      setDrivers(driversData);
    });

    return () => {
      unsubscribeRoutes();
      unsubscribeDrivers();
    };
  }, []);

  const getTodayDeliveries = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayRoutes = routes.filter(route => {
      const routeDate = route.plannedDate.toDate();
      return routeDate >= today && routeDate < tomorrow;
    });

    return todayRoutes.reduce((total, route) => total + (route.stops?.length || 0), 0);
  };
  
  const getActiveDrivers = () => {
    return drivers.filter(driver => driver.status === 'online' || driver.status === 'busy').length;
  };

  const handleRefreshDriverLocation = async (driverId: string) => {
    try {
      console.log(`🔄 Forçando atualização de localização para motorista: ${driverId}`);

      // Criar documento de solicitação de atualização
      const requestRef = doc(db, 'locationUpdateRequests', driverId);
      await setDoc(requestRef, {
        driverId,
        requestedAt: serverTimestamp(),
        status: 'pending',
      });

      toast({
        title: 'Atualização solicitada',
        description: 'A localização do motorista será atualizada em breve.',
      });
    } catch (error) {
      console.error('Erro ao solicitar atualização de localização:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar',
        description: 'Não foi possível solicitar a atualização da localização.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Total de Entregas (Hoje)"
          value={getTodayDeliveries().toString()}
          icon={Package}
        />
        <KpiCard
          title="Tempo Médio de Entrega"
          value="N/A"
          icon={Clock}
          trend="Cálculo em desenvolvimento"
        />
        <KpiCard
          title="SLA Cumprido"
          value="N/A"
          icon={CheckCircle2}
          trend="Cálculo em desenvolvimento"
        />
        <KpiCard
          title="Motoristas Ativos"
          value={`${getActiveDrivers()} / ${drivers.length}`}
          icon={Users}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5" />
              Entregas por Hora
            </CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <DeliveriesChart routes={routes} />
          </CardContent>
        </Card>
        <Card className="col-span-4 lg:col-span-3">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Status das Rotas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StatusChart routes={routes} />
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActivityFeed routes={routes} />
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Localização dos Motoristas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg">
                <RouteMap
                  driverLocations={driverLocations}
                  onRefreshDriverLocation={handleRefreshDriverLocation}
                />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
