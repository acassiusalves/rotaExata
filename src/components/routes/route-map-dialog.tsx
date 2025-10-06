
"use client";

import * as React from 'react';
import { X, Navigation, Share2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteMap } from '@/components/maps/RouteMap';
import { doc, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { PlaceValue, RouteInfo, DriverLocation } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  driverInfo: {
    name: string;
    vehicle: { type: string, plate: string };
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

interface RouteMapDialogProps {
    isOpen: boolean;
    onClose: () => void;
    route: RouteDocument;
}

export function RouteMapDialog({ isOpen, onClose, route }: RouteMapDialogProps) {
  const [driverLocation, setDriverLocation] = React.useState<DriverLocation | null>(null);
  const [currentStopIndex, setCurrentStopIndex] = React.useState<number>(0);
  const [copied, setCopied] = React.useState(false);
  const { toast } = useToast();

  // Subscribe to real-time updates
  React.useEffect(() => {
    if (!route?.id || !isOpen) return;

    const routeRef = doc(db, 'routes', route.id);
    const unsubscribe = onSnapshot(routeRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        if (data.currentLocation) {
          setDriverLocation(data.currentLocation as DriverLocation);
        }
        if (data.currentStopIndex !== undefined) {
          setCurrentStopIndex(data.currentStopIndex);
        }
      }
    });

    return () => unsubscribe();
  }, [route?.id, isOpen]);

  const handleCopyTrackingLink = async () => {
    const trackingUrl = `${window.location.origin}/track/${route.id}`;

    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopied(true);
      toast({
        title: 'Link copiado!',
        description: 'O link de rastreamento foi copiado para a área de transferência.',
      });

      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível copiar o link.',
      });
    }
  };

  const handleShareTrackingLink = async () => {
    const trackingUrl = `${window.location.origin}/track/${route.id}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: `Rastreamento: ${route.name}`,
          text: `Acompanhe sua entrega em tempo real`,
          url: trackingUrl,
        });
      } catch (err) {
        // User cancelled or error occurred
        console.log('Share cancelled or failed:', err);
      }
    } else {
      // Fallback to copy
      handleCopyTrackingLink();
    }
  };

  if (!route) return null;

  const mapRoute: RouteInfo = {
    stops: route.stops,
    encodedPolyline: route.encodedPolyline,
    distanceMeters: route.distanceMeters,
    duration: route.duration,
    color: route.color,
    visible: true,
    currentLocation: driverLocation || undefined,
    currentStopIndex,
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-0">
             <DialogHeader className="sr-only">
              <DialogTitle>Mapa da Rota: {route.name}</DialogTitle>
              <DialogDescription>
                Visualização em tempo real da rota atribuída a {route.driverInfo?.name}.
              </DialogDescription>
            </DialogHeader>
            <div className="relative flex-1 w-full h-full">
                <header className="absolute left-0 top-0 z-10 flex w-full items-center justify-between bg-gradient-to-b from-black/50 to-transparent p-4">
                    <div className="flex items-center gap-3 rounded-full bg-gray-900/80 p-2 pr-4 text-white shadow-lg backdrop-blur-sm">
                        <Avatar className="h-10 w-10 border-2 border-gray-600">
                            <AvatarFallback>
                                {route.driverInfo ? getInitials(route.driverInfo.name) : 'N/A'}
                            </AvatarFallback>
                        </Avatar>
                        <div>
                            <h1 className="text-base font-bold leading-none">{route.driverInfo?.name}</h1>
                            <p className="text-xs font-mono uppercase text-gray-300">{route.driverInfo?.vehicle.plate}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-full bg-gray-900/80 text-white hover:bg-gray-700 hover:text-white"
                            onClick={handleShareTrackingLink}
                        >
                            <Share2 className="h-4 w-4 mr-2" />
                            Compartilhar
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-full bg-gray-900/80 text-white hover:bg-gray-700 hover:text-white"
                            onClick={handleCopyTrackingLink}
                        >
                            {copied ? <Check className="h-5 w-5" /> : <Copy className="h-5 w-5" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="rounded-full bg-gray-900/80 text-white hover:bg-gray-700 hover:text-white" onClick={onClose}>
                            <X className="h-6 w-6" />
                        </Button>
                    </div>
                </header>
                <div className="absolute left-4 top-20 z-10 flex flex-col gap-2">
                    <Badge variant="secondary" className="shadow-lg">
                        {route.status === 'in_progress' ? 'Em andamento' : route.status === 'completed' ? 'Concluída' : 'Rota enviada'}
                    </Badge>
                    {driverLocation && route.status === 'in_progress' && (
                        <Badge variant="default" className="shadow-lg flex items-center gap-2">
                            <Navigation className="h-3 w-3" />
                            Rastreando em tempo real
                        </Badge>
                    )}
                    {route.status === 'in_progress' && (
                        <Badge variant="outline" className="shadow-lg bg-white">
                            Parada {currentStopIndex + 1} de {route.stops.length}
                        </Badge>
                    )}
                </div>
                <RouteMap
                    height={-1}
                    origin={route.origin}
                    routes={[mapRoute]}
                    driverLocation={driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng, heading: driverLocation.heading } : undefined}
                />
            </div>
        </DialogContent>
    </Dialog>
  );
}
