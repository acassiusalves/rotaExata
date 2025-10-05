
'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  MapPin,
  ArrowRightLeft,
  Loader2,
  History,
  CheckCircle,
} from 'lucide-react';
import { db } from '@/lib/firebase/client';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

type RouteDocument = {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  plannedDate: Timestamp;
  completedAt?: Timestamp;
  stops: any[];
  distanceMeters: number;
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(0);

const RouteHistoryCard: React.FC<{ route: RouteDocument }> = ({ route }) => (
  <Card className="w-full shadow-md">
    <CardContent className="pt-6">
      <div className="text-center space-y-2">
        <h3 className="font-semibold text-lg">{route.name}</h3>
        <p className="text-sm text-muted-foreground">
          Concluída em:{' '}
          {route.completedAt
            ? format(route.completedAt.toDate(), 'dd/MM/yyyy - HH:mm', {
                locale: ptBR,
              })
            : 'Data indisponível'}
        </p>
        <div className="flex justify-around items-center pt-4">
          <div className="flex flex-col items-center gap-1">
            <MapPin className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs font-bold">{route.stops.length} PARADAS</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs font-bold">{formatDistance(route.distanceMeters)}KM</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="text-xs font-bold">CONCLUÍDA</span>
          </div>
        </div>
      </div>
    </CardContent>
    <CardFooter>
      <Button asChild className="w-full text-accent font-bold" variant="link">
        <Link href={`/my-routes/${route.id}`}>VER DETALHES</Link>
      </Button>
    </CardFooter>
  </Card>
);

export default function MyRoutesHistoryPage() {
  const { user } = useAuth();
  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const { toast } = useToast();

  React.useEffect(() => {
    if (!user) {
        setIsLoading(false);
        return;
    };

    const q = query(
        collection(db, 'routes'), 
        where('driverId', '==', user.uid),
        where('status', '==', 'completed')
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
        // Sort by completion date, most recent first
        routesData.sort((a, b) => (b.completedAt?.toMillis() || 0) - (a.completedAt?.toMillis() || 0));
        setRoutes(routesData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching route history: ', error);
        toast({ variant: 'destructive', title: 'Erro ao buscar histórico', description: 'Não foi possível carregar as rotas concluídas.' });
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, toast]);

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-12 h-[calc(100vh-10rem)]">
        <History className="h-16 w-16 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Nenhuma rota no histórico</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          As rotas que você completar aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4 px-4">
      {routes.map((route) => (
        <RouteHistoryCard key={route.id} route={route} />
      ))}
    </div>
  );
}
