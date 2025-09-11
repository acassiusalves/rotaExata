"use client";

import * as React from 'react';
import {
  MapPin,
  Calendar,
  PlusCircle,
  Upload,
  Edit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RouteMap } from '@/components/maps/RouteMap';

export default function NewRoutePage() {
  // Mock data - replace with state and props as needed
  const routeOrigin = 'Av. Anhanguera, 456, Centro, Goiânia-GO';
  const routeDate = '12/12/2025';
  const routeTime = '18:10';

  return (
    <div className="grid h-full w-full grid-cols-[350px_1fr]">
      {/* Left Sidebar */}
      <div className="flex flex-col border-r bg-background">
        <div className="flex h-16 items-center border-b px-6">
          <h1 className="text-xl font-semibold">Nova Rota</h1>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {/* Route Origin */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <h3 className="font-semibold">Origem da Rota</h3>
              </div>
              <Button variant="ghost" size="sm" className="text-xs">
                <Edit className="mr-1 h-3 w-3" />
                Editar
              </Button>
            </div>
            <p className="pl-8 text-sm text-muted-foreground">{routeOrigin}</p>
          </div>

          <Separator />

          {/* Route Start */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Início da Rota</h3>
            </div>
            <div className="pl-8">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{routeDate}</span>
                <span className="mx-2 text-muted-foreground">às</span>
                <span className="font-medium text-foreground">{routeTime}</span>
              </p>
            </div>
          </div>

          <Separator />

          {/* Add Service */}
          <div>
            <Button variant="ghost" className="w-full justify-start gap-3">
              <PlusCircle className="h-5 w-5" />
              Adicionar novo serviço
            </Button>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-auto border-t p-6">
          <Button variant="outline" className="w-full justify-center gap-3">
            <Upload className="h-5 w-5" />
            Importar Serviços
          </Button>
        </div>
      </div>

      {/* Right Content - Map */}
      <div className="w-full h-full">
         <RouteMap height={-1} />
      </div>
    </div>
  );
}
