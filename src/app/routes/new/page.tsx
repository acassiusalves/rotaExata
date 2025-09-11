"use client";

import * as React from 'react';
import {
  MapPin,
  Calendar,
  PlusCircle,
  Upload,
  Edit,
  Home,
  Plus,
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
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';


const savedOrigins = [
  {
    id: 'origin-1',
    name: 'Sol de Maria',
    value: {
      address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia-GO',
      placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
      lat: -16.6786,
      lng: -49.2552,
    }
  },
  {
    id: 'origin-2',
    name: 'InvesteAqui',
    value: {
      address: 'Rua da Alfandega, 200, Bras, Sao paulo, SP, Brasil',
      placeId: 'ChIJR9QCMf5ZzpQR4iS2PS52rCk',
      lat: -23.5410,
      lng: -46.6262,
    }
  }
]


export default function NewRoutePage() {
  const [origin, setOrigin] = React.useState<PlaceValue | null>(savedOrigins[0].value);
  
  const routeDate = '12/12/2025';
  const routeTime = '18:10';

  const [isOriginDialogOpen, setIsOriginDialogOpen] = React.useState(false);
  const [isNewOriginDialogOpen, setIsNewOriginDialogOpen] = React.useState(false);

  const handleSelectOrigin = (placeValue: PlaceValue) => {
    setOrigin(placeValue);
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

      {/* Origin Selection Dialog */}
      <Dialog open={isOriginDialogOpen} onOpenChange={setIsOriginDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Definir Endereço de Origem</DialogTitle>
            <DialogDescription>
              Selecione um endereço salvo ou adicione um novo ponto de partida.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 pt-4">
             <button 
                className="flex w-full items-center gap-4 rounded-md p-3 text-left transition-colors hover:bg-muted"
                onClick={() => {
                  setIsOriginDialogOpen(false);
                  setIsNewOriginDialogOpen(true);
                }}
              >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium">Adicionar nova origem</p>
                <p className="text-sm text-muted-foreground">
                  Cadastrar um novo endereço para utilizar em futuras rotas.
                </p>
              </div>
            </button>
            <Separator />
            <div className="max-h-[300px] overflow-y-auto">
              {savedOrigins.map(saved => {
                const isSelected = origin?.placeId === saved.value.placeId;
                return (
                  <button
                    key={saved.id}
                    className="flex w-full items-center gap-4 rounded-md p-3 text-left transition-colors hover:bg-muted"
                    onClick={() => handleSelectOrigin(saved.value)}
                  >
                     <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border", isSelected ? "bg-primary text-primary-foreground" : "bg-background")}>
                       <Home className="h-5 w-5" />
                     </div>
                    <div>
                      <p className={cn("font-medium", isSelected && "text-primary")}>{saved.value.address}</p>
                      <p className="text-sm text-muted-foreground">{saved.name}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

       {/* New Origin Dialog */}
      <Dialog open={isNewOriginDialogOpen} onOpenChange={setIsNewOriginDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Nova Origem</DialogTitle>
            <DialogDescription>
              Preencha os detalhes do novo endereço de origem.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
             <div className="grid gap-2">
                <Label htmlFor="origin-name">Nome do Local</Label>
                <Input id="origin-name" placeholder="Ex: Matriz, Depósito Central" />
            </div>
            <div className="grid gap-2">
                 <AutocompleteInput
                    label="Endereço Completo"
                    placeholder="Pesquise o endereço..."
                    onChange={() => {}}
                />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancelar</Button>
            </DialogClose>
            <Button onClick={() => setIsNewOriginDialogOpen(false)}>Salvar Origem</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
