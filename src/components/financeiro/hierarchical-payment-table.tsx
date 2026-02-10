'use client';

import * as React from 'react';

// Extend window type for debug flag
declare global {
  interface Window {
    _dateLogged?: boolean;
  }
}
import {
  ChevronRight,
  ChevronDown,
  Package,
  Route as RouteIcon,
  MapPin,
  CheckCircle,
  XCircle,
  Clock,
  MoreHorizontal,
  Eye,
  Edit,
  DollarSign
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { DriverPayment, PaymentStatus, Timestamp } from '@/lib/types';
import { formatCurrency } from '@/lib/earnings-calculator';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PaymentDetailsDialog } from './payment-details-dialog';
import { MarkAsPaidDialog } from './mark-as-paid-dialog';
import { CancelPaymentDialog } from './cancel-payment-dialog';
import { EditPaymentDialog } from './edit-payment-dialog';
import { StopDetailsDialog } from './stop-details-dialog';
import { EditStopValueDialog } from './edit-stop-value-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { approvePayment, updateStopValue } from '@/lib/payment-actions';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PaymentTableProps {
  payments: DriverPayment[];
}

interface ServiceGroup {
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  routes: RouteGroup[];
  totalEarnings: number;
  totalRoutes: number;
  serviceDate: Date; // Data de referência do serviço (data da primeira rota)
}

interface RouteGroup {
  payment: DriverPayment;
  stops?: any[];
}

const statusMap: Record<PaymentStatus, { label: string; variant: 'default' | 'secondary' | 'success' | 'destructive' }> = {
  pending: { label: 'Pendente', variant: 'secondary' },
  approved: { label: 'Aprovado', variant: 'default' },
  paid: { label: 'Pago', variant: 'success' },
  cancelled: { label: 'Cancelado', variant: 'destructive' },
};

export function HierarchicalPaymentTable({ payments }: PaymentTableProps) {
  const [expandedServices, setExpandedServices] = React.useState<Set<string>>(new Set());
  const [expandedRoutes, setExpandedRoutes] = React.useState<Set<string>>(new Set());
  const [routeStops, setRouteStops] = React.useState<Map<string, any[]>>(new Map());
  const [routeOrigins, setRouteOrigins] = React.useState<Map<string, any>>(new Map());
  const [loadingStops, setLoadingStops] = React.useState<Set<string>>(new Set());

  const [selectedPayment, setSelectedPayment] = React.useState<DriverPayment | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [payDialogOpen, setPayDialogOpen] = React.useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);

  const [selectedStop, setSelectedStop] = React.useState<any>(null);
  const [selectedStopNumber, setSelectedStopNumber] = React.useState<number>(0);
  const [stopDetailsOpen, setStopDetailsOpen] = React.useState(false);

  const [editStopValueOpen, setEditStopValueOpen] = React.useState(false);
  const [selectedStopIndex, setSelectedStopIndex] = React.useState<number>(0);
  const [selectedStopValue, setSelectedStopValue] = React.useState<number>(0);

  const { toast } = useToast();
  const { user } = useAuth();

  const [serviceData, setServiceData] = React.useState<Map<string, { code: string; name: string }>>(new Map());

  // Busca dados dos serviços das rotas
  React.useEffect(() => {
    const fetchServiceData = async () => {
      const serviceIds = new Set<string>();

      // Busca todas as rotas para pegar serviceId
      for (const payment of payments) {
        try {
          const routeDoc = await getDoc(doc(db, 'routes', payment.routeId));
          if (routeDoc.exists()) {
            const routeData = routeDoc.data();
            if (routeData.serviceId) {
              serviceIds.add(routeData.serviceId);
            }
          }
        } catch (error) {
          console.error('Erro ao buscar rota:', error);
        }
      }

      // Busca dados dos serviços
      const newServiceData = new Map<string, { code: string; name: string }>();
      for (const serviceId of serviceIds) {
        try {
          const serviceDoc = await getDoc(doc(db, 'lunnaServices', serviceId));
          if (serviceDoc.exists()) {
            const service = serviceDoc.data();
            newServiceData.set(serviceId, {
              code: service.code || 'N/A',
              name: service.companyName || 'Serviço sem nome',
            });
          }
        } catch (error) {
          console.error('Erro ao buscar serviço:', error);
        }
      }

      setServiceData(newServiceData);
    };

    if (payments.length > 0) {
      fetchServiceData();
    }
  }, [payments]);

  // Agrupa pagamentos por serviço
  const serviceGroups = React.useMemo(() => {
    const groups = new Map<string, ServiceGroup>();

    payments.forEach((payment) => {
      // Usa o código da rota para agrupar por enquanto
      // Em rotas do Lunna, o código contém o serviceCode (ex: LN-0001-R01)
      const routeCodeParts = payment.routeCode.split('-');
      const serviceCode = routeCodeParts.length > 2 ? `${routeCodeParts[0]}-${routeCodeParts[1]}` : routeCodeParts[0];
      const serviceId = serviceCode; // Usar o serviceCode como ID temporário

      // Função auxiliar para converter qualquer data para Date
      const convertToDate = (date: any): Date | null => {
        if (!date) return null;

        try {
          if (date instanceof Date) return date;
          if (typeof date === 'object' && 'toDate' in date) return date.toDate();
          if (typeof date === 'string' || typeof date === 'number') {
            const d = new Date(date);
            return isNaN(d.getTime()) ? null : d;
          }
        } catch (error) {
          console.error('Erro ao converter data:', error, date);
        }
        return null;
      };

      // Log para debug - ver quais campos de data existem
      if (!window._dateLogged) {
        console.log('🔍 DADOS DE DATA DO PRIMEIRO PAGAMENTO:', {
          routeCode: payment.routeCode,
          routePlannedDate: payment.routePlannedDate,
          routeCompletedAt: payment.routeCompletedAt,
          createdAt: payment.createdAt,
          types: {
            routePlannedDate: typeof payment.routePlannedDate,
            routeCompletedAt: typeof payment.routeCompletedAt,
            createdAt: typeof payment.createdAt
          }
        });
        window._dateLogged = true;
      }

      // Converte a data da rota para Date
      // Usa routePlannedDate (data planejada da rota) - igual à página de relatórios
      const completedDate: Date =
        convertToDate(payment.routePlannedDate) ||
        convertToDate(payment.routeCreatedAt) ||
        convertToDate(payment.routeCompletedAt) ||
        convertToDate(payment.createdAt) ||
        new Date(0);

      if (!groups.has(serviceId)) {
        groups.set(serviceId, {
          serviceId,
          serviceCode,
          serviceName: `Serviço ${serviceCode}`,
          routes: [],
          totalEarnings: 0,
          totalRoutes: 0,
          serviceDate: completedDate, // Inicializa com a data da primeira rota
        });
      }

      const group = groups.get(serviceId)!;
      group.routes.push({ payment, stops: undefined });
      group.totalEarnings += payment.totalEarnings;
      group.totalRoutes++;

      // Atualiza a data do serviço para a mais recente
      if (completedDate.getTime() > group.serviceDate.getTime()) {
        group.serviceDate = completedDate;
      }
    });

    return Array.from(groups.values()).sort((a, b) => {
      // Ordena por data decrescente (mais recente primeiro)
      return b.serviceDate.getTime() - a.serviceDate.getTime();
    });
  }, [payments, serviceData]);

  const toggleService = (serviceId: string) => {
    setExpandedServices((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) {
        next.delete(serviceId);
      } else {
        next.add(serviceId);
      }
      return next;
    });
  };

  const toggleRoute = async (routeId: string) => {
    const isExpanded = expandedRoutes.has(routeId);

    setExpandedRoutes((prev) => {
      const next = new Set(prev);
      if (next.has(routeId)) {
        next.delete(routeId);
      } else {
        next.add(routeId);
      }
      return next;
    });

    // Se está expandindo e ainda não carregou os stops, busca
    if (!isExpanded && !routeStops.has(routeId)) {
      setLoadingStops((prev) => new Set(prev).add(routeId));

      try {
        const routeDoc = await getDoc(doc(db, 'routes', routeId));
        if (routeDoc.exists()) {
          const routeData = routeDoc.data();
          setRouteStops((prev) => new Map(prev).set(routeId, routeData.stops || []));
          setRouteOrigins((prev) => new Map(prev).set(routeId, routeData.origin || routeData.stops[0]));
        }
      } catch (error) {
        console.error('Erro ao carregar stops:', error);
      } finally {
        setLoadingStops((prev) => {
          const next = new Set(prev);
          next.delete(routeId);
          return next;
        });
      }
    }
  };

  const formatDate = (date: Date | Timestamp | null | undefined) => {
    try {
      if (!date) {
        return 'Data não disponível';
      }

      let d: Date;
      if (date instanceof Date) {
        d = date;
      } else if (typeof date === 'object' && 'toDate' in date) {
        d = date.toDate();
      } else if (typeof date === 'string' || typeof date === 'number') {
        d = new Date(date);
      } else {
        return 'Data inválida';
      }

      // Valida se a data é válida
      if (isNaN(d.getTime())) {
        return 'Data inválida';
      }

      return d.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch (error) {
      console.error('Erro ao formatar data:', error, date);
      return 'Data inválida';
    }
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const getStopStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStopStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="success" className="text-xs">Entregue</Badge>;
      case 'failed':
        return <Badge variant="destructive" className="text-xs">Falhou</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">Pendente</Badge>;
    }
  };

  const handleApprove = async (payment: DriverPayment) => {
    if (!user) return;

    try {
      await approvePayment(payment.id, user.uid);
      toast({
        title: 'Pagamento Aprovado',
        description: `Pagamento ${payment.routeCode} foi aprovado com sucesso.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível aprovar o pagamento.',
      });
    }
  };

  const openDetails = (payment: DriverPayment) => {
    setSelectedPayment(payment);
    setDetailsOpen(true);
  };

  const openPayDialog = (payment: DriverPayment) => {
    setSelectedPayment(payment);
    setPayDialogOpen(true);
  };

  const openCancelDialog = (payment: DriverPayment) => {
    setSelectedPayment(payment);
    setCancelDialogOpen(true);
  };

  const openEditDialog = (payment: DriverPayment) => {
    setSelectedPayment(payment);
    setEditDialogOpen(true);
  };

  const openStopDetails = (stop: any, stopNumber: number) => {
    setSelectedStop(stop);
    setSelectedStopNumber(stopNumber);
    setStopDetailsOpen(true);
  };

  const openEditStopValue = (payment: DriverPayment, stop: any, stopIndex: number, currentValue: number) => {
    setSelectedPayment(payment);
    setSelectedStop(stop);
    setSelectedStopIndex(stopIndex);
    setSelectedStopNumber(stopIndex + 1);
    setSelectedStopValue(currentValue);
    setEditStopValueOpen(true);
  };

  const handleSaveStopValue = async (newValue: number, reason: string) => {
    if (!selectedPayment || !user) return;

    try {
      await updateStopValue(
        selectedPayment.id,
        selectedPayment.routeId,
        selectedStopIndex,
        newValue,
        user.uid,
        reason
      );

      toast({
        title: 'Valor Atualizado',
        description: `O valor da Parada ${selectedStopNumber} foi atualizado com sucesso.`,
      });

      // Força recarregamento dos stops da rota
      setRouteStops((prev) => {
        const next = new Map(prev);
        next.delete(selectedPayment.routeId);
        return next;
      });
      setRouteOrigins((prev) => {
        const next = new Map(prev);
        next.delete(selectedPayment.routeId);
        return next;
      });

      // Recarrega os stops
      if (expandedRoutes.has(selectedPayment.routeId)) {
        setTimeout(async () => {
          try {
            const routeDoc = await getDoc(doc(db, 'routes', selectedPayment.routeId));
            if (routeDoc.exists()) {
              const routeData = routeDoc.data();
              setRouteStops((prev) => new Map(prev).set(selectedPayment.routeId, routeData.stops || []));
              setRouteOrigins((prev) => new Map(prev).set(selectedPayment.routeId, routeData.origin || routeData.stops[0]));
            }
          } catch (error) {
            console.error('Erro ao recarregar stops:', error);
          }
        }, 500);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível atualizar o valor.',
      });
      throw error; // Re-throw para o diálogo não fechar
    }
  };

  /**
   * Calcula a distância entre dois pontos em km usando a fórmula de Haversine
   */
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  /**
   * Determina o valor de uma parada baseado na cidade e distância da origem
   */
  const calculateStopPriceFromLocation = (stop: any, origin?: any): number => {
    const city = (stop.cidade || stop.city || '').toLowerCase().trim();
    const neighborhood = (stop.bairro || stop.neighborhood || '').toLowerCase().trim();

    // Cidades de R$ 20
    const citiesR20 = ['senador canedo', 'canedo', 'trindade', 'goianira'];
    if (citiesR20.some((c: string) => city.includes(c) || neighborhood.includes(c))) {
      return 20;
    }

    // Goiânia e Aparecida de Goiânia - depende da distância da origem
    const citiesGoianiaArea = ['goiânia', 'goiania', 'aparecida', 'aparecida de goiania', 'aparecida de goiânia'];
    const isGoianiaArea = citiesGoianiaArea.some((c: string) => city.includes(c) || neighborhood.includes(c));

    if (isGoianiaArea && origin && origin.lat && origin.lng && stop.lat && stop.lng) {
      const distance = calculateDistance(origin.lat, origin.lng, stop.lat, stop.lng);
      // Até 7km = R$ 5, acima de 7km = R$ 10
      return distance <= 7 ? 5 : 10;
    }

    // Padrão para Goiânia/Aparecida se não conseguir calcular distância
    if (isGoianiaArea) {
      return 5;
    }

    // Padrão para cidades não mapeadas
    return 10;
  };

  // Calcula o valor pago por ponto
  const calculateStopValue = (payment: DriverPayment, stop: any, stopIndex?: number, origin?: any) => {
    // Se houver valor customizado para esta parada, usa ele
    if (stopIndex !== undefined && (payment as any).customStopValues?.[stopIndex]) {
      return (payment as any).customStopValues[stopIndex].value;
    }

    // Calcula valor baseado na localização
    const stopPrice = calculateStopPriceFromLocation(stop, origin);

    // Se a entrega foi completada, retorna o valor cheio
    if (stop.deliveryStatus === 'completed') {
      return stopPrice;
    }

    // Se falhou mas foi ao local, retorna 20% do valor
    if (stop.deliveryStatus === 'failed' && stop.wentToLocation) {
      return stopPrice * 0.2;
    }

    // Paradas não completadas não geram pagamento
    return 0;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12"></TableHead>
            <TableHead>Identificação</TableHead>
            <TableHead>Motorista</TableHead>
            <TableHead>Data</TableHead>
            <TableHead>Estatísticas</TableHead>
            <TableHead>Ganhos</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {serviceGroups.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                Nenhum pagamento encontrado
              </TableCell>
            </TableRow>
          ) : (
            serviceGroups.map((service) => (
              <React.Fragment key={service.serviceId}>
                {/* Linha do Serviço */}
                <TableRow className="bg-muted/50 hover:bg-muted">
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleService(service.serviceId)}
                      className="h-8 w-8 p-0"
                    >
                      {expandedServices.has(service.serviceId) ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <Package className="h-4 w-4 text-primary" />
                      {service.serviceName}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {service.totalRoutes} {service.totalRoutes === 1 ? 'rota' : 'rotas'}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(service.serviceDate)}
                    </div>
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell>
                    <span className="font-semibold text-primary">
                      {formatCurrency(service.totalEarnings)}
                    </span>
                  </TableCell>
                  <TableCell></TableCell>
                  <TableCell></TableCell>
                </TableRow>

                {/* Rotas do Serviço */}
                {expandedServices.has(service.serviceId) &&
                  service.routes.map((route) => (
                    <React.Fragment key={route.payment.id}>
                      {/* Linha da Rota */}
                      <TableRow className="bg-background">
                        <TableCell className="pl-12">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRoute(route.payment.routeId)}
                            className="h-8 w-8 p-0"
                          >
                            {expandedRoutes.has(route.payment.routeId) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <RouteIcon className="h-4 w-4 text-muted-foreground" />
                            <Badge variant="outline" className="font-mono">
                              {route.payment.routeCode}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs">
                                {getInitials(route.payment.driverName)}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-sm">{route.payment.driverName}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDate(
                            route.payment.routePlannedDate ||
                            route.payment.routeCompletedAt ||
                            route.payment.createdAt
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground">
                            {route.payment.routeStats.totalStops} paradas •{' '}
                            {route.payment.routeStats.successfulDeliveries} entregas •{' '}
                            {route.payment.routeStats.distanceKm.toFixed(1)} km
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-medium">
                            {formatCurrency(route.payment.totalEarnings)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={statusMap[route.payment.status].variant}>
                              {statusMap[route.payment.status].label}
                            </Badge>
                            {route.payment.manuallyEdited && (
                              <Badge variant="outline" className="text-xs">
                                <Edit className="h-3 w-3 mr-1" />
                                Manual
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openDetails(route.payment)}>
                                <Eye className="mr-2 h-4 w-4" />
                                Ver Detalhes
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openEditDialog(route.payment)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar Valor
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              {route.payment.status === 'pending' && (
                                <DropdownMenuItem onClick={() => handleApprove(route.payment)}>
                                  <CheckCircle className="mr-2 h-4 w-4" />
                                  Aprovar
                                </DropdownMenuItem>
                              )}
                              {(route.payment.status === 'pending' || route.payment.status === 'approved') && (
                                <DropdownMenuItem onClick={() => openPayDialog(route.payment)}>
                                  <DollarSign className="mr-2 h-4 w-4" />
                                  Marcar como Pago
                                </DropdownMenuItem>
                              )}
                              {route.payment.status !== 'paid' && route.payment.status !== 'cancelled' && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openCancelDialog(route.payment)}
                                    className="text-destructive"
                                  >
                                    <XCircle className="mr-2 h-4 w-4" />
                                    Cancelar
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>

                      {/* Pontos de Entrega da Rota */}
                      {expandedRoutes.has(route.payment.routeId) && (
                        <>
                          {loadingStops.has(route.payment.routeId) ? (
                            <TableRow>
                              <TableCell colSpan={8} className="pl-24">
                                <div className="space-y-2">
                                  <Skeleton className="h-8 w-full" />
                                  <Skeleton className="h-8 w-full" />
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (routeStops.get(route.payment.routeId) || []).map((stop, idx) => {
                              const origin = routeOrigins.get(route.payment.routeId);
                              const stopValue = calculateStopValue(route.payment, stop, idx, origin);
                              const hasCustomValue = !!(route.payment as any).customStopValues?.[idx];
                              return (
                                <TableRow key={`${route.payment.routeId}-stop-${idx}`} className="bg-muted/20 hover:bg-muted/30">
                                  <TableCell className="pl-24">
                                    {getStopStatusIcon(stop.deliveryStatus)}
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2 text-sm">
                                      <MapPin className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-xs text-muted-foreground">
                                        Parada {idx + 1}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-xs text-muted-foreground line-clamp-1">
                                      {stop.address?.formattedAddress || 'Endereço não disponível'}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="text-xs text-muted-foreground">
                                      {stop.customerName || 'Cliente não especificado'}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <div className="text-xs font-medium text-primary cursor-help">
                                              {formatCurrency(stopValue)}
                                            </div>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p className="text-xs">
                                              {hasCustomValue ? 'Valor customizado' : 'Valor pago nesta parada'}
                                            </p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                      {route.payment.status !== 'paid' && route.payment.status !== 'cancelled' && (
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0"
                                          onClick={() => openEditStopValue(route.payment, stop, idx, stopValue)}
                                        >
                                          <Edit className="h-3 w-3 text-muted-foreground hover:text-primary" />
                                        </Button>
                                      )}
                                      {hasCustomValue && (
                                        <Badge variant="outline" className="text-xs">
                                          Editado
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <div className="flex items-center gap-2">
                                      {getStopStatusBadge(stop.deliveryStatus)}
                                      {stop.wentToLocation && stop.deliveryStatus === 'failed' && (
                                        <Badge variant="outline" className="text-xs">
                                          Tentativa
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => openStopDetails(stop, idx + 1)}
                                    >
                                      <Eye className="h-3 w-3" />
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </>
                      )}
                    </React.Fragment>
                  ))}
              </React.Fragment>
            ))
          )}
        </TableBody>
      </Table>

      {/* Dialogs */}
      {selectedPayment && (
        <>
          <PaymentDetailsDialog
            payment={selectedPayment}
            open={detailsOpen}
            onOpenChange={setDetailsOpen}
          />
          <MarkAsPaidDialog
            payment={selectedPayment}
            open={payDialogOpen}
            onOpenChange={setPayDialogOpen}
          />
          <CancelPaymentDialog
            payment={selectedPayment}
            open={cancelDialogOpen}
            onOpenChange={setCancelDialogOpen}
          />
          <EditPaymentDialog
            payment={selectedPayment}
            open={editDialogOpen}
            onOpenChange={setEditDialogOpen}
          />
        </>
      )}

      {/* Dialog de detalhes da parada */}
      {selectedStop && (
        <>
          <StopDetailsDialog
            stop={selectedStop}
            stopNumber={selectedStopNumber}
            open={stopDetailsOpen}
            onOpenChange={setStopDetailsOpen}
          />
          <EditStopValueDialog
            open={editStopValueOpen}
            onOpenChange={setEditStopValueOpen}
            stop={selectedStop}
            stopNumber={selectedStopNumber}
            currentValue={selectedStopValue}
            onSave={handleSaveStopValue}
          />
        </>
      )}
    </div>
  );
}
