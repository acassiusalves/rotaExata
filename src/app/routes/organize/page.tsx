
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  List,
  Wand2,
  User,
  Check,
  Truck,
  Calendar,
  Clock,
  Map,
  Milestone,
} from 'lucide-react';
import { RouteMap } from '@/components/maps/RouteMap';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { drivers } from '@/lib/data';

// Mock data, in a real scenario this would come from the previous page
const mockOrigin = {
  address: 'Avenida Circular, 1028, Setor Pedro Ludovico, Goiânia-GO',
  placeId: 'ChIJFT_4_9XFUpQRy_14vCVa2po',
  lat: -16.6786,
  lng: -49.2552,
};
const mockStops = [
  {
    address: 'R. 2, 110 - St. Oeste, Goiânia - GO, 74110-130, Brazil',
    lat: -16.6799,
    lng: -49.2673,
    placeId: 'stop1',
  },
  {
    address:
      'Av. T-10, 1300 - St. Bueno, Goiânia - GO, 74223-060, Brazil',
    lat: -16.702,
    lng: -49.287,
    placeId: 'stop2',
  },
  {
    address:
      'Av. T-63, 1296 - St. Nova Suica, Goiânia - GO, 74280-235, Brazil',
    lat: -16.711,
    lng: -49.282,
    placeId: 'stop3',
  },
];

export default function OrganizeRoutePage() {
  const [isOptimizing, setIsOptimizing] = React.useState(false);

  return (
    <div className="flex h-[calc(100svh-4rem)] w-full flex-col overflow-hidden">
      {/* Mapa na parte superior */}
      <div className="flex-1 bg-muted">
        <RouteMap
          height={-1} // -1 for 100% height
          origin={mockOrigin}
          stops={mockStops}
        />
      </div>

      {/* Painel de controle na parte inferior */}
      <div className="shrink-0 border-t bg-background">
        <Tabs defaultValue="organize" className="w-full">
          <CardHeader className="p-4 pb-0">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Organizar e Atribuir Rota</CardTitle>
                <CardDescription>
                  Otimize a sequência, atribua um motorista e salve a rota.
                </CardDescription>
              </div>
              <TabsList>
                <TabsTrigger value="organize">
                  <Wand2 className="mr-2 h-4 w-4" />
                  Organizar
                </TabsTrigger>
                <TabsTrigger value="assign">
                  <User className="mr-2 h-4 w-4" />
                  Atribuir
                </TabsTrigger>
                <TabsTrigger value="review">
                  <Check className="mr-2 h-4 w-4" />
                  Revisar
                </TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            <TabsContent value="organize" className="m-0">
              <div className="grid grid-cols-3 gap-6">
                {/* Coluna de Lista de Paradas */}
                <div className="col-span-1">
                  <h4 className="mb-2 font-semibold">Ordem das Paradas</h4>
                  <ScrollArea className="h-40 rounded-md border">
                    <div className="p-4">
                      <p className="text-sm">
                        <span className="font-bold">O.</span> Origem
                      </p>
                      {mockStops.map((stop, index) => (
                        <p key={index} className="mt-2 text-sm">
                          <span className="font-bold">{index + 1}.</span>{' '}
                          {stop.address.split(',')[0]}
                        </p>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
                {/* Coluna de Configurações */}
                <div className="col-span-1">
                  <h4 className="mb-2 font-semibold">
                    Preferências de Otimização
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <Label htmlFor="avoid-tolls">Evitar Pedágios</Label>
                      <Switch id="avoid-tolls" />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <Label htmlFor="avoid-highways">Evitar Rodovias</Label>
                      <Switch id="avoid-highways" defaultChecked />
                    </div>
                  </div>
                </div>
                {/* Coluna de Ações */}
                <div className="col-span-1 flex flex-col justify-between rounded-lg border bg-muted/30 p-4">
                  <div>
                    <h4 className="font-semibold">Otimização Automática</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Deixe a IA encontrar a melhor sequência para economizar
                      tempo e distância.
                    </p>
                  </div>
                  <Button disabled={isOptimizing} className="w-full">
                    <Wand2 className="mr-2 h-4 w-4" />
                    {isOptimizing ? 'Otimizando...' : 'Organizar com IA'}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="assign" className="m-0">
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2">
                  <h4 className="mb-2 font-semibold">
                    Selecionar Motorista
                  </h4>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha um motorista disponível..." />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers
                        .filter((d) => d.status === 'available')
                        .map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>
                            <div className="flex items-center gap-3">
                              <span
                                className={`h-2 w-2 rounded-full bg-green-500`}
                              />
                              <span>{driver.name}</span>
                              <span className="ml-auto text-xs text-muted-foreground">
                                {driver.vehicle.type}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Apenas motoristas com status "Disponível" são mostrados.
                  </p>
                </div>
                <div className="col-span-1 flex flex-col justify-between rounded-lg border bg-muted/30 p-4">
                   <div>
                    <h4 className="font-semibold">Atribuição</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                     Atribua a rota a um motorista para iniciar o processo de entrega.
                    </p>
                  </div>
                  <Button variant="secondary" className="w-full">
                     <User className="mr-2 h-4 w-4" />
                    Atribuir Motorista
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="review" className="m-0">
              <div className="grid grid-cols-3 gap-6">
                 <div className="col-span-2 space-y-4">
                   <h4 className="font-semibold">Resumo da Rota</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" /> Data: <span className="font-semibold text-foreground">25/07/2024</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" /> Horário: <span className="font-semibold text-foreground">18:10</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Milestone className="h-4 w-4" /> Distância Total: <span className="font-semibold text-foreground">22.5 km</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" /> Tempo Estimado: <span className="font-semibold text-foreground">48 min</span></div>
                       <div className="flex items-center gap-2 text-muted-foreground"><List className="h-4 w-4" /> Total de Paradas: <span className="font-semibold text-foreground">3</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4" /> Motorista: <span className="font-semibold text-foreground">Carlos Silva</span></div>
                    </div>
                 </div>
                 <div className="col-span-1 flex flex-col justify-between rounded-lg border bg-muted/30 p-4">
                   <div>
                    <h4 className="font-semibold">Finalizar</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Após revisar, salve a rota para enviá-la ao motorista e iniciar o monitoramento.
                    </p>
                  </div>
                  <Button className="w-full">
                    <Truck className="mr-2 h-4 w-4" />
                    Salvar e Despachar Rota
                  </Button>
                </div>
              </div>
            </TabsContent>
          </CardContent>
        </Tabs>
      </div>
    </div>
  );
}

