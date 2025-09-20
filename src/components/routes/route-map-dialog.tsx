
"use client";

import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RouteMap } from '@/components/maps/RouteMap';
import { doc, Timestamp } from 'firebase/firestore';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';

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

interface RouteMapDialogProps {
    isOpen: boolean;
    onClose: () => void;
    route: RouteDocument;
}

export function RouteMapDialog({ isOpen, onClose, route }: RouteMapDialogProps) {
  if (!route) return null;

  const mapRoute: RouteInfo = {
    stops: route.stops,
    encodedPolyline: route.encodedPolyline,
    distanceMeters: route.distanceMeters,
    duration: route.duration,
    color: route.color,
    visible: true,
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
                            <p className="text-xs font-mono uppercase text-gray-300">{route.driverInfo?.plate}</p>
                        </div>
                    </div>
                     <Button variant="ghost" size="icon" className="rounded-full bg-gray-900/80 text-white hover:bg-gray-700 hover:text-white" onClick={onClose}>
                        <X className="h-6 w-6" />
                    </Button>
                </header>
                <div className="absolute left-4 top-20 z-10">
                    <Badge variant="secondary" className="shadow-lg">Rota enviada ao operador</Badge>
                </div>
                <RouteMap height={-1} origin={route.origin} routes={[mapRoute]} />
            </div>
        </DialogContent>
    </Dialog>
  );
}

