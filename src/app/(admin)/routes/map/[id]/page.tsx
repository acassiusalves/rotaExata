
'use client';

import * as React from 'react';
import { notFound, useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteMap } from '@/components/maps/RouteMap';
import { db } from '@/lib/firebase/client';
import { doc, getDoc, Timestamp } from 'firebase/firestore';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

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

export default function RouteMapPage() {
  const router = useRouter();
  const params = useParams();
  const { id } = params;
  const [route, setRoute] = React.useState<RouteDocument | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!id || typeof id !== 'string') {
      setIsLoading(false);
      return;
    }

    const fetchRoute = async () => {
      try {
        const docRef = doc(db, 'routes', id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setRoute({ id: docSnap.id, ...docSnap.data() } as RouteDocument);
        } else {
          // notFound() could be used here if it's a server component
          console.log('No such document!');
        }
      } catch (error) {
        console.error('Error fetching route:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchRoute();
  }, [id]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!route) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-background">
        <p className="mb-4 text-lg">Rota não encontrada.</p>
        <Button onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
        </Button>
      </div>
    );
  }
  
  const mapRoute: RouteInfo = {
    stops: route.stops,
    encodedPolyline: route.encodedPolyline,
    distanceMeters: route.distanceMeters,
    duration: route.duration,
    color: route.color,
    visible: true,
  };

  return (
    <div className="relative h-screen w-screen">
      <header className="absolute left-0 top-0 z-10 flex w-full items-center justify-between bg-gradient-to-b from-black/50 to-transparent p-4">
        <div className="flex items-center gap-3 rounded-full bg-gray-900/80 p-2 pr-4 text-white shadow-lg backdrop-blur-sm">
            <Avatar className="h-10 w-10 border-2 border-gray-600">
                <AvatarFallback>
                    {route.driverInfo ? getInitials(route.driverInfo.name) : 'N/A'}
                </AvatarFallback>
            </Avatar>
            <div>
                <h1 className="text-base font-bold leading-none">{route.driverInfo?.name}</h1>
                <p className="text-xs font-mono uppercase text-gray-300">{route.driverInfo?.plate}</p>
            </div>
        </div>
        <Button variant="ghost" size="icon" className="rounded-full bg-gray-900/80 text-white hover:bg-gray-700 hover:text-white" onClick={() => router.back()}>
            <X className="h-6 w-6" />
        </Button>
      </header>
       <div className="absolute left-4 top-20 z-10">
          <Badge variant="secondary" className="shadow-lg">Rota enviada ao operador</Badge>
       </div>
       <RouteMap height={-1} origin={route.origin} routes={[mapRoute]} />
    </div>
  );
}
