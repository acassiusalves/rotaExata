
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Route as RouteIcon, Truck, MapPin, Milestone, Clock, User, Loader2, UserCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { db } from '@/lib/firebase/client';
import { collection, onSnapshot, query, orderBy, Timestamp, doc, updateDoc, where } from 'firebase/firestore';
import type { RouteInfo, Driver } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';

// Extend RouteInfo to include fields from Firestore doc
type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  driverId: string;
  driverInfo: {
    name: string;
    vehicle: { type: string; plate: string };
  } | null;
  plannedDate: Timestamp;
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(2);
const formatDuration = (durationString: string = '0s') => {
  const seconds = parseInt(durationString.replace('s', ''), 10);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};


export default function RoutesPage() {
  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [availableDrivers, setAvailableDrivers] = React.useState<Driver[]>([]);
  const [isChangeDriverDialogOpen, setIsChangeDriverDialogOpen] = React.useState(false);
  const [selectedRoute, setSelectedRoute] = React.useState<RouteDocument | null>(null);
  const [newDriverId, setNewDriverId] = React.useState<string>('');
  const [isUpdating, setIsUpdating] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    const q = query(collection(db, 'routes'), orderBy('plannedDate', 'desc'));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const routesData: RouteDocument[] = [];
      querySnapshot.forEach((doc) => {
        routesData.push({
          id: doc.id,
          ...doc.data(),
        } as RouteDocument);
      });
      setRoutes(routesData);
      setIsLoading(false);
    }, (error) => {
        console.error("Error fetching routes: ", error);
        setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  React.useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'driver'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const driversData: Driver[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        driversData.push({
          id: doc.id,
          name: data.displayName || data.name || 'Motorista sem nome',
          email: data.email,
          phone: data.phone || 'N/A',
          status: data.status || 'offline',
          vehicle: data.vehicle || { type: 'N/A', plate: 'N/A' },
          lastSeenAt: data.lastSeenAt?.toDate() || new Date(0),
          totalDeliveries: data.totalDeliveries || 0,
          rating: data.rating || 0,
          avatarUrl: data.photoURL,
        })
      });
      setAvailableDrivers(driversData);
    });

    return () => unsubscribe();
  }, []);

  const handleOpenChangeDriver = (route: RouteDocument) => {
    setSelectedRoute(route);
    setNewDriverId(route.driverId || '');
    setIsChangeDriverDialogOpen(true);
  };

  const handleChangeDriver = async () => {
    if (!selectedRoute || !newDriverId) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Por favor, selecione um motorista.',
      });
      return;
    }

    setIsUpdating(true);

    try {
      const driver = availableDrivers.find(d => d.id === newDriverId);

      await updateDoc(doc(db, 'routes', selectedRoute.id), {
        driverId: newDriverId,
        driverInfo: driver ? { name: driver.name, vehicle: driver.vehicle } : null,
      });

      toast({
        title: 'Motorista Alterado!',
        description: `A rota "${selectedRoute.name}" foi atribuída a ${driver?.name}.`,
      });

      setIsChangeDriverDialogOpen(false);
      setSelectedRoute(null);
      setNewDriverId('');
    } catch (error) {
      console.error('Error updating driver:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Alterar Motorista',
        description: 'Não foi possível atualizar o motorista da rota.',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
      return (
          <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
      );
  }

  if (routes.length === 0) {
      return (
        <Card className="min-h-[400px] flex items-center justify-center border-dashed">
            <CardContent className="text-center pt-6">
                <RouteIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Nenhuma Rota Ativa</h3>
            <p className="mt-2 text-sm text-muted-foreground">
                As rotas criadas e despachadas aparecerão aqui.
            </p>
            <Button className="mt-4" asChild>
                <Link href="/routes/new">Criar Primeira Rota</Link>
            </Button>
            </CardContent>
        </Card>
      );
  }

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {routes.map((route) => (
          <Card key={route.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{route.name}</span>
                <Badge variant={route.status === 'dispatched' ? 'default' : 'secondary'}>
                  {route.status === 'dispatched' ? 'Despachada' : 'Em Andamento'}
                </Badge>
              </CardTitle>
              <CardDescription>
                {format(route.plannedDate.toDate(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{route.driverInfo?.name || 'Motorista não informado'}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenChangeDriver(route)}
                    className="h-8 px-2"
                    title="Trocar motorista"
                  >
                    <UserCog className="h-4 w-4" />
                  </Button>
                </div>
              <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span>{route.stops.length} paradas</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                  <Milestone className="h-4 w-4 text-muted-foreground" />
                  <span>{formatDistance(route.distanceMeters)} km</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>{formatDuration(route.duration)}</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button className="w-full" variant="outline">
                  <Truck className="mr-2 h-4 w-4" />
                  Acompanhar Rota
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Change Driver Dialog */}
      <Dialog open={isChangeDriverDialogOpen} onOpenChange={setIsChangeDriverDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar Motorista</DialogTitle>
            <DialogDescription>
              Selecione um novo motorista para a rota "{selectedRoute?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Motorista Atual</label>
              <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{selectedRoute?.driverInfo?.name || 'Não informado'}</span>
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Novo Motorista</label>
              <Select value={newDriverId} onValueChange={setNewDriverId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um motorista..." />
                </SelectTrigger>
                <SelectContent>
                  {availableDrivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={driver.avatarUrl} alt={driver.name} />
                          <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span>{driver.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {driver.vehicle.type}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsChangeDriverDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleChangeDriver} disabled={isUpdating || !newDriverId}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Atualizando...
                </>
              ) : (
                'Confirmar Troca'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
