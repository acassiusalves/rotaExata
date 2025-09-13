
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
  Eye,
  GripVertical,
} from 'lucide-react';
import { RouteMap } from '@/components/maps/RouteMap';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RouteTimeline } from '@/components/routes/route-timeline';


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

const formatDistance = (meters: number) => {
    if (meters === 0) return '0.00';
    return (meters / 1000).toFixed(2);
}

const formatDuration = (durationString: string) => {
    if (!durationString) return '0m';
    const seconds = parseInt(durationString.replace('s', ''), 10);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}


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

      const allStops = parsedData.stops.filter(s => s.placeId);
      const midPoint = Math.ceil(allStops.length / 2);
      const stopsA = allStops.slice(0, midPoint);
      const stopsB = allStops.slice(midPoint);

      const calculateRoutes = async () => {
        setIsLoading(true);
        const [computedRouteA, computedRouteB] = await Promise.all([
          stopsA.length > 0 ? computeRoute(parsedData.origin, stopsA) : Promise.resolve(null),
          stopsB.length > 0 ? computeRoute(parsedData.origin, stopsB) : Promise.resolve(null),
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
      // For development, you might want to redirect, but for now, let's log it.
      // router.push('/routes/new');
      console.log("No route data found in session storage.");
      setIsLoading(false);
    }
  }, [router]);

  if (isLoading && !routeData) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-4">Carregando dados da rota...</span>
      </div>
    );
  }

  if (!routeData) {
     return (
      <div className="flex h-screen items-center justify-center">
        <p>Nenhum dado de rota encontrado. Por favor, <a href="/routes/new" className="underline">crie uma nova rota</a>.</p>
      </div>
    );
  }

  const { origin, stops, routeDate, routeTime } = routeData;
  const combinedRoutes = [routeA, routeB].filter((r): r is RouteInfo => !!r);
  
  const routesForTable = [
      { name: "Rota A", data: routeA, color: "#F44336" },
      { name: "Rota B", data: routeB, color: "#FF9800" }
  ];

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
               <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="col-span-3 lg:col-span-2">
                   {isLoading ? (
                        <div className="flex items-center justify-center h-48">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                    ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className='w-[120px]'>Rota</TableHead>
                                <TableHead className="w-[80px]">Paradas</TableHead>
                                <TableHead>Linha do Tempo</TableHead>
                                <TableHead className="w-[120px]">Distância (km)</TableHead>
                                <TableHead className="w-[120px]">Tempo Estimado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                           {routesForTable.map((routeItem, index) => routeItem.data && (
                                <TableRow key={index}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <Button variant="ghost" size="icon" className='h-8 w-8 shrink-0'><Eye className='h-4 w-4' /></Button>
                                            <GripVertical className='h-5 w-5 text-muted-foreground cursor-grab shrink-0' />
                                            <span className="font-semibold" style={{ color: routeItem.color }}>{routeItem.name}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">{routeItem.data.stops.length}</TableCell>
                                    <TableCell>
                                      <RouteTimeline 
                                        numberOfStops={routeItem.data.stops.length}
                                        color={routeItem.color}
                                      />
                                    </TableCell>
                                    <TableCell>{formatDistance(routeItem.data.distanceMeters)}</TableCell>
                                    <TableCell>{formatDuration(routeItem.data.duration)}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    )}
                </div>
                 <div className="col-span-3 lg:col-span-1 flex items-center">
                    <div className="flex h-full flex-col justify-between rounded-lg border bg-muted/30 p-4 w-full">
                        <div>
                        <h4 className="font-semibold">Otimização Automática</h4>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Deixe a IA encontrar a melhor sequência para cada rota, priorizando a menor distância.
                        </p>
                        </div>
                        <Button disabled={isOptimizing} className="mt-4 w-full">
                          {isOptimizing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Wand2 className="mr-2 h-4 w-4" />
                          )}
                          {isOptimizing
                              ? 'Otimizando...'
                              : 'Otimizar Ambas as Rotas'}
                        </Button>
                    </div>
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
