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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { AutocompleteInput } from '@/components/maps/AutocompleteInput';
import type { PlaceValue } from '@/lib/types';


export default function NewRoutePage() {
  const [origin, setOrigin] = React.useState<PlaceValue | null>({
      address: 'Av. Anhanguera, 456, Centro, Goiânia-GO',
      placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
      lat: -16.6786,
      lng: -49.2552,
  });
  
  const routeDate = '12/12/2025';
  const routeTime = '18:10';

  const [isOriginDialogOpen, setIsOriginDialogOpen] = React.useState(false);
  const [tempOrigin, setTempOrigin] = React.useState<PlaceValue | null>(origin);

  const handleSaveOrigin = () => {
    setOrigin(tempOrigin);
    setIsOriginDialogOpen(false);
  };


  return (
    <>
      <div className="grid h-full w-full grid-cols-[350px_1fr]">
        {/* Left Sidebar */}
        <div className="flex flex-col border-r bg-background">
          <div className="flex h-16 shrink-0 items-center border-b px-6">
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
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setIsOriginDialogOpen(true)}>
                  <Edit className="mr-1 h-3 w-3" />
                  Editar
                </Button>
              </div>
              <p className="pl-8 text-sm text-muted-foreground">{origin?.address ?? 'Não definida'}</p>
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
          <div className="shrink-0 border-t p-6">
            <Button variant="outline" className="w-full justify-center gap-3">
              <Upload className="h-5 w-5" />
              Importar Serviços
            </Button>
          </div>
        </div>

        {/* Right Content - Map */}
        <div className="w-full h-full">
          <RouteMap height={-1} origin={origin} />
        </div>
      </div>

      {/* Origin Edit Dialog */}
      <Dialog open={isOriginDialogOpen} onOpenChange={setIsOriginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Definir Endereço de Origem</DialogTitle>
            <DialogDescription>
              Pesquise e selecione o endereço de onde a rota irá começar.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <AutocompleteInput
              label="Endereço de Origem"
              placeholder="Digite o endereço de início"
              value={tempOrigin}
              onChange={setTempOrigin}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={handleSaveOrigin} disabled={!tempOrigin}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
