
'use client';

import * as React from 'react';
import { notFound } from 'next/navigation';
import {
  ChevronLeft,
  CircleUserRound,
  Navigation,
  Phone,
  CheckCircle2,
  Circle,
  Loader2,
  MapPin,
  Clock,
  Milestone,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { db } from '@/lib/firebase/client';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import Link from 'next/link';

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

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(1);
const formatDuration = (durationString: string = '0s') => {
  const seconds = parseInt(durationString.replace('s', ''), 10);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};


export default function RouteDetailsPage({ params }: { params: { id: string } }) {
  const [route, setRoute] = React.useState<RouteDocument | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const docRef = doc(db, 'routes', params.id);
    const unsubscribe = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          setRoute({ id: docSnap.id, ...docSnap.data() } as RouteDocument);
        } else {
          console.error('No such document!');
          notFound();
        }
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching route:', error);
        setIsLoading(false);
        notFound();
      }
    );

    return () => unsubscribe();
  }, [params.id]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!route) {
    return null; // or a not found component
  }

  return (
    <div className="bg-background">
        <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background px-4">
            <Button asChild variant="ghost" size="icon">
                <Link href="/my-routes">
                    <ChevronLeft className="h-6 w-6" />
                </Link>
            </Button>
            <h1 className="text-lg font-semibold">{route.name}</h1>
            <div className="ml-auto flex items-center gap-2">
                <Avatar className="h-8 w-8">
                    <AvatarFallback>{route.driverInfo ? getInitials(route.driverInfo.name) : 'N/A'}</AvatarFallback>
                </Avatar>
            </div>
      </header>

      <main className="p-4 space-y-4">
        <Card>
            <CardContent className="grid grid-cols-3 gap-4 pt-6 text-center text-sm">
                <div className="flex flex-col items-center gap-1">
                    <MapPin className="h-5 w-5 text-muted-foreground" />
                    <span className="font-bold">{route.stops.length}</span>
                    <span className="text-xs text-muted-foreground">PARADAS</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <Milestone className="h-5 w-5 text-muted-foreground" />
                    <span className="font-bold">{formatDistance(route.distanceMeters)}</span>
                    <span className="text-xs text-muted-foreground">KM</span>
                </div>
                <div className="flex flex-col items-center gap-1">
                    <Clock className="h-5 w-5 text-muted-foreground" />
                    <span className="font-bold">{formatDuration(route.duration)}</span>
                     <span className="text-xs text-muted-foreground">TEMPO</span>
                </div>
            </CardContent>
        </Card>

        <div className="space-y-4">
            {route.stops.map((stop, index) => (
                <div key={stop.id || index}>
                    <div className="flex items-start gap-4">
                        <div className="flex flex-col items-center gap-1">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-primary font-bold">
                                {index + 1}
                            </div>
                            {index < route.stops.length - 1 && (
                                <div className="w-px h-8 bg-border"></div>
                            )}
                        </div>
                        <div className="flex-1 space-y-2">
                            <div className="font-semibold">{stop.customerName || 'Endereço'}</div>
                            <p className="text-sm text-muted-foreground">{stop.address}</p>
                            <div className="flex gap-2 pt-2">
                                 <Button size="sm" variant="outline">
                                    <Navigation className="mr-2 h-4 w-4" />
                                    Navegar
                                 </Button>
                                 <Button size="sm" variant="outline">
                                    <Phone className="mr-2 h-4 w-4" />
                                    Ligar
                                </Button>
                                <Button size="sm" variant="default" className="ml-auto bg-green-600 hover:bg-green-700">
                                    <CheckCircle2 className="mr-2 h-4 w-4" />
                                    Confirmar
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </main>
    </div>
  );
}

