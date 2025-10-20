
"use client";

import * as React from 'react';
import { X, Navigation, Share2, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteMap } from '@/components/maps/RouteMap';
import { doc, Timestamp, onSnapshot, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import type { PlaceValue, RouteInfo, DriverLocation, DriverLocationWithInfo } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { format, startOfDay, endOfDay } from 'date-fns';
import { setDoc, serverTimestamp } from 'firebase/firestore';

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
  const [driverLocations, setDriverLocations] = React.useState<DriverLocationWithInfo[]>([]);
  const [currentStopIndex, setCurrentStopIndex] = React.useState<number>(0);
  const [copied, setCopied] = React.useState(false);
  const [allRoutes, setAllRoutes] = React.useState<RouteDocument[]>([]);
  const [routeVisibility, setRouteVisibility] = React.useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // Load all routes from the same date
  React.useEffect(() => {
    if (!route?.plannedDate || !isOpen) return;

    const loadRoutesFromSameDay = async () => {
      try {
        const routeDate = route.plannedDate.toDate();
        const dayStart = Timestamp.fromDate(startOfDay(routeDate));
        const dayEnd = Timestamp.fromDate(endOfDay(routeDate));

        const q = query(
          collection(db, 'routes'),
          where('plannedDate', '>=', dayStart),
          where('plannedDate', '<=', dayEnd)
        );

        const querySnapshot = await getDocs(q);
        const routes: RouteDocument[] = [];
        const visibility: Record<string, boolean> = {};

        querySnapshot.forEach((doc) => {
          const routeData = {
            id: doc.id,
            ...doc.data(),
          } as RouteDocument;

          routes.push(routeData);
          // Main route visible, others hidden by default
          visibility[doc.id] = doc.id === route.id;
        });

        console.log('📍 Rotas carregadas:', routes.length);
        console.log('📍 Rota principal ID:', route.id);
        console.log('📍 Visibilidade:', visibility);
        console.log('📍 Rotas:', routes.map(r => ({ id: r.id, name: r.name })));

        setAllRoutes(routes);
        setRouteVisibility(visibility);
      } catch (error) {
        console.error('Error loading routes from same day:', error);
      }
    };

    loadRoutesFromSameDay();
  }, [route?.id, route?.plannedDate, isOpen]);

  // Subscribe to real-time updates for the main route
  React.useEffect(() => {
    if (!route?.id || !isOpen) {
      setDriverLocation(null);
      setDriverLocations([]);
      return;
    }

    console.log('🎯 Iniciando monitoramento da rota:', route.id);

    const routeRef = doc(db, 'routes', route.id);
    const unsubscribe = onSnapshot(routeRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        console.log('📡 Dados da rota recebidos:', {
          hasCurrentLocation: !!data.currentLocation,
          currentLocation: data.currentLocation,
          currentStopIndex: data.currentStopIndex,
          status: data.status
        });

        if (data.currentLocation && data.driverInfo && data.driverId) {
          const location = data.currentLocation;
          const timestamp = location.timestamp?.toDate?.() || new Date();

          // Update singular driverLocation (for backward compatibility)
          setDriverLocation(location as DriverLocation);

          // Also add to driverLocations array so it has InfoWindow with refresh button
          const driverLocationWithInfo: DriverLocationWithInfo = {
            driverId: data.driverId,
            driverName: data.driverInfo.name,
            lat: location.lat,
            lng: location.lng,
            accuracy: location.accuracy || 0,
            heading: location.heading,
            speed: location.speed,
            timestamp,
          };

          setDriverLocations([driverLocationWithInfo]);
          console.log('✅ Localização do motorista atualizada:', {
            driverId: data.driverId,
            driverName: data.driverInfo.name,
            location
          });
        } else {
          console.log('⚠️ Nenhuma localização disponível');
          setDriverLocations([]);
        }

        if (data.currentStopIndex !== undefined) {
          setCurrentStopIndex(data.currentStopIndex);
        }
      }
    });

    return () => {
      console.log('🛑 Parando monitoramento da rota:', route.id);
      unsubscribe();
    };
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

  const toggleRouteVisibility = (routeId: string) => {
    setRouteVisibility(prev => ({
      ...prev,
      [routeId]: !prev[routeId]
    }));
  };

  const handleRefreshDriverLocation = async (driverId: string) => {
    try {
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
      console.error('Erro ao solicitar atualização:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar',
        description: 'Não foi possível solicitar a atualização da localização.',
      });
    }
  };

  if (!route) return null;

  // Convert all routes to RouteInfo format with visibility
  const mapRoutes: RouteInfo[] = allRoutes.map(r => ({
    stops: r.stops,
    encodedPolyline: r.encodedPolyline,
    distanceMeters: r.distanceMeters,
    duration: r.duration,
    color: r.color,
    visible: routeVisibility[r.id] ?? false,
    // Only add location for the main route
    currentLocation: r.id === route.id ? (driverLocation || undefined) : undefined,
    currentStopIndex: r.id === route.id ? currentStopIndex : undefined,
  }));

  console.log('🗺️ Total de rotas no estado:', allRoutes.length);
  console.log('🗺️ Rotas para renderizar no mapa:', mapRoutes.length);
  console.log('🗺️ Visibilidade das rotas:', mapRoutes.map(r => ({
    stops: r.stops.length,
    color: r.color,
    visible: r.visible
  })));

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

                {/* Routes list with visibility toggles */}
                {allRoutes.length > 1 && (
                  <div className="absolute right-4 top-20 z-10 flex flex-col gap-2 max-w-xs">
                    <div className="bg-white rounded-lg shadow-lg p-3">
                      <h3 className="text-sm font-semibold mb-2">Rotas do Período</h3>
                      <div className="space-y-1">
                        {allRoutes.map(r => (
                          <button
                            key={r.id}
                            onClick={() => toggleRouteVisibility(r.id)}
                            className="w-full flex items-center justify-between p-2 rounded hover:bg-gray-100 transition-colors text-left"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: r.color }}
                              />
                              <span className="text-sm font-medium truncate">{r.name}</span>
                              {r.id === route.id && (
                                <Badge variant="outline" className="text-xs">Principal</Badge>
                              )}
                            </div>
                            {routeVisibility[r.id] ? (
                              <Eye className="h-4 w-4 text-primary flex-shrink-0" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <RouteMap
                    height={-1}
                    origin={route.origin}
                    routes={mapRoutes}
                    driverLocation={driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng, heading: driverLocation.heading } : undefined}
                    driverLocations={driverLocations}
                    onRefreshDriverLocation={handleRefreshDriverLocation}
                />
            </div>
        </DialogContent>
    </Dialog>
  );
}
