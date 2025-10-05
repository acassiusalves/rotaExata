
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

const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    <path d="M14.05 14.05a2.5 2.5 0 0 0-3.53 0L9.25 15.32a1.5 1.5 0 0 1-2.12 0l-.7-.7a1.5 1.5 0 0 1 0-2.12l1.27-1.27a2.5 2.5 0 0 0 0-3.53l-1.27-1.27a1.5 1.5 0 0 1 0-2.12l.7-.7a1.5 1.5 0 0 1 2.12 0L10.52 9.47a2.5 2.5 0 0 0 3.53 0l1.27-1.27a1.5 1.5 0 0 1 2.12 0l.7.7a1.5 1.5 0 0 1 0 2.12L15.32 12.8a2.5 2.5 0 0 0 0 3.53z" />
  </svg>
);


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

  const handleNavigation = (stop: PlaceValue) => {
    if (!stop) return;
    const query = stop.lat && stop.lng 
      ? `${stop.lat},${stop.lng}` 
      : encodeURIComponent(stop.address);
    const url = `https://www.google.com/maps/search/?api=1&query=${query}`;
    window.open(url, '_blank');
  };

  const handleWhatsApp = (phone: string | undefined) => {
    if (!phone) return;
    const sanitizedPhone = phone.replace(/\D/g, ''); // Remove non-digit characters
    const url = `https://wa.me/${sanitizedPhone}`;
    window.open(url, '_blank');
  };


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
                                 <Button size="sm" variant="outline" onClick={() => handleNavigation(stop)}>
                                    <Navigation className="mr-2 h-4 w-4" />
                                    Navegar
                                 </Button>
                                 <Button size="sm" variant="outline" onClick={() => handleWhatsApp(stop.phone)} disabled={!stop.phone}>
                                    <WhatsAppIcon className="mr-2 h-4 w-4" />
                                    WhatsApp
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
