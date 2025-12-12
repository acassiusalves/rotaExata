'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Package,
  Clock,
  CheckCircle,
  XCircle,
  DollarSign,
  MapPin,
  Loader2,
  Home,
  Sun,
  Sunset,
  Moon,
  CreditCard,
  Banknote,
  Smartphone,
  Landmark,
  FileText,
  FileEdit,
  User,
  Phone,
  Camera,
  ClipboardList,
} from 'lucide-react';
import { RouteMap } from '@/components/maps/RouteMap';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { LunnaBadge } from '@/components/routes/lunna-badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { collection, onSnapshot, query, where, Timestamp, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { RouteInfo, DriverLocationWithInfo, PlaceValue } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'draft' | 'dispatched' | 'in_progress' | 'completed' | 'completed_auto';
  plannedDate: Timestamp;
  driverId?: string;
  driverInfo?: {
    name: string;
    vehicle: {
      type: string;
      plate: string;
    };
  } | null;
  code?: string;
  source?: string;
  origin?: PlaceValue; // Origem da rota
};

// Função para determinar o período da rota
const getRoutePeriod = (date: Date): { label: string; icon: React.ElementType; color: string } => {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) {
    return { label: 'Matutino', icon: Sun, color: 'bg-amber-500' };
  } else if (hour >= 12 && hour < 18) {
    return { label: 'Vespertino', icon: Sunset, color: 'bg-orange-500' };
  } else {
    return { label: 'Noturno', icon: Moon, color: 'bg-indigo-500' };
  }
};

// Função para traduzir status da rota
const getStatusLabel = (status: RouteDocument['status']): string => {
  const statusMap: Record<string, string> = {
    'draft': 'Rascunho',
    'dispatched': 'Despachada',
    'in_progress': 'Em Andamento',
    'completed': 'Concluída',
    'completed_auto': 'Concluída A'
  };
  return statusMap[status] || status;
};

// Componente de Badge de Status
const StatusBadge: React.FC<{ status: RouteDocument['status'] }> = ({ status }) => {
  if (status === 'completed_auto') {
    return (
      <Badge variant="secondary" className="flex items-center gap-1.5">
        <img
          src="/icons/automatic-svgrepo-com.svg"
          alt="Automático"
          className="w-4 h-4"
          title="Concluída Automaticamente"
        />
        <span>Concluída</span>
      </Badge>
    );
  }

  const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    'draft': 'outline',
    'dispatched': 'secondary',
    'in_progress': 'default',
  };

  return <Badge variant={variantMap[status] || 'secondary'}>{getStatusLabel(status)}</Badge>;
};

// Componente Rotograma
const Rotograma: React.FC<{
  stops: PlaceValue[],
  color?: string,
  onStopClick?: (stop: PlaceValue, index: number) => void
}> = ({ stops, color, onStopClick }) => (
  <div className="flex items-center gap-1">
    <div
      className="flex h-6 w-6 items-center justify-center rounded-md"
      style={{ backgroundColor: color || 'hsl(var(--accent))' }}
    >
      <Home className="h-3 w-3 text-white" />
    </div>
    {stops.slice(0, 8).map((stop, index) => {
      const isCompleted = stop.deliveryStatus === 'completed';
      const isFailed = stop.deliveryStatus === 'failed';

      return (
        <div
          key={stop.id || index}
          className={`flex h-6 w-6 items-center justify-center rounded-md border text-xs font-semibold transition-colors cursor-pointer ${
            isCompleted
              ? 'bg-green-500 text-white border-green-600 hover:bg-green-600'
              : isFailed
              ? 'bg-red-500 text-white border-red-600 hover:bg-red-600'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
          title={stop.address}
          onClick={() => {
            if (onStopClick) {
              onStopClick(stop, index);
            }
          }}
        >
          {index + 1}
        </div>
      );
    })}
    {stops.length > 8 && (
      <div className="text-xs text-muted-foreground">+{stops.length - 8}</div>
    )}
  </div>
);

// Ícones para formas de pagamento
const PaymentMethodIcon: React.FC<{ method: string }> = ({ method }) => {
  const normalizedMethod = method.toLowerCase();
  if (normalizedMethod.includes('crédito') || normalizedMethod.includes('credito')) {
    return <CreditCard className="h-4 w-4" />;
  }
  if (normalizedMethod.includes('débito') || normalizedMethod.includes('debito')) {
    return <CreditCard className="h-4 w-4" />;
  }
  if (normalizedMethod.includes('pix')) {
    return <Smartphone className="h-4 w-4" />;
  }
  if (normalizedMethod.includes('dinheiro')) {
    return <Banknote className="h-4 w-4" />;
  }
  if (normalizedMethod.includes('transferência') || normalizedMethod.includes('transferencia') || normalizedMethod.includes('ted') || normalizedMethod.includes('doc')) {
    return <Landmark className="h-4 w-4" />;
  }
  return <DollarSign className="h-4 w-4" />;
};

export default function DashboardPage() {
  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [driverLocations, setDriverLocations] = React.useState<DriverLocationWithInfo[]>([]);
  const [selectedStop, setSelectedStop] = React.useState<{ stop: PlaceValue; index: number } | null>(null);
  const [isStopInfoOpen, setIsStopInfoOpen] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    // Pegar início e fim do dia atual
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Firestore listener para rotas ativas (sem filtro de data para evitar índice composto)
    // A filtragem por data será feita no cliente
    const routesQuery = query(
      collection(db, 'routes'),
      where('status', 'in', ['draft', 'dispatched', 'in_progress'])
    );

    const unsubscribeRoutes = onSnapshot(routesQuery, (snapshot) => {
      const routesData: RouteDocument[] = [];
      const locationsMap = new Map<string, DriverLocationWithInfo>();
      const now = new Date();

      snapshot.forEach((docSnap) => {
        const route = { id: docSnap.id, ...docSnap.data() } as RouteDocument;

        // Filtrar apenas rotas do dia atual (no cliente)
        const routeDate = route.plannedDate?.toDate();
        if (!routeDate || routeDate < today || routeDate >= tomorrow) {
          return; // Pular rotas que não são do dia atual
        }

        routesData.push(route);

        // Coletar localizações dos motoristas
        if (route.currentLocation && route.status === 'in_progress' && route.driverInfo && route.driverId) {
          const timestamp = route.currentLocation.timestamp instanceof Date
            ? route.currentLocation.timestamp
            : route.currentLocation.timestamp.toDate();

          // Filtrar localizações antigas (mais de 4 horas para rotas em andamento)
          const hoursAgo = (now.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
          if (hoursAgo > 4) {
            return;
          }

          const location: DriverLocationWithInfo = {
            ...route.currentLocation,
            driverId: route.driverId,
            driverName: route.driverInfo.name,
          };

          // Manter apenas a localização mais recente de cada motorista
          const existing = locationsMap.get(route.driverId);
          if (!existing) {
            locationsMap.set(route.driverId, location);
          } else {
            const existingTime = existing.timestamp instanceof Date
              ? existing.timestamp
              : existing.timestamp.toDate();
            if (timestamp > existingTime) {
              locationsMap.set(route.driverId, location);
            }
          }
        }
      });

      // Ordenar por data planejada
      routesData.sort((a, b) => {
        const dateA = a.plannedDate?.toMillis() || 0;
        const dateB = b.plannedDate?.toMillis() || 0;
        return dateA - dateB;
      });

      // Log detalhado para debug
      console.log('📊 Dashboard: Rotas carregadas do Firestore:', {
        total: routesData.length,
        byStatus: {
          draft: routesData.filter(r => r.status === 'draft').length,
          dispatched: routesData.filter(r => r.status === 'dispatched').length,
          in_progress: routesData.filter(r => r.status === 'in_progress').length,
        },
        routesSummary: routesData.map(r => ({
          id: r.id,
          name: r.name,
          status: r.status,
          plannedDate: r.plannedDate?.toDate().toISOString(),
        })),
      });

      setRoutes(routesData);
      setDriverLocations(Array.from(locationsMap.values()));
      setIsLoading(false);
    }, (error) => {
      console.error('Error fetching routes:', error);
      setIsLoading(false);
    });

    return () => {
      unsubscribeRoutes();
    };
  }, []);

  // Cálculos de métricas
  const metrics = React.useMemo(() => {
    let totalDeliveries = 0;
    let completedDeliveries = 0;
    let failedDeliveries = 0;
    let totalRevenue = 0;
    let draftDeliveries = 0; // Entregas em rascunho (não atribuídas)
    const deliveriesByPeriod: Record<string, number> = {
      'Matutino': 0,
      'Vespertino': 0,
      'Noturno': 0,
    };
    const revenueByPaymentMethod: Record<string, number> = {};

    routes.forEach(route => {
      if (!route.stops) return;

      // Rotas em rascunho não são consideradas em nenhum período
      const isDraft = route.status === 'draft';
      const period = isDraft ? null : getRoutePeriod(route.plannedDate.toDate()).label;

      route.stops.forEach(stop => {
        totalDeliveries++;

        // Só adiciona ao período se não for rascunho
        if (period) {
          deliveriesByPeriod[period]++;
        } else {
          draftDeliveries++;
        }

        if (stop.deliveryStatus === 'completed') {
          completedDeliveries++;

          // Calcular faturamento
          if (stop.payments && stop.payments.length > 0) {
            stop.payments.forEach(payment => {
              totalRevenue += payment.value || 0;
              const method = payment.method || 'Outros';
              revenueByPaymentMethod[method] = (revenueByPaymentMethod[method] || 0) + (payment.value || 0);
            });
          }
        } else if (stop.deliveryStatus === 'failed') {
          failedDeliveries++;
        }
      });
    });

    return {
      totalDeliveries,
      completedDeliveries,
      failedDeliveries,
      pendingDeliveries: totalDeliveries - completedDeliveries - failedDeliveries,
      draftDeliveries,
      totalRevenue,
      deliveriesByPeriod,
      revenueByPaymentMethod,
    };
  }, [routes]);

  // Preparar rotas para o mapa
  const mapRoutes = React.useMemo(() => {
    // Primeiro, encontrar todas as rotas ativas (dispatched ou in_progress)
    const dispatchedOrInProgress = routes.filter(
      route => route.status === 'dispatched' || route.status === 'in_progress'
    );

    // Log detalhado para debug
    console.log('🗺️ Dashboard mapRoutes debug:', {
      totalRoutes: routes.length,
      dispatchedOrInProgress: dispatchedOrInProgress.length,
      routesDetails: dispatchedOrInProgress.map(r => ({
        id: r.id,
        name: r.name,
        status: r.status,
        hasEncodedPolyline: !!r.encodedPolyline,
        polylineLength: r.encodedPolyline?.length || 0,
        stopsCount: r.stops?.length || 0,
        hasOrigin: !!r.origin,
        originLat: r.origin?.lat,
        originLng: r.origin?.lng,
        color: r.color,
      })),
    });

    // Mapear as rotas ativas - incluir mesmo sem polyline (apenas com stops)
    const activeRoutes = dispatchedOrInProgress
      .filter(route => route.stops && route.stops.length > 0)
      .map(route => ({
        ...route,
        visible: true,
        color: route.color || '#3b82f6', // Cor padrão azul se não tiver
      }));

    console.log('🗺️ Dashboard activeRoutes para mapa:', activeRoutes.length);

    return activeRoutes;
  }, [routes]);

  // Origin da primeira rota ativa (para centralizar o mapa)
  const mapOrigin = React.useMemo(() => {
    const firstActiveRoute = routes.find(
      route => (route.status === 'dispatched' || route.status === 'in_progress') &&
               route.origin &&
               typeof route.origin.lat === 'number' &&
               typeof route.origin.lng === 'number'
    );

    const origin = firstActiveRoute?.origin || null;

    console.log('🏠 Dashboard mapOrigin:', {
      found: !!origin,
      lat: origin?.lat,
      lng: origin?.lng,
    });

    return origin;
  }, [routes]);

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
      console.error('Erro ao solicitar atualização de localização:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar',
        description: 'Não foi possível solicitar a atualização da localização.',
      });
    }
  };

  const handleStopClick = (stop: PlaceValue, index: number) => {
    setSelectedStop({ stop, index });
    setIsStopInfoOpen(true);
  };

  const getInitials = (name: string) => {
    if (!name) return 'N/A';
    const names = name.split(' ');
    if (names.length > 1) {
      return `${names[0][0]}${names[names.length - 1][0]}`;
    }
    return name.substring(0, 2);
  };

  const getRouteStats = (stops: PlaceValue[]) => {
    const completed = stops.filter(s => s.deliveryStatus === 'completed').length;
    const failed = stops.filter(s => s.deliveryStatus === 'failed').length;
    const total = stops.length;
    return { completed, failed, total };
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-4">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* KPIs - Linha 1: Métricas principais */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Entregas Hoje</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalDeliveries}</div>
            <p className="text-xs text-muted-foreground">
              em {routes.length} rota{routes.length !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregas Realizadas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{metrics.completedDeliveries}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.totalDeliveries > 0
                ? `${((metrics.completedDeliveries / metrics.totalDeliveries) * 100).toFixed(1)}% do total`
                : '0% do total'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entregas com Falha</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{metrics.failedDeliveries}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.pendingDeliveries} pendente{metrics.pendingDeliveries !== 1 ? 's' : ''}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Faturado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">
              em entregas concluídas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs - Linha 2: Por período e por forma de pagamento */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Entregas por Período */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Entregas por Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid gap-4 ${metrics.draftDeliveries > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <div className="flex flex-col items-center p-3 rounded-lg bg-amber-50 border border-amber-200">
                <Sun className="h-5 w-5 text-amber-500 mb-1" />
                <span className="text-xs text-amber-700 font-medium">Matutino</span>
                <span className="text-xl font-bold text-amber-900">{metrics.deliveriesByPeriod['Matutino']}</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg bg-orange-50 border border-orange-200">
                <Sunset className="h-5 w-5 text-orange-500 mb-1" />
                <span className="text-xs text-orange-700 font-medium">Vespertino</span>
                <span className="text-xl font-bold text-orange-900">{metrics.deliveriesByPeriod['Vespertino']}</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                <Moon className="h-5 w-5 text-indigo-500 mb-1" />
                <span className="text-xs text-indigo-700 font-medium">Noturno</span>
                <span className="text-xl font-bold text-indigo-900">{metrics.deliveriesByPeriod['Noturno']}</span>
              </div>
              {metrics.draftDeliveries > 0 && (
                <div className="flex flex-col items-center p-3 rounded-lg bg-yellow-50 border border-yellow-200">
                  <FileEdit className="h-5 w-5 text-yellow-600 mb-1" />
                  <span className="text-xs text-yellow-700 font-medium">Rascunho</span>
                  <span className="text-xl font-bold text-yellow-900">{metrics.draftDeliveries}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Faturamento por Forma de Pagamento */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Faturamento por Forma de Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(metrics.revenueByPaymentMethod).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                Nenhum pagamento registrado ainda
              </p>
            ) : (
              <div className="space-y-3">
                {Object.entries(metrics.revenueByPaymentMethod)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, value]) => (
                    <div key={method} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PaymentMethodIcon method={method} />
                        <span className="text-sm">{method}</span>
                      </div>
                      <span className="font-semibold">{formatCurrency(value)}</span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Área principal: Rotograma + Mapa */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Rotograma das Rotas Vigentes */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Rotas do Dia
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {routes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <Package className="h-12 w-12 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Nenhuma rota ativa para hoje
                </p>
              </div>
            ) : (
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {routes.map((route) => {
                  const stats = getRouteStats(route.stops || []);
                  const period = getRoutePeriod(route.plannedDate.toDate());
                  const PeriodIcon = period.icon;

                  return (
                    <div key={route.id} className="p-4 space-y-3">
                      {/* Header da rota */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {route.driverInfo ? getInitials(route.driverInfo.name) : 'N/A'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold leading-none">
                              {route.driverInfo?.name || 'Não atribuído'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {route.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge className={`${period.color} text-white text-xs`}>
                            <PeriodIcon className="h-3 w-3 mr-1" />
                            {period.label}
                          </Badge>
                          {route.source === 'lunna' && <LunnaBadge />}
                        </div>
                      </div>

                      {/* Status e estatísticas */}
                      <div className="flex items-center justify-between text-xs">
                        <StatusBadge status={route.status} />
                        <div className="flex items-center gap-3">
                          <span className="text-green-600 font-medium">{stats.completed} ✓</span>
                          <span className="text-red-600 font-medium">{stats.failed} ✗</span>
                          <span className="text-muted-foreground">{stats.total} total</span>
                        </div>
                      </div>

                      {/* Rotograma */}
                      <Rotograma
                        stops={route.stops || []}
                        color={route.color}
                        onStopClick={handleStopClick}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mapa com rotas ativas */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Rotas Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-lg">
              <RouteMap
                routes={mapRoutes}
                origin={mapOrigin}
                driverLocations={driverLocations}
                onRefreshDriverLocation={handleRefreshDriverLocation}
                height={-1}
              />
            </div>
            {driverLocations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {driverLocations.map((loc) => (
                  <Badge key={loc.driverId} variant="outline" className="text-xs">
                    <div className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                    {loc.driverName}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialog de Informações da Parada */}
      <Dialog open={isStopInfoOpen} onOpenChange={setIsStopInfoOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedStop?.stop.deliveryStatus === 'completed' ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span>Entrega Concluída - Parada #{(selectedStop?.index || 0) + 1}</span>
                </div>
              ) : selectedStop?.stop.deliveryStatus === 'failed' ? (
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span>Entrega Falhou - Parada #{(selectedStop?.index || 0) + 1}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <span>Entrega Pendente - Parada #{(selectedStop?.index || 0) + 1}</span>
                </div>
              )}
            </DialogTitle>
            <DialogDescription>
              Informações da parada
            </DialogDescription>
          </DialogHeader>

          {selectedStop && (
            <Tabs defaultValue="delivery" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="delivery" className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Dados da Entrega
                </TabsTrigger>
                <TabsTrigger value="customer" className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Dados do Cliente
                </TabsTrigger>
              </TabsList>

              {/* Aba: Dados da Entrega */}
              <TabsContent value="delivery" className="space-y-6 pt-4">
                {/* Horários */}
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Horários</h3>
                  <div className="space-y-2">
                    {selectedStop.stop.arrivedAt && (() => {
                      try {
                        const date = selectedStop.stop.arrivedAt instanceof Timestamp
                          ? selectedStop.stop.arrivedAt.toDate()
                          : new Date(selectedStop.stop.arrivedAt as any);

                        if (isNaN(date.getTime())) return null;

                        return (
                          <div className="flex items-start gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Chegada</p>
                              <p className="text-sm text-muted-foreground">
                                {format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}

                    {selectedStop.stop.completedAt && (() => {
                      try {
                        const date = selectedStop.stop.completedAt instanceof Timestamp
                          ? selectedStop.stop.completedAt.toDate()
                          : new Date(selectedStop.stop.completedAt as any);

                        if (isNaN(date.getTime())) return null;

                        return (
                          <div className="flex items-start gap-3">
                            <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium">Conclusão</p>
                              <p className="text-sm text-muted-foreground">
                                {format(date, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                              </p>
                            </div>
                          </div>
                        );
                      } catch {
                        return null;
                      }
                    })()}

                    {!selectedStop.stop.arrivedAt && !selectedStop.stop.completedAt && (
                      <p className="text-sm text-muted-foreground">Ainda não há registros de horário</p>
                    )}
                  </div>
                </div>

                {/* Pagamentos */}
                {selectedStop.stop.payments && selectedStop.stop.payments.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase">Pagamentos</h3>
                    <div className="space-y-2">
                      {selectedStop.stop.payments.map((payment, idx) => (
                        <div key={payment.id || idx} className="flex items-start gap-3">
                          <DollarSign className="h-4 w-4 text-muted-foreground mt-0.5" />
                          <div className="flex-1">
                            <p className="text-sm font-medium">{payment.method}</p>
                            <p className="text-sm text-muted-foreground">
                              {formatCurrency(payment.value)}
                              {payment.installments && ` (${payment.installments}x)`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Motivo da Falha */}
                {selectedStop.stop.deliveryStatus === 'failed' && selectedStop.stop.failureReason && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase">Motivo da Falha</h3>
                    <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                      <p className="text-sm text-red-900">{selectedStop.stop.failureReason}</p>
                    </div>
                  </div>
                )}

                {/* Foto */}
                {selectedStop.stop.photoUrl && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase flex items-center gap-2">
                      <Camera className="h-4 w-4" />
                      Foto da Entrega
                    </h3>
                    <div className="rounded-lg overflow-hidden border">
                      <img
                        src={selectedStop.stop.photoUrl}
                        alt="Foto da entrega"
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                )}

                {/* Assinatura */}
                {selectedStop.stop.signatureUrl && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Assinatura
                    </h3>
                    <div className="rounded-lg overflow-hidden border bg-white">
                      <img
                        src={selectedStop.stop.signatureUrl}
                        alt="Assinatura"
                        className="w-full h-auto"
                      />
                    </div>
                  </div>
                )}

                {/* Observações da Entrega */}
                {selectedStop.stop.notes && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-sm text-muted-foreground uppercase">Observações da Entrega</h3>
                    <div className="rounded-lg bg-muted p-3">
                      <p className="text-sm">{selectedStop.stop.notes}</p>
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* Aba: Dados do Cliente */}
              <TabsContent value="customer" className="space-y-6 pt-4">
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm text-muted-foreground uppercase">Informações do Cliente</h3>
                  <div className="space-y-4">
                    {selectedStop.stop.customerName && (
                      <div className="flex items-start gap-3">
                        <User className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Nome</p>
                          <p className="text-sm text-muted-foreground">{selectedStop.stop.customerName}</p>
                        </div>
                      </div>
                    )}

                    {selectedStop.stop.phone && (
                      <div className="flex items-start gap-3">
                        <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Telefone</p>
                          <p className="text-sm text-muted-foreground">{selectedStop.stop.phone}</p>
                        </div>
                      </div>
                    )}

                    {selectedStop.stop.orderNumber && (
                      <div className="flex items-start gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Número do Pedido</p>
                          <p className="text-sm text-muted-foreground">{selectedStop.stop.orderNumber}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Endereço</p>
                        <p className="text-sm text-muted-foreground">{selectedStop.stop.address}</p>
                      </div>
                    </div>

                    {/* Janela de Tempo */}
                    {(selectedStop.stop.timeWindowStart || selectedStop.stop.timeWindowEnd) && (
                      <div className="flex items-start gap-3">
                        <Clock className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">Janela de Atendimento</p>
                          <p className="text-sm text-muted-foreground">
                            {selectedStop.stop.timeWindowStart && selectedStop.stop.timeWindowEnd
                              ? `${selectedStop.stop.timeWindowStart} às ${selectedStop.stop.timeWindowEnd}`
                              : selectedStop.stop.timeWindowStart || selectedStop.stop.timeWindowEnd}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
