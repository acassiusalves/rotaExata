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
import Image from 'next/image';
import { placeholderImages } from '@/lib/placeholder-images';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { Driver, RouteInfo } from '@/lib/types';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  plannedDate: Timestamp;
};

export default function DashboardPage() {
  const mapImage = placeholderImages.find((p) => p.id === 'map1');

  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [drivers, setDrivers] = React.useState<Driver[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    // Firestore listener for routes
    const routesQuery = query(collection(db, 'routes'));
    const unsubscribeRoutes = onSnapshot(routesQuery, (snapshot) => {
      const routesData: RouteDocument[] = [];
      snapshot.forEach((doc) => {
        routesData.push({ id: doc.id, ...doc.data() } as RouteDocument);
      });
      setRoutes(routesData);
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
              {mapImage && (
                <Image
                  src={mapImage.imageUrl}
                  alt="Mapa com a localização dos motoristas"
                  fill
                  className="object-cover"
                  data-ai-hint={mapImage.imageHint}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
              <div className="absolute bottom-4 left-4">
                <p className="text-sm font-semibold text-white">
                  Visualização em tempo real
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
