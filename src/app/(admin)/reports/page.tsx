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
} from 'firebase/firestore';
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
  const [dateRange, setDateRange] = React.useState<string>('7days');
  const [startDate, setStartDate] = React.useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = React.useState<Date>(new Date());

  // Dialog
  const [selectedDelivery, setSelectedDelivery] = React.useState<DeliveryReport | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);

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
        const deliveryTotal = d.payments?.reduce((s, p) => s + (p.amount || 0), 0) || 0;
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

  React.useEffect(() => {
    // Atualizar range de datas baseado na seleção
    const now = new Date();
    switch (dateRange) {
      case 'today':
        setStartDate(startOfDay(now));
        setEndDate(endOfDay(now));
        break;
      case '7days':
        setStartDate(startOfDay(subDays(now, 7)));
        setEndDate(endOfDay(now));
        break;
      case '30days':
        setStartDate(startOfDay(subDays(now, 30)));
        setEndDate(endOfDay(now));
        break;
      case 'thisMonth':
        setStartDate(startOfMonth(now));
        setEndDate(endOfMonth(now));
        break;
      case 'all':
        setStartDate(new Date(2020, 0, 1));
        setEndDate(endOfDay(now));
        break;
    }
  }, [dateRange]);

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

    setFilteredDeliveries(filtered);
  }, [deliveries, searchTerm, selectedDriver, selectedStatus]);

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
      'Entregue em',
      'Telefone',
      'Valor Total',
      'Motivo Falha',
    ];

    const rows = filteredDeliveries.map(d => [
      format(d.plannedDate, 'dd/MM/yyyy', { locale: ptBR }),
      d.routeName,
      d.driverName,
      d.stopIndex + 1,
      d.customerName,
      d.address,
      d.orderNumber || '',
      d.deliveryStatus === 'completed' ? 'Entregue' : d.deliveryStatus === 'failed' ? 'Falhou' : 'Pendente',
      d.completedAt ? format(d.completedAt, 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '',
      d.phone || '',
      d.payments ? formatCurrency(d.payments.reduce((s, p) => s + (p.amount || 0), 0)) : '',
      d.failureReason || '',
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-entregas-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const getStatusBadge = (status?: 'completed' | 'failed') => {
    if (status === 'completed') {
      return (
        <Badge className="bg-green-600 hover:bg-green-700">
          <CheckCircle className="mr-1 h-3 w-3" />
          Entregue
        </Badge>
      );
    }
    if (status === 'failed') {
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
        <Button onClick={handleExportCSV} className="gap-2">
          <Download className="h-4 w-4" />
          Exportar CSV
        </Button>
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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="7days">Últimos 7 dias</SelectItem>
                  <SelectItem value="30days">Últimos 30 dias</SelectItem>
                  <SelectItem value="thisMonth">Este mês</SelectItem>
                  <SelectItem value="all">Todos os períodos</SelectItem>
                </SelectContent>
              </Select>
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
                  <TableHead>Data</TableHead>
                  <TableHead>Rota</TableHead>
                  <TableHead>Motorista</TableHead>
                  <TableHead>Parada</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDeliveries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      Nenhuma entrega encontrada com os filtros selecionados
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDeliveries.map((delivery, index) => (
                    <TableRow key={index}>
                      <TableCell className="whitespace-nowrap">
                        {format(delivery.plannedDate, 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell>{delivery.routeName}</TableCell>
                      <TableCell>{delivery.driverName}</TableCell>
                      <TableCell>#{delivery.stopIndex + 1}</TableCell>
                      <TableCell>{delivery.customerName}</TableCell>
                      <TableCell>{delivery.orderNumber || '-'}</TableCell>
                      <TableCell>{getStatusBadge(delivery.deliveryStatus)}</TableCell>
                      <TableCell>
                        {delivery.payments
                          ? formatCurrency(delivery.payments.reduce((s, p) => s + (p.amount || 0), 0))
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
                    <div className="mt-1">{getStatusBadge(selectedDelivery.deliveryStatus)}</div>
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
                                {formatCurrency(payment.amount || 0)}
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
                            selectedDelivery.payments.reduce((s, p) => s + (p.amount || 0), 0)
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
