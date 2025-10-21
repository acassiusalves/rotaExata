'use client';

import * as React from 'react';
import {
  FileText,
  Download,
  Search,
  Filter,
  Calendar,
  User,
  MapPin,
  TrendingUp,
  Package,
  DollarSign,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';
import { db } from '@/lib/firebase/client';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  getDocs,
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from 'firebase/firestore';
import { auth } from '@/lib/firebase/client';
import { useToast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { format, startOfDay, endOfDay, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DatePickerWithPresets } from '@/components/ui/date-picker-with-presets';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  driverInfo: {
    name: string;
    vehicle: { type: string; plate: string };
  } | null;
  driverId?: string;
  plannedDate: Timestamp;
};

type DeliveryReport = {
  routeId: string;
  routeName: string;
  driverName: string;
  stopIndex: number;
  stopId: string; // ID único da parada para identificação
  customerName: string;
  address: string;
  orderNumber?: string;
  deliveryStatus?: 'completed' | 'failed';
  completedAt?: Date;
  arrivedAt?: Date;
  failureReason?: string;
  phone?: string;
  notes?: string;
  plannedDate: Date;
  payments?: any[];
  photoUrl?: string;
  signatureUrl?: string;
  reconciled?: boolean;
  reconciledAt?: Date;
  reconciledBy?: string;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export default function ReportsPage() {
  const [routes, setRoutes] = React.useState<RouteDocument[]>([]);
  const [deliveries, setDeliveries] = React.useState<DeliveryReport[]>([]);
  const [filteredDeliveries, setFilteredDeliveries] = React.useState<DeliveryReport[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedDriver, setSelectedDriver] = React.useState<string>('all');
  const [selectedStatus, setSelectedStatus] = React.useState<string>('all');
  const [selectedReconciliation, setSelectedReconciliation] = React.useState<string>('all');
  const [startDate, setStartDate] = React.useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = React.useState<Date>(new Date());

  // Dialog
  const [selectedDelivery, setSelectedDelivery] = React.useState<DeliveryReport | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);

  // Seleção para conciliação
  const [selectedDeliveryIds, setSelectedDeliveryIds] = React.useState<Set<string>>(new Set());
  const [isReconciling, setIsReconciling] = React.useState(false);
  const { toast } = useToast();

  // Estatísticas
  const stats = React.useMemo(() => {
    const total = filteredDeliveries.length;
    const completed = filteredDeliveries.filter(d => d.deliveryStatus === 'completed').length;
    const failed = filteredDeliveries.filter(d => d.deliveryStatus === 'failed').length;
    const pending = total - completed - failed;

    const completionRate = total > 0 ? (completed / total) * 100 : 0;

    const totalRevenue = filteredDeliveries
      .filter(d => d.deliveryStatus === 'completed' && d.payments)
      .reduce((sum, d) => {
        const deliveryTotal = d.payments?.reduce((s, p) => s + (p.value || 0), 0) || 0;
        return sum + deliveryTotal;
      }, 0);

    return {
      total,
      completed,
      failed,
      pending,
      completionRate: completionRate.toFixed(1),
      totalRevenue,
    };
  }, [filteredDeliveries]);

  // Lista de motoristas únicos
  const drivers = React.useMemo(() => {
    const uniqueDrivers = new Set(deliveries.map(d => d.driverName));
    return Array.from(uniqueDrivers).sort();
  }, [deliveries]);

  const handleDateRangeChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  React.useEffect(() => {
    const q = query(
      collection(db, 'routes'),
      where('plannedDate', '>=', Timestamp.fromDate(startDate)),
      where('plannedDate', '<=', Timestamp.fromDate(endDate)),
      orderBy('plannedDate', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const routesData: RouteDocument[] = [];
        querySnapshot.forEach((doc) => {
          routesData.push({
            id: doc.id,
            ...doc.data(),
          } as RouteDocument);
        });

        setRoutes(routesData);

        // Processar entregas
        const deliveriesData: DeliveryReport[] = [];
        routesData.forEach((route) => {
          route.stops.forEach((stop, index) => {
            deliveriesData.push({
              routeId: route.id,
              routeName: route.name,
              driverName: route.driverInfo?.name || 'Sem motorista',
              stopIndex: index,
              stopId: stop.id, // ID único da parada
              customerName: stop.customerName || 'Cliente não informado',
              address: stop.address,
              orderNumber: stop.orderNumber,
              deliveryStatus: stop.deliveryStatus,
              completedAt: stop.completedAt ? (stop.completedAt instanceof Timestamp ? stop.completedAt.toDate() : stop.completedAt) : undefined,
              arrivedAt: stop.arrivedAt ? (stop.arrivedAt instanceof Timestamp ? stop.arrivedAt.toDate() : stop.arrivedAt) : undefined,
              failureReason: stop.failureReason,
              phone: stop.phone,
              notes: stop.notes,
              plannedDate: route.plannedDate.toDate(),
              payments: stop.payments,
              photoUrl: stop.photoUrl,
              signatureUrl: stop.signatureUrl,
              reconciled: stop.reconciled || false,
              reconciledAt: stop.reconciledAt ? (stop.reconciledAt instanceof Timestamp ? stop.reconciledAt.toDate() : stop.reconciledAt) : undefined,
              reconciledBy: stop.reconciledBy,
            });
          });
        });

        setDeliveries(deliveriesData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Error fetching routes:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [startDate, endDate]);

  React.useEffect(() => {
    let filtered = [...deliveries];

    // Filtro por busca
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        d =>
          d.customerName.toLowerCase().includes(search) ||
          d.address.toLowerCase().includes(search) ||
          d.orderNumber?.toLowerCase().includes(search) ||
          d.routeName.toLowerCase().includes(search) ||
          d.driverName.toLowerCase().includes(search)
      );
    }

    // Filtro por motorista
    if (selectedDriver !== 'all') {
      filtered = filtered.filter(d => d.driverName === selectedDriver);
    }

    // Filtro por status
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'pending') {
        filtered = filtered.filter(d => !d.deliveryStatus);
      } else {
        filtered = filtered.filter(d => d.deliveryStatus === selectedStatus);
      }
    }

    // Filtro por conciliação
    if (selectedReconciliation !== 'all') {
      if (selectedReconciliation === 'reconciled') {
        filtered = filtered.filter(d => d.reconciled);
      } else if (selectedReconciliation === 'not_reconciled') {
        filtered = filtered.filter(d => !d.reconciled);
      }
    }

    setFilteredDeliveries(filtered);
  }, [deliveries, searchTerm, selectedDriver, selectedStatus, selectedReconciliation]);

  // Funções de seleção para conciliação
  const handleToggleSelection = (stopId: string) => {
    setSelectedDeliveryIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stopId)) {
        newSet.delete(stopId);
      } else {
        newSet.add(stopId);
      }
      return newSet;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedDeliveryIds.size === filteredDeliveries.length) {
      setSelectedDeliveryIds(new Set());
    } else {
      setSelectedDeliveryIds(new Set(filteredDeliveries.map(d => d.stopId)));
    }
  };

  const handleReconcileSelected = async () => {
    if (selectedDeliveryIds.size === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhuma entrega selecionada',
        description: 'Selecione pelo menos uma entrega para conciliar.',
      });
      return;
    }

    setIsReconciling(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Usuário não autenticado');
      }

      // Agrupar por routeId para otimizar as atualizações
      const deliveriesByRoute = new Map<string, DeliveryReport[]>();
      selectedDeliveryIds.forEach(stopId => {
        const delivery = deliveries.find(d => d.stopId === stopId);
        if (delivery) {
          if (!deliveriesByRoute.has(delivery.routeId)) {
            deliveriesByRoute.set(delivery.routeId, []);
          }
          deliveriesByRoute.get(delivery.routeId)!.push(delivery);
        }
      });

      // Atualizar cada rota
      const updatePromises: Promise<void>[] = [];
      deliveriesByRoute.forEach((deliveriesToUpdate, routeId) => {
        const routeRef = doc(db, 'routes', routeId);

        // Buscar a rota atual para atualizar apenas os stops específicos
        const updatePromise = (async () => {
          const snapshot = await getDocs(query(collection(db, 'routes'), where('__name__', '==', routeId)));
          if (!snapshot.empty) {
            const routeData = snapshot.docs[0].data();
            const now = Timestamp.now(); // Usar Timestamp.now() em vez de serverTimestamp() para arrays
            const updatedStops = routeData.stops.map((stop: PlaceValue) => {
              const shouldReconcile = deliveriesToUpdate.some(d => d.stopId === stop.id);
              if (shouldReconcile) {
                return {
                  ...stop,
                  reconciled: true,
                  reconciledAt: now,
                  reconciledBy: currentUser.uid,
                };
              }
              return stop;
            });

            await updateDoc(routeRef, {
              stops: updatedStops,
            });
          }
        })();

        updatePromises.push(updatePromise);
      });

      await Promise.all(updatePromises);

      toast({
        title: 'Entregas conciliadas!',
        description: `${selectedDeliveryIds.size} ${selectedDeliveryIds.size === 1 ? 'entrega foi conciliada' : 'entregas foram conciliadas'} com sucesso.`,
      });

      setSelectedDeliveryIds(new Set());
    } catch (error) {
      console.error('Erro ao conciliar entregas:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao conciliar',
        description: 'Não foi possível conciliar as entregas. Tente novamente.',
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleToggleReconciliation = async (delivery: DeliveryReport) => {
    setIsReconciling(true);

    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        throw new Error('Usuário não autenticado');
      }

      const routeRef = doc(db, 'routes', delivery.routeId);

      // Buscar a rota atual
      const snapshot = await getDocs(query(collection(db, 'routes'), where('__name__', '==', delivery.routeId)));

      if (!snapshot.empty) {
        const routeData = snapshot.docs[0].data();
        const updatedStops = routeData.stops.map((stop: PlaceValue) => {
          if (stop.id === delivery.stopId) {
            // Alternar o status de conciliação
            if (delivery.reconciled) {
              // Remover conciliação
              const { reconciled, reconciledAt, reconciledBy, ...rest } = stop;
              return rest;
            } else {
              // Adicionar conciliação
              return {
                ...stop,
                reconciled: true,
                reconciledAt: Timestamp.now(),
                reconciledBy: currentUser.uid,
              };
            }
          }
          return stop;
        });

        await updateDoc(routeRef, {
          stops: updatedStops,
        });

        // Atualizar o estado local
        setDeliveries(prev => prev.map(d => {
          if (d.stopId === delivery.stopId) {
            if (delivery.reconciled) {
              // Remover conciliação
              const { reconciled, reconciledAt, reconciledBy, ...rest } = d;
              return rest as DeliveryReport;
            } else {
              // Adicionar conciliação
              return {
                ...d,
                reconciled: true,
                reconciledAt: new Date(),
                reconciledBy: currentUser.uid,
              };
            }
          }
          return d;
        }));

        // Atualizar selectedDelivery se ainda estiver aberto
        if (selectedDelivery?.stopId === delivery.stopId) {
          if (delivery.reconciled) {
            const { reconciled, reconciledAt, reconciledBy, ...rest } = selectedDelivery;
            setSelectedDelivery(rest as DeliveryReport);
          } else {
            setSelectedDelivery({
              ...selectedDelivery,
              reconciled: true,
              reconciledAt: new Date(),
              reconciledBy: currentUser.uid,
            });
          }
        }

        toast({
          title: delivery.reconciled ? 'Conciliação removida!' : 'Entrega conciliada!',
          description: delivery.reconciled
            ? 'O status de conciliação foi removido com sucesso.'
            : 'A entrega foi marcada como conciliada.',
        });
      }
    } catch (error) {
      console.error('Erro ao alterar status de conciliação:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao alterar status',
        description: 'Não foi possível alterar o status de conciliação. Tente novamente.',
      });
    } finally {
      setIsReconciling(false);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Data',
      'Rota',
      'Motorista',
      'Parada',
      'Cliente',
      'Endereço',
      'Pedido',
      'Status',
      'Horário Chegada',
      'Horário Conclusão',
      'Período Execução',
      'Telefone',
      'Valor Total',
      'Motivo Falha',
    ];

    const rows = filteredDeliveries.map(d => {
      const periodoExecucao = d.arrivedAt && d.completedAt
        ? `${format(d.arrivedAt, 'HH:mm', { locale: ptBR })} → ${format(d.completedAt, 'HH:mm', { locale: ptBR })}`
        : d.completedAt
        ? format(d.completedAt, 'HH:mm', { locale: ptBR })
        : '';

      return [
        format(d.plannedDate, 'dd/MM/yyyy', { locale: ptBR }),
        d.routeName,
        d.driverName,
        d.stopIndex + 1,
        d.customerName,
        d.address,
        d.orderNumber || '',
        d.deliveryStatus === 'completed' ? 'Entregue' : d.deliveryStatus === 'failed' ? 'Falhou' : 'Pendente',
        d.arrivedAt ? format(d.arrivedAt, 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '',
        d.completedAt ? format(d.completedAt, 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '',
        periodoExecucao,
        d.phone || '',
        d.payments ? formatCurrency(d.payments.reduce((s, p) => s + (p.value || 0), 0)) : '',
        d.failureReason || '',
      ];
    });

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-entregas-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const getStatusBadge = (delivery: DeliveryReport) => {
    // Se conciliado, sempre mostra badge azul
    if (delivery.reconciled) {
      return (
        <Badge className="bg-blue-600 hover:bg-blue-700">
          <CheckCircle className="mr-1 h-3 w-3" />
          Conciliado
        </Badge>
      );
    }

    // Senão, mostra o status normal
    if (delivery.deliveryStatus === 'completed') {
      return (
        <Badge className="bg-green-600 hover:bg-green-700">
          <CheckCircle className="mr-1 h-3 w-3" />
          Entregue
        </Badge>
      );
    }
    if (delivery.deliveryStatus === 'failed') {
      return (
        <Badge variant="destructive">
          <XCircle className="mr-1 h-3 w-3" />
          Falhou
        </Badge>
      );
    }
    return (
      <Badge variant="secondary">
        <AlertCircle className="mr-1 h-3 w-3" />
        Pendente
      </Badge>
    );
  };

  const handleViewDetails = (delivery: DeliveryReport) => {
    setSelectedDelivery(delivery);
    setIsDetailsOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando relatórios...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-8 w-8" />
            Relatórios
          </h1>
          <p className="text-muted-foreground">
            Análise detalhada de entregas e rotas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedDeliveryIds.size > 0 && (
            <Button
              onClick={handleReconcileSelected}
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              disabled={isReconciling}
            >
              {isReconciling ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  Conciliando...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Conciliar Selecionados ({selectedDeliveryIds.size})
                </>
              )}
            </Button>
          )}
          <Button onClick={handleExportCSV} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Entregas</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">entregas no período</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Concluídas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground">{stats.completionRate}% de sucesso</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Falhadas</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
            <p className="text-xs text-muted-foreground">não entregues</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
            <p className="text-xs text-muted-foreground">aguardando entrega</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receita Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.totalRevenue)}</div>
            <p className="text-xs text-muted-foreground">entregas concluídas</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cliente, endereço, pedido..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Período</label>
              <DatePickerWithPresets
                startDate={startDate}
                endDate={endDate}
                onDateRangeChange={handleDateRangeChange}
                placeholder="Selecione o período"
              />
            </div>

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

            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="completed">Entregues</SelectItem>
                  <SelectItem value="failed">Falhadas</SelectItem>
                  <SelectItem value="pending">Pendentes</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Conciliação</label>
              <Select value={selectedReconciliation} onValueChange={setSelectedReconciliation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="reconciled">Conciliados</SelectItem>
                  <SelectItem value="not_reconciled">Não Conciliados</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>
            Entregas ({filteredDeliveries.length})
          </CardTitle>
          <CardDescription>
            Lista detalhada de todas as entregas no período selecionado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={filteredDeliveries.length > 0 && selectedDeliveryIds.size === filteredDeliveries.length}
                      onCheckedChange={handleToggleSelectAll}
                      aria-label="Selecionar todos"
                    />
                  </TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Parada</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Período de Execução</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliveries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      Nenhuma entrega encontrada com os filtros selecionados
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDeliveries.map((delivery, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Checkbox
                          checked={selectedDeliveryIds.has(delivery.stopId)}
                          onCheckedChange={() => handleToggleSelection(delivery.stopId)}
                          aria-label={`Selecionar entrega ${delivery.stopIndex + 1}`}
                          disabled={delivery.reconciled}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {format(delivery.plannedDate, 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell>{delivery.routeName}</TableCell>
                      <TableCell>{delivery.driverName}</TableCell>
                      <TableCell>#{delivery.stopIndex + 1}</TableCell>
                      <TableCell>{delivery.customerName}</TableCell>
                      <TableCell>{delivery.orderNumber || '-'}</TableCell>
                      <TableCell>{getStatusBadge(delivery)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {delivery.arrivedAt && delivery.completedAt ? (
                          <div className="text-sm">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {format(delivery.arrivedAt, 'HH:mm', { locale: ptBR })}
                              {' → '}
                              {format(delivery.completedAt, 'HH:mm', { locale: ptBR })}
                            </div>
                          </div>
                        ) : delivery.completedAt ? (
                          <div className="text-sm">
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {format(delivery.completedAt, 'HH:mm', { locale: ptBR })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {delivery.payments
                          ? formatCurrency(delivery.payments.reduce((s, p) => s + (p.value || 0), 0))
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(delivery)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      {selectedDelivery && (
        <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detalhes da Entrega</DialogTitle>
              <DialogDescription>
                Informações completas sobre a entrega #{selectedDelivery.stopIndex + 1}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="info">Informações</TabsTrigger>
                <TabsTrigger value="payment">Pagamento</TabsTrigger>
                <TabsTrigger value="proof">Comprovantes</TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Cliente</label>
                    <p className="text-sm font-semibold">{selectedDelivery.customerName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <div className="mt-1">{getStatusBadge(selectedDelivery)}</div>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm font-medium text-muted-foreground">Endereço</label>
                    <p className="text-sm">{selectedDelivery.address}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Telefone</label>
                    <p className="text-sm">{selectedDelivery.phone || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Pedido</label>
                    <p className="text-sm">{selectedDelivery.orderNumber || '-'}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Rota</label>
                    <p className="text-sm">{selectedDelivery.routeName}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Motorista</label>
                    <p className="text-sm">{selectedDelivery.driverName}</p>
                  </div>
                  {selectedDelivery.completedAt && (
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Entregue em</label>
                      <p className="text-sm">
                        {format(selectedDelivery.completedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  )}
                  {selectedDelivery.failureReason && (
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Motivo da Falha</label>
                      <p className="text-sm text-red-600">{selectedDelivery.failureReason}</p>
                    </div>
                  )}
                  {selectedDelivery.notes && (
                    <div className="col-span-2">
                      <label className="text-sm font-medium text-muted-foreground">Observações</label>
                      <p className="text-sm">{selectedDelivery.notes}</p>
                    </div>
                  )}

                  {/* Seção de Conciliação */}
                  <div className="col-span-2 mt-4 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Status de Conciliação</label>
                        {selectedDelivery.reconciled ? (
                          <div className="mt-2 space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-blue-600 hover:bg-blue-700">
                                <CheckCircle className="mr-1 h-3 w-3" />
                                Conciliado
                              </Badge>
                            </div>
                            {selectedDelivery.reconciledAt && (
                              <p className="text-xs text-muted-foreground">
                                Conciliado em {format(
                                  selectedDelivery.reconciledAt instanceof Date
                                    ? selectedDelivery.reconciledAt
                                    : selectedDelivery.reconciledAt.toDate(),
                                  "dd/MM/yyyy 'às' HH:mm",
                                  { locale: ptBR }
                                )}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="mt-2">
                            <Badge variant="secondary">
                              <AlertCircle className="mr-1 h-3 w-3" />
                              Não Conciliado
                            </Badge>
                          </div>
                        )}
                      </div>
                      <Button
                        variant={selectedDelivery.reconciled ? "outline" : "default"}
                        size="sm"
                        onClick={() => handleToggleReconciliation(selectedDelivery)}
                        disabled={isReconciling}
                        className={selectedDelivery.reconciled ? "" : "bg-blue-600 hover:bg-blue-700"}
                      >
                        {isReconciling ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2"></div>
                            Processando...
                          </>
                        ) : selectedDelivery.reconciled ? (
                          <>
                            <XCircle className="mr-2 h-4 w-4" />
                            Remover Conciliação
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Marcar como Conciliado
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="payment" className="space-y-4 mt-4">
                {selectedDelivery.payments && selectedDelivery.payments.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDelivery.payments.map((payment, idx) => (
                      <Card key={idx}>
                        <CardContent className="pt-6">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Método</label>
                              <p className="text-sm font-semibold capitalize">{payment.method}</p>
                            </div>
                            <div>
                              <label className="text-sm font-medium text-muted-foreground">Valor</label>
                              <p className="text-sm font-semibold text-green-600">
                                {formatCurrency(payment.value || 0)}
                              </p>
                            </div>
                            {payment.installments && (
                              <div className="col-span-2">
                                <label className="text-sm font-medium text-muted-foreground">Parcelas</label>
                                <p className="text-sm">{payment.installments}x</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <div className="pt-4 border-t">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold">Total:</span>
                        <span className="text-xl font-bold text-green-600">
                          {formatCurrency(
                            selectedDelivery.payments.reduce((s, p) => s + (p.value || 0), 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhuma informação de pagamento registrada
                  </p>
                )}
              </TabsContent>

              <TabsContent value="proof" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 gap-4">
                  {selectedDelivery.photoUrl && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">
                        Foto da Entrega
                      </label>
                      <img
                        src={selectedDelivery.photoUrl}
                        alt="Comprovante"
                        className="w-full rounded-lg border"
                      />
                    </div>
                  )}
                  {selectedDelivery.signatureUrl && (
                    <div>
                      <label className="text-sm font-medium text-muted-foreground mb-2 block">
                        Assinatura
                      </label>
                      <img
                        src={selectedDelivery.signatureUrl}
                        alt="Assinatura"
                        className="w-full rounded-lg border bg-white"
                      />
                    </div>
                  )}
                  {!selectedDelivery.photoUrl && !selectedDelivery.signatureUrl && (
                    <p className="text-center text-muted-foreground py-8">
                      Nenhum comprovante registrado
                    </p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
