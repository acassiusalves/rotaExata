'use client';

import * as React from 'react';
import {
  Search,
  Download,
  MapPin,
  User,
  Package,
  FileText,
  Calendar,
  Route,
  Filter,
  Copy,
  Check,
  Phone,
} from 'lucide-react';

// Componente do ícone do WhatsApp
const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);
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
} from 'firebase/firestore';
import type { PlaceValue, RouteInfo } from '@/lib/types';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DatePickerWithPresets } from '@/components/ui/date-picker-with-presets';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  code?: string;
  status: 'dispatched' | 'in_progress' | 'completed';
  driverInfo: {
    name: string;
    vehicle: { type: string; plate: string };
  } | null;
  driverId?: string;
  plannedDate: Timestamp;
};

type ClientRecord = {
  id: string;
  routeId: string;
  routeName: string;
  routeCode?: string;
  customerName: string;
  phone: string;
  address: string;
  complemento?: string;
  orderNumber?: string;
  notes?: string;
  driverName: string;
  plannedDate: Date;
  deliveryStatus?: string;
};

export default function NumbersListPage() {
  const [clients, setClients] = React.useState<ClientRecord[]>([]);
  const [filteredClients, setFilteredClients] = React.useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedDriver, setSelectedDriver] = React.useState<string>('all');
  const [selectedRoute, setSelectedRoute] = React.useState<string>('all');
  const [startDate, setStartDate] = React.useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = React.useState<Date>(new Date());

  // Estado para feedback de cópia
  const [copiedPhone, setCopiedPhone] = React.useState<string | null>(null);

  // Função para copiar telefone
  const copyToClipboard = async (phone: string) => {
    try {
      await navigator.clipboard.writeText(phone);
      setCopiedPhone(phone);
      setTimeout(() => setCopiedPhone(null), 2000);
    } catch (err) {
      console.error('Erro ao copiar:', err);
    }
  };

  // Lista de motoristas e rotas únicas
  const drivers = React.useMemo(() => {
    const uniqueDrivers = new Set(clients.map(c => c.driverName).filter(Boolean));
    return Array.from(uniqueDrivers).sort();
  }, [clients]);

  const routes = React.useMemo(() => {
    const uniqueRoutes = new Map<string, string>();
    clients.forEach(c => {
      if (c.routeId && c.routeName) {
        uniqueRoutes.set(c.routeId, c.routeCode ? `${c.routeCode} - ${c.routeName}` : c.routeName);
      }
    });
    return Array.from(uniqueRoutes.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [clients]);

  const handleDateRangeChange = (start: Date, end: Date) => {
    setStartDate(start);
    setEndDate(end);
  };

  // Buscar dados das rotas
  React.useEffect(() => {
    setIsLoading(true);

    const q = query(
      collection(db, 'routes'),
      where('plannedDate', '>=', Timestamp.fromDate(startDate)),
      where('plannedDate', '<=', Timestamp.fromDate(endDate)),
      orderBy('plannedDate', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const clientsData: ClientRecord[] = [];

        querySnapshot.forEach((doc) => {
          const route = doc.data() as RouteDocument;
          const routeId = doc.id;
          const routeName = route.name || 'Rota sem nome';
          const routeCode = route.code;
          const driverName = route.driverInfo?.name || 'Não atribuído';
          const plannedDate = route.plannedDate?.toDate() || new Date();

          // Extrair dados de cada parada/cliente
          if (route.stops && Array.isArray(route.stops)) {
            route.stops.forEach((stop: PlaceValue, index: number) => {
              // Só adicionar se tiver informações do cliente
              if (stop.customerName || stop.phone || stop.address) {
                clientsData.push({
                  id: `${routeId}-${index}`,
                  routeId,
                  routeName,
                  routeCode,
                  customerName: stop.customerName || 'Cliente não informado',
                  phone: stop.phone || '',
                  address: stop.address || stop.addressString || '',
                  complemento: stop.complemento,
                  orderNumber: stop.orderNumber,
                  notes: stop.notes,
                  driverName,
                  plannedDate,
                  deliveryStatus: stop.deliveryStatus,
                });
              }
            });
          }
        });

        setClients(clientsData);
        setIsLoading(false);
      },
      (error) => {
        console.error('Erro ao buscar rotas:', error);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [startDate, endDate]);

  // Aplicar filtros
  React.useEffect(() => {
    let filtered = [...clients];

    // Filtro por termo de busca
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        c =>
          c.customerName.toLowerCase().includes(term) ||
          c.phone.includes(term) ||
          c.address.toLowerCase().includes(term) ||
          c.orderNumber?.toLowerCase().includes(term) ||
          c.routeName.toLowerCase().includes(term)
      );
    }

    // Filtro por motorista
    if (selectedDriver !== 'all') {
      filtered = filtered.filter(c => c.driverName === selectedDriver);
    }

    // Filtro por rota
    if (selectedRoute !== 'all') {
      filtered = filtered.filter(c => c.routeId === selectedRoute);
    }

    setFilteredClients(filtered);
  }, [clients, searchTerm, selectedDriver, selectedRoute]);

  // Exportar para CSV
  const exportToCSV = () => {
    const headers = ['Nome', 'Telefone', 'Endereço', 'Complemento', 'Pedido', 'Rota', 'Motorista', 'Data', 'Observações'];
    const rows = filteredClients.map(c => [
      c.customerName,
      c.phone,
      c.address,
      c.complemento || '',
      c.orderNumber || '',
      c.routeCode ? `${c.routeCode} - ${c.routeName}` : c.routeName,
      c.driverName,
      format(c.plannedDate, 'dd/MM/yyyy', { locale: ptBR }),
      c.notes || '',
    ]);

    const csvContent = [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(';')),
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `lista-clientes-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800">Entregue</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Falha</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pendente</Badge>;
      default:
        return <Badge variant="outline">-</Badge>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <User className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Lista de Clientes</h1>
            <p className="text-muted-foreground">
              Visualize os dados dos clientes das rotas
            </p>
          </div>
        </div>
        <Button onClick={exportToCSV} disabled={filteredClients.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Busca */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, endereço..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Período */}
            <DatePickerWithPresets
              startDate={startDate}
              endDate={endDate}
              onDateRangeChange={handleDateRangeChange}
            />

            {/* Motorista */}
            <Select value={selectedDriver} onValueChange={setSelectedDriver}>
              <SelectTrigger>
                <SelectValue placeholder="Todos os motoristas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os motoristas</SelectItem>
                {drivers.map((driver) => (
                  <SelectItem key={driver} value={driver}>
                    {driver}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Rota */}
            <Select value={selectedRoute} onValueChange={setSelectedRoute}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as rotas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as rotas</SelectItem>
                {routes.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Estatísticas */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-blue-100 p-3">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{filteredClients.length}</p>
                <p className="text-sm text-muted-foreground">Total de Clientes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-[#25D366]/10 p-3">
                <WhatsAppIcon className="h-6 w-6 text-[#25D366]" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {filteredClients.filter(c => c.phone).length}
                </p>
                <p className="text-sm text-muted-foreground">Com WhatsApp</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-purple-100 p-3">
                <Route className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{routes.length}</p>
                <p className="text-sm text-muted-foreground">Rotas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="rounded-full bg-orange-100 p-3">
                <Package className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {filteredClients.filter(c => c.orderNumber).length}
                </p>
                <p className="text-sm text-muted-foreground">Com Pedido</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Clientes</CardTitle>
          <CardDescription>
            {filteredClients.length} cliente(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : filteredClients.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User className="mb-4 h-12 w-12 text-muted-foreground" />
              <p className="text-lg font-medium">Nenhum cliente encontrado</p>
              <p className="text-sm text-muted-foreground">
                Tente ajustar os filtros ou o período de busca
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Nome</TableHead>
                    <TableHead className="min-w-[130px]">Telefone</TableHead>
                    <TableHead className="min-w-[250px]">Endereço</TableHead>
                    <TableHead className="min-w-[100px]">Pedido</TableHead>
                    <TableHead className="min-w-[150px]">Rota</TableHead>
                    <TableHead className="min-w-[130px]">Motorista</TableHead>
                    <TableHead className="min-w-[100px]">Data</TableHead>
                    <TableHead className="min-w-[90px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{client.customerName}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.phone ? (
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => copyToClipboard(client.phone)}
                                  className="flex items-center gap-2 hover:opacity-80 transition-colors cursor-pointer group"
                                >
                                  <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                                  <span className="text-foreground">{client.phone}</span>
                                  {copiedPhone === client.phone ? (
                                    <Check className="h-3.5 w-3.5 text-green-500" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {copiedPhone === client.phone ? 'Copiado!' : 'Clique para copiar'}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-start gap-2">
                          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          <div>
                            <p className="text-sm">{client.address}</p>
                            {client.complemento && (
                              <p className="text-xs text-muted-foreground">
                                {client.complemento}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {client.orderNumber ? (
                          <div className="flex items-center gap-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span>{client.orderNumber}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {client.routeCode || client.routeName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{client.driverName}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm">
                            {format(client.plannedDate, 'dd/MM/yy', { locale: ptBR })}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(client.deliveryStatus)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
