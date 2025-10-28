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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { History, Loader2, MapPin, Milestone, FileText, Calendar, User, LayoutGrid, List } from 'lucide-react';
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
import { db } from '@/lib/firebase/client';
import { collection, query, where, onSnapshot, Timestamp } from 'firebase/firestore';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { RouteDetailsDialog } from '@/components/routes/route-details-dialog';

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
  const [isLoading, setIsLoading] = React.useState(true);
  const [selectedRoute, setSelectedRoute] = React.useState<RouteDocument | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<'grid' | 'list'>('grid');

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
              Consulte todas as rotas concluídas do sistema
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

        {isLoading && (
          <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && completedRoutes.length === 0 && (
          <Card className="min-h-[400px] flex items-center justify-center border-dashed">
            <CardContent className="text-center pt-6">
              <History className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">Nenhuma Rota no Histórico</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Ainda não há rotas concluídas no sistema.
              </p>
            </CardContent>
          </Card>
        )}

        {!isLoading && completedRoutes.length > 0 && viewMode === 'grid' && (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {completedRoutes.map((route) => (
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

        {!isLoading && completedRoutes.length > 0 && viewMode === 'list' && (
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
                {completedRoutes.map((route) => (
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
