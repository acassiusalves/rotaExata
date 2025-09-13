
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
  Milestone,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { RouteMap, RouteMapHandle } from '@/components/maps/RouteMap';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { drivers } from '@/lib/data';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
} from '@dnd-kit/sortable';
import { RouteTimeline } from '@/components/routes/route-timeline';
import { optimizeDeliveryRoutes } from '@/ai/flows/optimize-delivery-routes';
import { useToast } from '@/hooks/use-toast';


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
    if (!res.ok) {
       const errorText = await res.text();
       console.error('API Error:', errorText);
       throw new Error(errorText);
    }
    const data = await res.json();
    return { ...data, stops, visible: true }; // Ensure original stops are returned
  } catch (error) {
    console.error('Failed to compute route:', error);
    return null;
  }
};

const formatDistance = (meters: number) => {
  if (meters === 0) return '0.00';
  return (meters / 1000).toFixed(2);
};

const formatDuration = (durationString: string) => {
  if (!durationString || durationString === '0s') return '0m';
  const seconds = parseInt(durationString.replace('s', ''), 10);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const calculateFreightCost = (distanceMeters: number): string => {
  const BASE_PRICE = 5.00; // R$ 5,00
  const PRICE_PER_KM = 1.20; // R$ 1,20
  
  const distanceKm = distanceMeters / 1000;
  const cost = BASE_PRICE + (distanceKm * PRICE_PER_KM);

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cost);
};

// Simple Euclidean distance for clustering (good enough for this purpose)
const getDistance = (p1: {lat: number, lng: number}, p2: {lat: number, lng: number}) => {
    return Math.sqrt(Math.pow(p1.lat - p2.lat, 2) + Math.pow(p1.lng - p2.lng, 2));
};

const kMeansCluster = (stops: PlaceValue[], k: number, maxIterations = 20) => {
  if (stops.length <= k) {
    return stops.map(stop => [stop]);
  }

  // 1. Initialize centroids by picking k stops that are far from each other
  let centroids: {lat: number, lng: number}[] = [];
  centroids.push(stops[0]);
  while (centroids.length < k) {
    let maxDist = 0;
    let farthestStop: PlaceValue | null = null;
    stops.forEach(stop => {
      let minDistToCentroid = Infinity;
      centroids.forEach(centroid => {
        const dist = getDistance(stop, centroid);
        if (dist < minDistToCentroid) {
          minDistToCentroid = dist;
        }
      });
      if (minDistToCentroid > maxDist) {
        maxDist = minDistToCentroid;
        farthestStop = stop;
      }
    });
    if (farthestStop) {
      centroids.push(farthestStop);
    }
  }


  let clusters: PlaceValue[][] = [];
  let iterations = 0;

  while (iterations < maxIterations) {
    // 2. Assign stops to the closest centroid
    clusters = Array.from({ length: k }, () => []);
    stops.forEach(stop => {
      let minDistance = Infinity;
      let closestCentroidIndex = -1;
      centroids.forEach((centroid, index) => {
        const distance = getDistance(stop, centroid);
        if (distance < minDistance) {
          minDistance = distance;
          closestCentroidIndex = index;
        }
      });
      if (closestCentroidIndex !== -1) {
        clusters[closestCentroidIndex].push(stop);
      }
    });

    // 3. Recalculate centroids
    const newCentroids = clusters.map(cluster => {
      if (cluster.length === 0) {
        // Find a random stop to be the new centroid if a cluster is empty
        return stops[Math.floor(Math.random() * stops.length)];
      }
      const sum = cluster.reduce((acc, stop) => ({ lat: acc.lat + stop.lat, lng: acc.lng + stop.lng }), { lat: 0, lng: 0 });
      return { lat: sum.lat / cluster.length, lng: sum.lng / cluster.length };
    });

    // 4. Check for convergence
    const hasConverged = newCentroids.every((centroid, index) => {
      return centroid.lat === centroids[index].lat && centroid.lng === centroids[index].lng;
    });

    if (hasConverged) {
      break;
    }

    centroids = newCentroids;
    iterations++;
  }

  return clusters.filter(c => c.length > 0);
};


export default function OrganizeRoutePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [routeData, setRouteData] = React.useState<RouteData | null>(null);
  const [isOptimizing, setIsOptimizing] = React.useState({ A: false, B: false });
  const [isLoading, setIsLoading] = React.useState(true);

  const [routeA, setRouteA] = React.useState<RouteInfo | null>(null);
  const [routeB, setRouteB] = React.useState<RouteInfo | null>(null);

  const mapApiRef = React.useRef<RouteMapHandle>(null);
  const DRAG_DELAY = 200;
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: DRAG_DELAY, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  );

  React.useEffect(() => {
    const storedData = sessionStorage.getItem('newRouteData');
    if (storedData) {
      const parsedData: RouteData = JSON.parse(storedData);
      setRouteData(parsedData);

      const allStops = parsedData.stops.filter((s) => s.id && s.lat && s.lng);
      
      // Use k-means to split stops into two clusters
      const clusters = kMeansCluster(allStops, 2);
      const stopsA = clusters[0] || [];
      const stopsB = clusters[1] || [];


      const calculateRoutes = async () => {
        setIsLoading(true);
        const [computedRouteA, computedRouteB] = await Promise.all([
          stopsA.length > 0
            ? computeRoute(parsedData.origin, stopsA)
            : Promise.resolve(null),
          stopsB.length > 0
            ? computeRoute(parsedData.origin, stopsB)
            : Promise.resolve(null),
        ]);
        if (computedRouteA) {
          setRouteA({ ...computedRouteA, color: '#F44336', visible: true });
        }
        if (computedRouteB) {
          setRouteB({ ...computedRouteB, color: '#FF9800', visible: true });
        }
        setIsLoading(false);
      };

      calculateRoutes();
    } else {
      console.log('No route data found in session storage.');
      setIsLoading(false);
      // Optional: redirect back if no data
      // router.push('/routes/new');
    }
  }, [router]);


  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }
    
    const activeRouteKey = active.data.current?.routeKey as 'A' | 'B';
    const overRouteKey = over.data.current?.routeKey  as 'A' | 'B';

    if (!activeRouteKey || activeRouteKey !== overRouteKey) {
        // Handle moving between routes if needed in the future
        console.warn("Moving stops between different routes is not supported yet.");
        return;
    }

    const currentRoute = activeRouteKey === 'A' ? routeA : routeB;
    const setter = activeRouteKey === 'A' ? setRouteA : setRouteB;
    if (!currentRoute || !routeData) return;

    const oldIndex = active.data.current?.index as number;
    const newIndex = over.data.current?.index as number;
    
    const newStops = arrayMove(currentRoute.stops, oldIndex, newIndex);

    // Update state optimistically
    setter((prev) => (prev ? { ...prev, stops: newStops, encodedPolyline: '' } : null));

    // Recalculate route
    const newRouteInfo = await computeRoute(routeData.origin, newStops);
    if (newRouteInfo) {
      setter((prev) => (prev ? { ...prev, ...newRouteInfo, stops: newStops } : null));
    }
  };

  const handleOptimizeSingleRoute = async (routeKey: 'A' | 'B') => {
    const routeToOptimize = routeKey === 'A' ? routeA : routeB;
    const setter = routeKey === 'A' ? setRouteA : setRouteB;

    if (!routeToOptimize || !routeData) {
        toast({ variant: 'destructive', title: "Erro", description: "Dados da rota não encontrados." });
        return;
    }

    setIsOptimizing(prev => ({...prev, [routeKey]: true}));
    
    try {
        const result = await optimizeDeliveryRoutes({
            origin: routeData.origin,
            deliveryLocations: routeToOptimize.stops.map(s => ({ id: s.id, lat: s.lat, lng: s.lng })),
        });
        
        const optimizedStopsMap = new Map(result.optimizedStops.map(s => [s.id, s]));
        const reorderedStops = [...routeToOptimize.stops].sort((a, b) => {
            const indexA = result.optimizedStops.findIndex(s => s.id === a.id);
            const indexB = result.optimizedStops.findIndex(s => s.id === b.id);
            return indexA - indexB;
        });

        setter((prev) => (prev ? { ...prev, stops: reorderedStops, encodedPolyline: '' } : null));
        
        const newRouteInfo = await computeRoute(routeData.origin, reorderedStops);
        if (newRouteInfo) {
            setter((prev) => (prev ? { ...prev, ...newRouteInfo, stops: reorderedStops } : null));
        }

        toast({ title: "Rota Otimizada!", description: `A Rota ${routeKey === 'A' ? '1' : '2'} foi otimizada com sucesso.` });

    } catch (error) {
        console.error("Error optimizing route:", error);
        toast({ variant: 'destructive', title: "Falha na Otimização", description: "Não foi possível otimizar a rota." });
    } finally {
        setIsOptimizing(prev => ({...prev, [routeKey]: false}));
    }
  };

  const toggleRouteVisibility = (routeKey: 'A' | 'B') => {
    const setter = routeKey === 'A' ? setRouteA : setRouteB;
    setter(prev => prev ? { ...prev, visible: !prev.visible } : null);
  };


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
        <p>
          Nenhum dado de rota encontrado. Por favor,{' '}
          <a href="/routes/new" className="underline">
            crie uma nova rota
          </a>
          .
        </p>
      </div>
    );
  }

  const { origin, routeDate, routeTime } = routeData;
  const combinedRoutes = [routeA, routeB].filter((r): r is RouteInfo => !!r && !!r.visible);

  const totalStops = (routeA?.stops.length || 0) + (routeB?.stops.length || 0);
  const totalDistance =
    (routeA?.distanceMeters || 0) + (routeB?.distanceMeters || 0);

  const durationA = routeA?.duration
    ? parseInt(routeA.duration.replace('s', ''))
    : 0;
  const durationB = routeB?.duration
    ? parseInt(routeB.duration.replace('s', ''))
    : 0;
  const totalDurationSeconds = durationA + durationB;

  const routesForTable = [
      { key: 'A', name: 'Rota 1', data: routeA },
      { key: 'B', name: 'Rota 2', data: routeB },
  ].filter((r): r is { key: 'A' | 'B'; name: string; data: RouteInfo } => !!r.data);

  return (
    <div className="flex h-[calc(100svh-4rem)] w-full flex-col overflow-hidden">
      <div className="flex-1 bg-muted">
        <RouteMap ref={mapApiRef} height={-1} routes={combinedRoutes} origin={origin} />
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
              <div className="col-span-3">
                   {isLoading ? (
                    <div className="flex h-48 items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className='w-12'></TableHead>
                                <TableHead>Rota</TableHead>
                                <TableHead>Paradas</TableHead>
                                <TableHead>Distância</TableHead>
                                <TableHead>Tempo</TableHead>
                                <TableHead>Frete R$</TableHead>
                                <TableHead className='w-[35%]'>Linha do Tempo</TableHead>
                                <TableHead className='w-32 text-right'>Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                        {routesForTable.map(routeItem => (
                             <TableRow key={routeItem.key}>
                                <TableCell className="align-middle">
                                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleRouteVisibility(routeItem.key)}>
                                        {routeItem.data.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                    </Button>
                                </TableCell>
                                <TableCell className='font-medium'>{routeItem.name}</TableCell>
                                <TableCell>{routeItem.data.stops.length}</TableCell>
                                <TableCell>{formatDistance(routeItem.data.distanceMeters)} km</TableCell>
                                <TableCell>{formatDuration(routeItem.data.duration)}</TableCell>
                                <TableCell>{calculateFreightCost(routeItem.data.distanceMeters)}</TableCell>
                                <TableCell>
                                    <RouteTimeline
                                      routeKey={routeItem.key}
                                      stops={routeItem.data.stops}
                                      color={routeItem.data.color}
                                      dragDelay={DRAG_DELAY}
                                      onStopClick={(stop) => {
                                        const id = String(stop.id ?? stop.placeId ?? "");
                                        if (id) mapApiRef.current?.openStopInfo(id);
                                      }}
                                    />
                                </TableCell>
                                <TableCell className="text-right">
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        onClick={() => handleOptimizeSingleRoute(routeItem.key)}
                                        disabled={isOptimizing[routeItem.key]}
                                    >
                                        {isOptimizing[routeItem.key] ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <Wand2 className="mr-2 h-4 w-4" />
                                        )}
                                        Otimizar
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        </TableBody>
                    </Table>
                    </DndContext>
                  )}
                </div>
            </TabsContent>

            <TabsContent value="assign" className="m-0">
              <div className="grid grid-cols-3 gap-6">
                <div className="col-span-2">
                  <h4 className="mb-2 font-semibold">Selecionar Motorista</h4>
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
                      Atribua a rota a um motorista para iniciar o processo de
                      entrega.
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
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" /> Data:{' '}
                      <span className="font-semibold text-foreground">
                        {routeDate ? format(new Date(routeDate), 'dd/MM/yyyy', {
                          locale: ptBR,
                        }) : '--'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" /> Horário:{' '}
                      <span className="font-semibold text-foreground">
                        {routeTime}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Milestone className="h-4 w-4" /> Distância Total:{' '}
                      <span className="font-semibold text-foreground">
                        {formatDistance(totalDistance)} km
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" /> Tempo Estimado:{' '}
                      <span className="font-semibold text-foreground">
                        {formatDuration(`${totalDurationSeconds}s`)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <List className="h-4 w-4" /> Total de Paradas:{' '}
                      <span className="font-semibold text-foreground">
                        {totalStops}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" /> Motorista:{' '}
                      <span className="font-semibold text-foreground">--</span>
                    </div>

                  </div>
                </div>
                <div className="col-span-1 flex flex-col justify-between rounded-lg border bg-muted/30 p-4">
                  <div>
                    <h4 className="font-semibold">Finalizar</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Após revisar, salve a rota para enviá-la ao motorista e
                      iniciar o monitoramento.
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
