
'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
  Loader2,
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
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RouteData {
  origin: PlaceValue;
  stops: PlaceValue[];
  routeDate: string;
  routeTime: string;
}

const computeRoute = async (
  origin: PlaceValue,
  stops: PlaceValue[]
): Promise<RouteInfo | null> => {
  if (stops.length === 0) return null;
  try {
    const res = await fetch('/api/compute-optimized-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, stops }),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (error) {
    console.error('Failed to compute route:', error);
    return null;
  }
};

export default function OrganizeRoutePage() {
  const router = useRouter();
  const [routeData, setRouteData] = React.useState<RouteData | null>(null);
  const [isOptimizing, setIsOptimizing] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);

  const [routeA, setRouteA] = React.useState<RouteInfo | null>(null);
  const [routeB, setRouteB] = React.useState<RouteInfo | null>(null);

  React.useEffect(() => {
    const storedData = sessionStorage.getItem('newRouteData');
    if (storedData) {
      const parsedData: RouteData = JSON.parse(storedData);
      setRouteData(parsedData);

      const allStops = parsedData.stops;
      const midPoint = Math.ceil(allStops.length / 2);
      const stopsA = allStops.slice(0, midPoint);
      const stopsB = allStops.slice(midPoint);

      const calculateRoutes = async () => {
        setIsLoading(true);
        const [computedRouteA, computedRouteB] = await Promise.all([
          computeRoute(parsedData.origin, stopsA),
          computeRoute(parsedData.origin, stopsB),
        ]);
        if (computedRouteA) {
          setRouteA({ ...computedRouteA, color: '#F44336' });
        }
        if (computedRouteB) {
          setRouteB({ ...computedRouteB, color: '#FF9800' });
        }
        setIsLoading(false);
      };

      calculateRoutes();
    } else {
      router.push('/routes/new');
    }
  }, [router]);

  if (!routeData) {
    return (
      <div className="flex h-screen items-center justify-center">
        Carregando dados da rota...
      </div>
    );
  }

  const { origin, stops, routeDate, routeTime } = routeData;
  const combinedRoutes = [routeA, routeB].filter((r): r is RouteInfo => !!r);

  return (
    <div className="flex h-[calc(100svh-4rem)] w-full flex-col overflow-hidden">
      <div className="flex-1 bg-muted">
        <RouteMap
          height={-1}
          routes={combinedRoutes}
          origin={origin}
        />
      </div>

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
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex h-full flex-col justify-between rounded-lg border bg-muted/30 p-4">
                    <div>
                      <h4 className="font-semibold">Otimização Automática</h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Deixe a IA encontrar a melhor sequência para cada rota.
                      </p>
                    </div>
                    <Button disabled={isOptimizing} className="mt-4 w-full">
                      <Wand2 className="mr-2 h-4 w-4" />
                      {isOptimizing
                        ? 'Otimizando...'
                        : 'Otimizar Ambas as Rotas'}
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    {isLoading ? (
                        <div className="col-span-2 flex items-center justify-center h-40">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <>
                        <div>
                        <h4 className="mb-2 font-semibold text-center text-[#F44336]">Rota A</h4>
                        <ScrollArea className="h-40 rounded-md border">
                            <div className="p-4">
                            <p className="text-sm">
                                <span className="font-bold">O.</span> {origin.address.split(',')[0]}
                            </p>
                            {routeA?.stops.map((stop, index) => (
                                <p key={index} className="mt-2 text-sm">
                                <span className="font-bold">{index + 1}.</span>{' '}
                                {stop.address.split(',')[0]}
                                </p>
                            ))}
                            </div>
                        </ScrollArea>
                    </div>
                     <div>
                        <h4 className="mb-2 font-semibold text-center text-[#FF9800]">Rota B</h4>
                        <ScrollArea className="h-40 rounded-md border">
                            <div className="p-4">
                            <p className="text-sm">
                                <span className="font-bold">O.</span> {origin.address.split(',')[0]}
                            </p>
                            {routeB?.stops.map((stop, index) => (
                                <p key={index} className="mt-2 text-sm">
                                <span className="font-bold">{index + 1}.</span>{' '}
                                {stop.address.split(',')[0]}
                                </p>
                            ))}
                            </div>
                        </ScrollArea>
                    </div>
                    </>
                    )}
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
                      <div className="flex items-center gap-2 text-muted-foreground"><Calendar className="h-4 w-4" /> Data: <span className="font-semibold text-foreground">{format(new Date(routeDate), 'dd/MM/yyyy', { locale: ptBR })}</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" /> Horário: <span className="font-semibold text-foreground">{routeTime}</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Milestone className="h-4 w-4" /> Distância Total: <span className="font-semibold text-foreground">-- km</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><Clock className="h-4 w-4" /> Tempo Estimado: <span className="font-semibold text-foreground">-- min</span></div>
                       <div className="flex items-center gap-2 text-muted-foreground"><List className="h-4 w-4" /> Total de Paradas: <span className="font-semibold text-foreground">{stops.length}</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground"><User className="h-4 w-4" /> Motorista: <span className="font-semibold text-foreground">--</span></div>
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
