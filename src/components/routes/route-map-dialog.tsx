
"use client";

import * as React from 'react';
import { X, Navigation, Share2, Copy, Check, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteMap } from '@/components/maps/RouteMap';
import { usePathname } from 'next/navigation';
import type { Timestamp } from 'firebase/firestore';
import { useStaff } from '@/components/staff/staff-session';
import { useStaffQuery } from '@/components/staff/use-staff-query';
import { staffRouteDates } from '@/lib/staff/route-dates';
import type { PlaceValue, RouteInfo, DriverLocation, DriverLocationWithInfo } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

export type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  driverInfo: {
    name: string;
    vehicle: string | { type: string, plate: string };
    plate?:string;
  } | null;
  plannedDate: Timestamp | Date;
  driverId?:string;
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
  const [copied, setCopied] = React.useState(false);
  const [routeVisibility, setRouteVisibility] = React.useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const {request}=useStaff();
  const view=usePathname()==='/routes/monitoring' ? 'monitor':'history';
  const routeId=route.id;
  const load=React.useCallback(async(signal:AbortSignal)=>{
    if (!isOpen) return null;
    const result=await request<{selected:RouteDocument;routes:RouteDocument[]}>(
      '/api/staff/routes/'+encodeURIComponent(routeId)+'/map?view='+view,{signal});
    return staffRouteDates<typeof result>(result);
  },[request,isOpen,routeId,view]);
  const {data,error}=useStaffQuery(load,8000);
  const current=data?.selected.id===routeId ? data.selected:route;
  const allRoutes=data?.selected.id===routeId ? data.routes:[route];
  const driverLocation:DriverLocation|null=current.currentLocation ?? null;
  const driverLocations:DriverLocationWithInfo[]=driverLocation && current.driverId && current.driverInfo ?
    [{...driverLocation,driverId:current.driverId,driverName:current.driverInfo.name}]:[];
  const currentStopIndex=current.currentStopIndex ?? 0;

  React.useEffect(()=>setRouteVisibility({[routeId]:true}),[routeId]);

  const handleCopyTrackingLink = async () => {
    const trackingUrl = `${window.location.origin}/track/${route.id}`;

    try {
      await navigator.clipboard.writeText(trackingUrl);
      setCopied(true);
      toast({
        title: 'Link copiado!',
        description: 'Copiamos o link de acompanhamento interno. A conta precisa ter acesso à rota.',
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
          title: `Acompanhamento interno: ${route.name}`,
          text: 'Entre com uma conta autorizada no RotaExata.',
          url: trackingUrl,
        });
      } catch (err) {
        // User cancelled or error occurred
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
      await request('/api/staff/routes/'+encodeURIComponent(routeId)+'/location',{
        method:'POST',body:JSON.stringify({driverId,view:'monitor'}),
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
                            <p className="text-xs font-mono uppercase text-gray-300">{typeof route.driverInfo?.vehicle==='object' ? route.driverInfo.vehicle.plate : route.driverInfo?.plate}</p>
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
                            Compartilhar link interno
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

                {!!error && <p role="status" className="absolute bottom-4 left-4 z-10 rounded bg-background p-2">Não foi possível atualizar o mapa.</p>}

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
                    driverLocation={driverLocation ? { lat: driverLocation.lat, lng: driverLocation.lng, heading: driverLocation.heading ?? undefined } : undefined}
                    driverLocations={driverLocations}
                    onRefreshDriverLocation={handleRefreshDriverLocation}
                />
            </div>
        </DialogContent>
    </Dialog>
  );
}
