
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
  ShoppingBag,
  Loader2,
  Route,
  Bell,
} from 'lucide-react';
import { db } from '@/lib/firebase/client';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { useAuth } from '@/hooks/use-auth';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { requestPushPermission, saveCourierToken, onForegroundNotification } from '@/lib/firebase/messaging';

type RouteDocument = {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  plannedDate: Timestamp;
  stops: any[];
  distanceMeters: number;
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(0);

const RouteCard: React.FC<{ route: RouteDocument }> = ({ route }) => (
  <Card className="w-full shadow-md">
    <CardContent className="pt-6">
      <div className="text-center space-y-2">
        <h3 className="font-semibold text-lg">{route.name}</h3>
        <p className="text-sm text-muted-foreground">
          {format(route.plannedDate.toDate(), 'dd/MM/yyyy - HH:mm', {
            locale: ptBR,
          })}
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
          <div className="flex flex-col items-center gap-1">
            <ShoppingBag className="h-5 w-5 text-muted-foreground" />
            <span className="text-xs font-bold">11.200KG</span>
          </div>
        </div>
      </div>
    </CardContent>
    <CardFooter>
      <Button asChild className="w-full text-accent font-bold" variant="link">
        <Link href={`/my-routes/${route.id}`}>VISUALIZAR</Link>
      </Button>
    </CardFooter>
  </Card>
);

export default function MyRoutesPage() {
  const { user } = useAuth();
  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isPushLoading, setIsPushLoading] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    // Listen for incoming messages when the app is in the foreground
    onForegroundNotification(() => {
      toast({ title: 'Nova rota recebida!', description: 'Uma nova rota foi atribuída a você.' });
    });
  }, [toast]);

  async function enablePush() {
    if (!user) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Você precisa estar logado.' });
      return;
    }
    setIsPushLoading(true);
    try {
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_KEY;
      if (!vapidKey) {
        throw new Error('VAPID key não configurada no ambiente.');
      }
      const token = await requestPushPermission(vapidKey);
      await saveCourierToken(user.uid, token);
      toast({ title: 'Notificações ativadas!', description: 'Você receberá alertas de novas rotas.' });
    } catch (e: any) {
      console.error('Push notification error:', e);
      toast({ variant: 'destructive', title: 'Erro ao ativar notificações', description: e.message });
    } finally {
        setIsPushLoading(false);
    }
  }


  React.useEffect(() => {
    if (!user) {
        setIsLoading(false);
        return;
    };

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
        setRoutes(routesData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching routes: ', error);
        toast({ variant: 'destructive', title: 'Erro ao buscar rotas', description: 'Você não tem permissão para ver estas rotas ou ocorreu um erro.' });
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
        <Route className="h-16 w-16 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Nenhuma rota para hoje</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Quando uma rota for atribuída a você, ela aparecerá aqui.
        </p>
         <Button onClick={enablePush} disabled={isPushLoading} className="mt-6">
            {isPushLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            {isPushLoading ? 'Ativando...' : 'Ativar Notificações'}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 py-4">
       <div className="flex items-center justify-between px-4">
        <h1 className="text-xl font-bold">Minhas Rotas</h1>
         <Button onClick={enablePush} disabled={isPushLoading} variant="outline" size="sm">
            {isPushLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}
            Notificações
        </Button>
      </div>
      {routes.map((route) => (
        <RouteCard key={route.id} route={route} />
      ))}
    </div>
  );
}
