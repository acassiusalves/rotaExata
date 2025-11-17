'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { History, Loader2, MapPin, Milestone, FileText, LayoutGrid, List, Search, Sunrise, Sunset, Calendar } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { format, startOfDay, endOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RouteDetailsDialog } from '@/components/routes/route-details-dialog';
import { DatePickerWithPresets } from '@/components/ui/date-picker-with-presets';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  plannedDate: Timestamp;
  completedAt?: Timestamp;
  origin: PlaceValue;
  driverInfo: {
    name: string;
    vehicle: {
      type: string;
      plate: string;
    };
  } | null;
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(2);

// Função para determinar o período (Matutino, Vespertino ou Noturno)
const getPeriodInfo = (date: Date | Timestamp) => {
  const hour = date instanceof Date ? date.getHours() : date.toDate().getHours();

  // Matutino: 8h - 11h59
  if (hour >= 8 && hour < 12) {
    return {
      period: 'matutino',
      label: 'Matutino',
      icon: Sunrise,
      color: '#3B82F6',
    };
  }
  // Vespertino: 12h - 18h59
  else if (hour >= 12 && hour < 19) {
    return {
      period: 'vespertino',
      label: 'Vespertino',
      icon: Sunset,
      color: '#F59E0B',
    };
  }
  // Noturno: 19h+
  else {
    return {
      period: 'noturno',
      label: 'Noturno',
      icon: Sunset,
      color: '#8B5CF6',
    };
  }
};

// Componente de Badge de Status
const StatusBadge: React.FC<{ status?: 'dispatched' | 'in_progress' | 'completed' | 'completed_auto' }> = ({ status }) => {
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

  return <Badge variant="secondary">Concluída</Badge>;
};

const getInitials = (name: string) => {
  if (!name) return 'N/A';
  const names = name.split(' ');
  if (names.length > 1) {
    return `${names[0][0]}${names[names.length - 1][0]}`;
  }
  return name.substring(0, 2);
};

export default function HistoryRoutesPage() {
  const [completedRoutes, setCompletedRoutes] = React.useState<RouteDocument[]>([]);
  const [filteredRoutes, setFilteredRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedRoute, setSelectedRoute] = React.useState<RouteDocument | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');

  // Estados dos filtros
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedDriver, setSelectedDriver] = React.useState<string>('all');
  const [selectedPeriod, setSelectedPeriod] = React.useState<string>('all');
  const [startDate, setStartDate] = React.useState<Date>(subDays(new Date(), 30));
  const [endDate, setEndDate] = React.useState<Date>(new Date());

  // Buscar todas as rotas concluídas
  React.useEffect(() => {
    const q = query(
      collection(db, 'routes'),
      where('status', 'in', ['completed', 'completed_auto'])
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const routesData: RouteDocument[] = [];
        snapshot.forEach((doc) => {
          routesData.push({ id: doc.id, ...doc.data() } as RouteDocument);
        });

        // Ordenar por data de conclusão (mais recente primeiro) no cliente
        routesData.sort((a, b) => {
          const dateA = a.completedAt?.toMillis() || 0;
          const dateB = b.completedAt?.toMillis() || 0;
          return dateB - dateA;
        });

        setCompletedRoutes(routesData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching routes: ', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Extrair lista única de motoristas
  const drivers = React.useMemo(() => {
    const driverNames = new Set<string>();
    completedRoutes.forEach(route => {
      if (route.driverInfo?.name) {
        driverNames.add(route.driverInfo.name);
      }
    });
    return Array.from(driverNames).sort();
  }, [completedRoutes]);

  // Aplicar filtros
  React.useEffect(() => {
    let filtered = [...completedRoutes];

    // Filtro por busca de texto
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        route =>
          route.name?.toLowerCase().includes(search) ||
          route.code?.toLowerCase().includes(search) ||
          route.driverInfo?.name?.toLowerCase().includes(search)
      );
    }

    // Filtro por motorista
    if (selectedDriver !== 'all') {
      filtered = filtered.filter(route => route.driverInfo?.name === selectedDriver);
    }

    // Filtro por período do dia
    if (selectedPeriod !== 'all') {
      filtered = filtered.filter(route => {
        if (!route.plannedDate) return false;
        const period = getPeriodInfo(route.plannedDate);
        return period.period === selectedPeriod;
      });
    }

    // Filtro por intervalo de datas
    const start = startOfDay(startDate);
    const end = endOfDay(endDate);
    filtered = filtered.filter(route => {
      if (!route.completedAt) return false;
      const completedDate = route.completedAt.toDate();
      return completedDate >= start && completedDate <= end;
    });

    setFilteredRoutes(filtered);
  }, [completedRoutes, searchTerm, selectedDriver, selectedPeriod, startDate, endDate]);

  const handleOpenDetails = (route: RouteDocument) => {
    setSelectedRoute(route);
    setIsDetailsOpen(true);
  };

  return (
    <>
      <div className="flex-1 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Histórico de Rotas</h2>
            <p className="text-muted-foreground">
              {filteredRoutes.length === completedRoutes.length
                ? `${completedRoutes.length} rota${completedRoutes.length !== 1 ? 's' : ''} concluída${completedRoutes.length !== 1 ? 's' : ''}`
                : `${filteredRoutes.length} de ${completedRoutes.length} rota${completedRoutes.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <ToggleGroup type="single" value={viewMode} onValueChange={(value) => value && setViewMode(value as 'grid' | 'list')}>
            <ToggleGroupItem value="grid" aria-label="Visualização em grade" className="h-10 w-10">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="Visualização em lista" className="h-10 w-10">
              <List className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Filtros */}
        <Card>
          <CardHeader>
            <CardTitle>Filtros</CardTitle>
            <CardDescription>Refine sua busca de rotas concluídas</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {/* Campo de busca */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Buscar</label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Nome, código ou motorista..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Filtro de intervalo de datas */}
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Período</label>
                <DatePickerWithPresets
                  startDate={startDate}
                  endDate={endDate}
                  onDateRangeChange={(start, end) => {
                    setStartDate(start);
                    setEndDate(end);
                  }}
                  placeholder="Selecione o período"
                />
              </div>

              {/* Filtro de motorista */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Motorista</label>
                <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {drivers.map(driver => (
                      <SelectItem key={driver} value={driver}>
                        {driver}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Filtro de período do dia */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Período do Dia</label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="matutino">Matutino (8h-11h)</SelectItem>
                    <SelectItem value="vespertino">Vespertino (12h-18h)</SelectItem>
                    <SelectItem value="noturno">Noturno (19h+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && filteredRoutes.length === 0 && (
          <Card className="min-h-[400px] flex items-center justify-center border-dashed">
            <CardContent className="text-center pt-6">
              <History className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma Rota Encontrada</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {completedRoutes.length === 0
                  ? 'Ainda não há rotas concluídas no sistema.'
                  : 'Nenhuma rota corresponde aos filtros selecionados.'}
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && filteredRoutes.length > 0 && viewMode === 'grid' && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredRoutes.map((route) => (
              <Card key={route.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {route.code && (
                        <Badge variant="outline" className="font-mono mb-2">
                          {route.code}
                        </Badge>
                      )}
                      <CardTitle>{route.name}</CardTitle>
                    </div>
                    <StatusBadge status={route.status} />
                  </div>
                  <CardDescription>
                    {route.completedAt
                      ? `Concluída em ${format(route.completedAt.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`
                      : 'Data de conclusão não registrada'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  {/* Informações do Motorista */}
                  {route.driverInfo && (
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{getInitials(route.driverInfo.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{route.driverInfo.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {route.driverInfo.vehicle?.type} - {route.driverInfo.vehicle?.plate}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Estatísticas */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span>{route.stops.length} paradas</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Milestone className="h-4 w-4 text-muted-foreground" />
                      <span>{formatDistance(route.distanceMeters)} km</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {route.plannedDate
                          ? format(route.plannedDate.toDate(), "dd/MM/yyyy", { locale: ptBR })
                          : 'Data não informada'}
                      </span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter>
                  <Button className="w-full" variant="secondary" onClick={() => handleOpenDetails(route)}>
                    <FileText className="mr-2 h-4 w-4" />
                    Ver Detalhes
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}

        {!isLoading && filteredRoutes.length > 0 && viewMode === 'list' && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Data Planejada</TableHead>
                  <TableHead>Concluída em</TableHead>
                  <TableHead className="text-center">Paradas</TableHead>
                  <TableHead className="text-center">Distância</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoutes.map((route) => (
                  <TableRow key={route.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {route.code || '-'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{route.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={route.status} />
                    </TableCell>
                    <TableCell>
                      {route.driverInfo ? (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {getInitials(route.driverInfo.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{route.driverInfo.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {route.driverInfo.vehicle?.type} - {route.driverInfo.vehicle?.plate}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">Não atribuído</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {route.plannedDate
                        ? format(route.plannedDate.toDate(), "dd/MM/yyyy", { locale: ptBR })
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {route.completedAt
                        ? format(route.completedAt.toDate(), "dd/MM/yyyy HH:mm", { locale: ptBR })
                        : '-'}
                    </TableCell>
                    <TableCell className="text-center">{route.stops.length}</TableCell>
                    <TableCell className="text-center">{formatDistance(route.distanceMeters)} km</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenDetails(route)}
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        Ver Detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {selectedRoute && (
        <RouteDetailsDialog
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          route={selectedRoute}
        />
      )}
    </>
  );
}
