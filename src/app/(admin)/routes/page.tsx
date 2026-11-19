
'use client';

import * as React from 'react';
import Link from 'next/link';
import { Route as RouteIcon, Truck, MapPin, Milestone, Clock, User, Loader2, UserCog, MoreVertical, Trash2, Pencil, Copy, ChevronDown, AlertCircle, CheckCircle, Check, FileEdit, Sun, Sunset, Moon } from 'lucide-react';
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useStaff } from '@/components/staff/staff-session';
import { useStaffQuery } from '@/components/staff/use-staff-query';
import { staffRouteDates } from '@/lib/staff/route-dates';
import { EarningsRequestError } from '@/lib/earnings/session-request';
import type { StaffRouteCommand } from '@/lib/staff/route-contract';
import type { RouteInfo, Driver, LunnaService } from '@/lib/types';
import { ServiceCard } from '@/components/routes/service-card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useRouter } from 'next/navigation';
import { useRouteSearch } from './layout';
import { LunnaBadge } from '@/components/routes/lunna-badge';
import { Pagination } from '@/components/ui/pagination';


// Extend RouteInfo to include fields from Firestore doc
type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  status: 'draft' | 'dispatched' | 'in_progress' | 'completed' | 'completed_auto';
  driverId: string;
  driverInfo: {
    name: string;
    vehicle: { type: string; plate: string };
  } | null;
  plannedDate: Date;
  revision: string;
  origin: any; // Can be complex object
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(2);
const formatDuration = (durationString: string = '0s') => {
  const seconds = parseInt(durationString.replace('s', ''), 10);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const getRoutePeriod = (date: Date): { label: string; color: string; icon: React.ElementType; bgLight: string } => {
  const hour = date.getHours();

  if (hour >= 8 && hour < 12) {
    return { label: 'Matutino', color: 'bg-blue-500', icon: Sun, bgLight: 'bg-blue-50 dark:bg-blue-950/30' };
  } else if (hour >= 12 && hour < 19) {
    return { label: 'Vespertino', color: 'bg-orange-500', icon: Sunset, bgLight: 'bg-orange-50 dark:bg-orange-950/30' };
  } else {
    return { label: 'Noturno', color: 'bg-purple-500', icon: Moon, bgLight: 'bg-purple-50 dark:bg-purple-950/30' };
  }
};


// Type for Luna Service with its routes
type ServiceWithRoutes = {
  service: LunnaService & { id: string;revision:string };
  routes: RouteDocument[];
};

export default function RoutesPage() {
  const router = useRouter();
  const { searchQuery } = useRouteSearch();
  const { request,role:userRole }=useStaff();
  const readBoard=React.useCallback(async (signal:AbortSignal)=>{
    const endpoint='/api/staff/routes';
    const options=request<{services:ServiceWithRoutes['service'][];drivers:Driver[]}>(endpoint+'?view=options',{signal});
    const pages=request<{routes:RouteDocument[];pendingNotifications:string[];cursor:string|null}>(endpoint,{signal});
    const [directory,first]=await Promise.all([options,pages]);
    const routes=new Map(first.routes.map(route=>[route.id,route]));
    const pending=new Set(first.pendingNotifications);
    let cursor=first.cursor;
    while (cursor) {
      const page=await request<typeof first>(endpoint+'?cursor='+encodeURIComponent(cursor),{signal});
      for (const route of page.routes) routes.set(route.id,route);
      for (const routeId of page.pendingNotifications) pending.add(routeId);
      cursor=page.cursor;
    }
    const current=staffRouteDates<RouteDocument[]>([...routes.values()]).sort((a,b)=>b.plannedDate.valueOf()-a.plannedDate.valueOf());
    return {
      routes:current,
      services:staffRouteDates<ServiceWithRoutes['service'][]>(directory.services).flatMap(service=>{
        const related=current.filter(route=>route.serviceId===service.id);
        return related.length || service.status==='organizing' ? [{service,routes:related}]:[];
      }),
      drivers:directory.drivers.map(driver=>({
        ...staffRouteDates<Driver>(driver),status:driver.status ?? 'offline',phone:driver.phone ?? 'N/A',
        totalDeliveries:driver.totalDeliveries ?? 0,rating:driver.rating ?? 0,lastSeenAt:driver.lastSeenAt ?
          new Date(driver.lastSeenAt.valueOf()) : new Date(0),
        avatarUrl:(driver as Driver & {photoURL?:string}).photoURL ?? '',
      })),
      pending,
    };
  },[request]);
  const {data,error:boardError,loading:isLoading,refresh}=useStaffQuery(readBoard);
  const routes=React.useMemo(()=>data?.routes ?? [],[data]);
  const services=React.useMemo(()=>data?.services ?? [],[data]);
  const availableDrivers=data?.drivers ?? [];
  const pendingNotifications=data?.pending ?? new Set<string>();
  const retryCommand=React.useRef<{fingerprint:string;id:string}>();
  async function write(path:string,revision:string,command:{kind:StaffRouteCommand['kind']|'force-complete';name?:string;driverId?:string}) {
    const fingerprint=JSON.stringify({path,revision,command});
    const commandId=retryCommand.current?.fingerprint===fingerprint ? retryCommand.current.id:crypto.randomUUID();
    retryCommand.current={fingerprint,id:commandId};
    try {
      await request(path,{method:'PATCH',body:JSON.stringify({...command,revision,commandId})});
      retryCommand.current=undefined;
      refresh();
    } catch(error) {
      if (error instanceof EarningsRequestError && error.status<500) {
        retryCommand.current=undefined;
        if (error.status===409) refresh();
      }
      throw error;
    }
  }
  const routeEndpoint=(id:string)=>'/api/staff/routes/'+encodeURIComponent(id);
  const [isChangeDriverDialogOpen, setIsChangeDriverDialogOpen] = React.useState(false);
  const [isEditNameDialogOpen, setIsEditNameDialogOpen] = React.useState(false);
  const [isCompleteRouteDialogOpen, setIsCompleteRouteDialogOpen] = React.useState(false);
  const [routeToModify, setRouteToModify] = React.useState<RouteDocument | null>(null);
  const [newDriverId, setNewDriverId] = React.useState<string>('');
  const [newRouteName, setNewRouteName] = React.useState<string>('');
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isDuplicating, setIsDuplicating] = React.useState(false);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [openDropdownId, setOpenDropdownId] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const [itemsPerPage, setItemsPerPage] = React.useState(10);
  const [isForceCompleteServiceDialogOpen, setIsForceCompleteServiceDialogOpen] = React.useState(false);
  const [serviceToForceComplete, setServiceToForceComplete] = React.useState<ServiceWithRoutes | null>(null);
  const [isCompletingService, setIsCompletingService] = React.useState(false);
  const { toast } = useToast();

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleOpenChangeDriver = (route: RouteDocument) => {
    setOpenDropdownId(null); // Close dropdown first
    setRouteToModify(route);
    setNewDriverId(route.driverId || '');
    setTimeout(() => setIsChangeDriverDialogOpen(true), 100); // Small delay to ensure dropdown closes
  };

  const handleOpenDeleteDialog = (route: RouteDocument) => {
    setOpenDropdownId(null); // Close dropdown first
    setRouteToModify(route);
    setTimeout(() => setIsDeleteDialogOpen(true), 100); // Small delay to ensure dropdown closes
  };

  const handleOpenEditNameDialog = (route: RouteDocument) => {
    setOpenDropdownId(null); // Close dropdown first
    setRouteToModify(route);
    setNewRouteName(route.name);
    setTimeout(() => setIsEditNameDialogOpen(true), 100); // Small delay to ensure dropdown closes
  };

  const handleOpenCompleteRouteDialog = (route: RouteDocument) => {
    setOpenDropdownId(null); // Close dropdown first
    setRouteToModify(route);
    setTimeout(() => setIsCompleteRouteDialogOpen(true), 100); // Small delay to ensure dropdown closes
  };


  const handleChangeDriver = async () => {
    if (!routeToModify || !newDriverId) {
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
      await write(routeEndpoint(routeToModify.id),routeToModify.revision,{kind:'assign',driverId:newDriverId});

      toast({
        title: 'Motorista Alterado!',
        description: `A rota "${routeToModify.name}" foi atribuída a ${driver?.name}.`,
      });

      setIsChangeDriverDialogOpen(false);
      setRouteToModify(null);
      setNewDriverId('');
    } catch (error: any) {
      console.error('❌ [ChangeDriver] Error updating driver:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Alterar Motorista',
        description: error.message || 'Não foi possível atualizar o motorista da rota.',
      });
    } finally {
      setIsUpdating(false);
    }
  };
  
  const handleDeleteRoute = async () => {
    if (!routeToModify) return;
    setIsDeleting(true);

    try {
        await write(routeEndpoint(routeToModify.id),routeToModify.revision,{kind:'delete'});

        toast({
            title: 'Rota Removida!',
            description: `A rota "${routeToModify.name}" foi removida com sucesso.`,
        });

        setIsDeleteDialogOpen(false);
        setRouteToModify(null);
    } catch (error: any) {
        console.error('Error deleting route:', error);
        toast({
            variant: 'destructive',
            title: 'Erro ao Remover Rota',
            description: error.message || 'Não foi possível remover a rota.',
        });
    } finally {
        setIsDeleting(false);
    }
  };

  const handleUpdateRouteName = async () => {
    if (!routeToModify || !newRouteName?.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome inválido',
        description: 'Por favor, insira um nome para a rota.',
      });
      return;
    }

    setIsUpdating(true);

    try {
      await write(routeEndpoint(routeToModify.id),routeToModify.revision,{kind:'rename',name:newRouteName.trim()});

      toast({
        title: 'Nome da Rota Atualizado!',
        description: `O nome da rota foi alterado para "${newRouteName.trim()}".`,
      });

      setIsEditNameDialogOpen(false);
      setRouteToModify(null);
      setNewRouteName('');
    } catch (error: any) {
      console.error('Error updating route name:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Atualizar Nome',
        description: error.message || 'Não foi possível alterar o nome da rota.',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCompleteRoute = async () => {
    if (!routeToModify) return;
    setIsCompleting(true);

    try {
      await write(routeEndpoint(routeToModify.id),routeToModify.revision,{kind:'complete'});

      toast({
        title: 'Rota Concluída!',
        description: `A rota "${routeToModify.name}" foi marcada como concluída.`,
      });

      setIsCompleteRouteDialogOpen(false);
      setRouteToModify(null);
    } catch (error: any) {
      console.error('Error completing route:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Concluir Rota',
        description: error.message || 'Não foi possível marcar a rota como concluída.',
      });
    } finally {
      setIsCompleting(false);
    }
  };

  const handleOpenForceCompleteServiceDialog = (serviceId: string) => {
    const service = services.find(s => s.service.id === serviceId);
    if (service) {
      setServiceToForceComplete(service);
      setIsForceCompleteServiceDialogOpen(true);
    }
  };

  const handleForceCompleteService = async () => {
    if (!serviceToForceComplete) return;
    setIsCompletingService(true);

    try {
      const target=serviceToForceComplete.service;
      await write('/api/staff/services/'+encodeURIComponent(target.id),target.revision,{kind:'force-complete'});

      toast({
        title: 'Serviço Concluído!',
        description: `O serviço "${serviceToForceComplete.service.code}" foi arquivado com sucesso.`,
      });

      setIsForceCompleteServiceDialogOpen(false);
      setServiceToForceComplete(null);
    } catch (error: any) {
      const errorMessage=error instanceof EarningsRequestError && error.status===403 ?
        'Você não tem permissão para executar esta ação.' : 'Não foi possível forçar a conclusão do serviço.';

      toast({
        variant: 'destructive',
        title: 'Erro ao Concluir Serviço',
        description: errorMessage,
      });
    } finally {
      setIsCompletingService(false);
    }
  };

  const handleDuplicateRoute = async (route: RouteDocument) => {
    setIsDuplicating(true);
    try {
      await write(routeEndpoint(route.id),route.revision,{kind:'duplicate'});

      toast({
        title: 'Rota Duplicada!',
        description: `Uma cópia da rota "${route.name}" foi criada com sucesso.`,
      });
    } catch (error: any) {
      console.error('Error duplicating route:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao Duplicar',
        description: error.message || 'Não foi possível duplicar a rota.',
      });
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleEditRoute = (route: RouteDocument) => {
    const routeDate = route.plannedDate;
    const period = getRoutePeriod(routeDate).label; // Matutino, Vespertino ou Noturno
    const routeData = {
      origin: route.origin,
      stops: route.stops,
      routeDate: routeDate.toISOString(),
      routeTime: format(routeDate, 'HH:mm'),
      isExistingRoute: true, // Flag para indicar que é uma rota já organizada
      currentRouteId: route.id, // ID da rota atual para filtrar das adicionais
      period, // Período da rota para filtrar na página de acompanhamento
      routeName: route.name, // Nome da rota para exibir na página de acompanhamento
      existingRouteData: {
        distanceMeters: route.distanceMeters,
        duration: route.duration,
        encodedPolyline: route.encodedPolyline,
        color: route.color,
      }
    };
    // Não precisa mais do sessionStorage - usar URL diretamente
    // sessionStorage.setItem('newRouteData', JSON.stringify(routeData));
    router.push(`/routes/${route.id}/acompanhar`); // Redirecionar para página de acompanhamento com routeId na URL
  }

  const handleEditDraft = (route: RouteDocument) => {
    // Simplificado: apenas salvar o ID do rascunho
    // Os dados completos serão carregados do Firestore na página de organização
    // Isso garante consistência entre diferentes computadores
    const routeData = {
      isDraft: true,
      draftRouteId: route.id,
    };
    sessionStorage.setItem('newRouteData', JSON.stringify(routeData));
    router.push('/routes/organize');
  };
  
  // Filter routes based on search query
  // Rotas que pertencem a serviços (serão exibidas dentro do ServiceCard)
  const serviceRouteIds = React.useMemo(() => {
    return new Set(routes.filter(r => r.serviceId).map(r => r.id));
  }, [routes]);

  // Rotas independentes (não pertencem a serviços) - rotas legadas do Luna e rotas normais
  const independentRoutes = React.useMemo(() => {
    return routes.filter(r => !r.serviceId);
  }, [routes]);

  const filteredRoutes = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return independentRoutes;
    }

    const normalizedQuery = searchQuery.toLowerCase().trim();

    return independentRoutes.filter((route) => {
      // Search in route name
      if (route.name?.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      // Search in driver name
      if (route.driverInfo?.name?.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      // Search in driver vehicle plate
      if (route.driverInfo?.vehicle?.plate?.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      // Search in stops (customer name, address, phone, order number, notes)
      if (route.stops?.some((stop) => {
        return (
          stop.customerName?.toLowerCase().includes(normalizedQuery) ||
          stop.address?.toLowerCase().includes(normalizedQuery) ||
          stop.phone?.toLowerCase().includes(normalizedQuery) ||
          stop.orderNumber?.toLowerCase().includes(normalizedQuery) ||
          stop.notes?.toLowerCase().includes(normalizedQuery) ||
          stop.complemento?.toLowerCase().includes(normalizedQuery)
        );
      })) {
        return true;
      }

      return false;
    });
  }, [independentRoutes, searchQuery]);

  // Filtrar serviços pela busca
  const filteredServices = React.useMemo(() => {
    if (!searchQuery.trim()) {
      return services;
    }

    const normalizedQuery = searchQuery.toLowerCase().trim();

    return services.filter((s) => {
      // Buscar no código do serviço
      if (s.service.code?.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      // Buscar nos stops do serviço
      if (s.service.allStops?.some((stop) => {
        return (
          stop.customerName?.toLowerCase().includes(normalizedQuery) ||
          stop.address?.toLowerCase().includes(normalizedQuery) ||
          stop.phone?.toLowerCase().includes(normalizedQuery) ||
          stop.orderNumber?.toLowerCase().includes(normalizedQuery)
        );
      })) {
        return true;
      }

      return false;
    });
  }, [services, searchQuery]);

  const groupedRoutes = React.useMemo(() => {
    return filteredRoutes.reduce((acc, route) => {
      const dateKey = format(route.plannedDate, 'yyyy-MM-dd');
      if (!acc[dateKey]) {
        acc[dateKey] = [];
      }
      acc[dateKey].push(route);
      return acc;
    }, {} as Record<string, RouteDocument[]>);
  }, [filteredRoutes]);

  const paginatedServices = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredServices.slice(startIndex, endIndex);
  }, [filteredServices, currentPage, itemsPerPage]);


  if (!data && boardError) return <div className="space-y-3 p-6">
    <p role="alert">Não foi possível carregar as rotas.</p>
    <Button variant="outline" onClick={refresh}>Tentar novamente</Button>
  </div>;

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

  if (searchQuery && filteredRoutes.length === 0 && filteredServices.length === 0) {
      return (
        <Card className="min-h-[400px] flex items-center justify-center border-dashed">
            <CardContent className="text-center pt-6">
                <RouteIcon className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Nenhum resultado encontrado</h3>
            <p className="mt-2 text-sm text-muted-foreground">
                Não encontramos rotas que correspondam à busca &quot;{searchQuery}&quot;.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
                Tente buscar por nome da rota, motorista, cliente, endereço ou placa.
            </p>
            </CardContent>
        </Card>
      );
  }

  // Função para navegar para organização de serviço
  const handleOrganizeService = (serviceId: string) => {
    router.push(`/routes/service/${serviceId}/organize`);
  };

  // Função para expandir rota (de dentro do ServiceCard)
  const handleExpandRoute = (routeId: string) => {
    const route = routes.find(r => r.id === routeId);
    if (route) {
      // Preparar sessionStorage como handleEditRoute faz
      const routeDate = route.plannedDate || new Date();
      const period = getRoutePeriod(routeDate).label;
      const routeData = {
        origin: route.origin,
        stops: route.stops || [],
        routeDate: routeDate.toISOString(),
        routeTime: format(routeDate, 'HH:mm'),
        isExistingRoute: true,
        currentRouteId: route.id,
        period,
        routeName: route.name,
        existingRouteData: {
          distanceMeters: route.distanceMeters,
          duration: route.duration,
          encodedPolyline: route.encodedPolyline,
          color: route.color,
        },
      };
      // Não precisa mais do sessionStorage - usar URL diretamente
      // sessionStorage.setItem('newRouteData', JSON.stringify(routeData));
    }
    router.push(`/routes/${routeId}/acompanhar`); // Usar routeId na URL
  };

  return (
    <>
      <div className="space-y-4">
        {/* Seção de Serviços Luna */}
        {filteredServices.length > 0 && (
          <div className="space-y-4 mb-6">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <LunnaBadge />
              Serviços Luna ({paginatedServices.length} de {filteredServices.length})
            </h2>
            <div className="space-y-4">
              {paginatedServices.map((s) => (
                <ServiceCard
                  key={s.service.id}
                  service={s.service}
                  routes={s.routes.map(r => ({
                    id: r.id,
                    data: r,
                    driverInfo: r.driverInfo || undefined,
                  }))}
                  onOrganize={handleOrganizeService}
                  onExpandRoute={handleExpandRoute}
                  onDuplicateRoute={(routeId) => {
                    const route = routes.find(r => r.id === routeId);
                    if (route) handleDuplicateRoute(route);
                  }}
                  onEditRouteName={(routeId) => {
                    const route = routes.find(r => r.id === routeId);
                    if (route) handleOpenEditNameDialog(route);
                  }}
                  onChangeDriver={(routeId) => {
                    const route = routes.find(r => r.id === routeId);
                    if (route) handleOpenChangeDriver(route);
                  }}
                  onCompleteRoute={(routeId) => {
                    const route = routes.find(r => r.id === routeId);
                    if (route) handleOpenCompleteRouteDialog(route);
                  }}
                  onDeleteRoute={(routeId) => {
                    const route = routes.find(r => r.id === routeId);
                    if (route) handleOpenDeleteDialog(route);
                  }}
                  onForceCompleteService={handleOpenForceCompleteServiceDialog}
                  isDuplicating={isDuplicating}
                  isCompletingService={isCompletingService}
                  userRole={userRole}
                />
              ))}
            </div>

            {/* Paginação de Serviços */}
            {filteredServices.length > itemsPerPage && (
              <Pagination
                currentPage={currentPage}
                totalPages={Math.ceil(filteredServices.length / itemsPerPage)}
                onPageChange={setCurrentPage}
                itemsPerPage={itemsPerPage}
                onItemsPerPageChange={setItemsPerPage}
                totalItems={filteredServices.length}
                showItemsPerPage={true}
              />
            )}
          </div>
        )}
        <Accordion type="single" collapsible className="w-full space-y-4">
          {Object.entries(groupedRoutes).map(([date, dailyRoutes]) => {
            const totalDistance = dailyRoutes.reduce((sum, route) => sum + (route.distanceMeters || 0), 0);

            return (
              <AccordionItem value={date} key={date} className="border-none">
                <Card className="shadow-sm">
                  <AccordionTrigger className="p-4 hover:no-underline [&[data-state=open]>svg]:text-primary">
                    <div className="flex w-full items-center justify-between">
                      <div className="text-left">
                        <p className="font-semibold text-lg">{format(dailyRoutes[0].plannedDate, "dd 'de' MMMM, yyyy", { locale: ptBR })}</p>
                        <p className="text-sm text-muted-foreground">
                          {dailyRoutes.length} rota{dailyRoutes.length > 1 ? 's' : ''} planejada{dailyRoutes.length > 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-muted-foreground text-xs">Rotas</p>
                          <p className="font-bold text-lg">{dailyRoutes.length}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Distância (km)</p>
                          <p className="font-bold text-lg">{formatDistance(totalDistance)}</p>
                        </div>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="p-4 pt-0">
                      {(() => {
                        // Agrupar rotas por período
                        const routesByPeriod = dailyRoutes.reduce((acc, route) => {
                          const period = route.status === 'draft' ? 'Rascunho' : getRoutePeriod(route.plannedDate).label;
                          if (!acc[period]) acc[period] = [];
                          acc[period].push(route);
                          return acc;
                        }, {} as Record<string, RouteDocument[]>);

                        // Ordem dos períodos
                        const periodOrder = ['Matutino', 'Vespertino', 'Noturno', 'Rascunho'];
                        const sortedPeriods = Object.keys(routesByPeriod).sort(
                          (a, b) => periodOrder.indexOf(a) - periodOrder.indexOf(b)
                        );

                        return (
                          <div className="pt-4 border-t space-y-6">
                            {sortedPeriods.map((period) => {
                              const periodRoutes = routesByPeriod[period];
                              const periodInfo = period === 'Rascunho'
                                ? { icon: FileEdit, color: 'bg-yellow-500', bgLight: 'bg-yellow-50 dark:bg-yellow-950/30' }
                                : getRoutePeriod(periodRoutes[0].plannedDate);
                              const PeriodIcon = periodInfo.icon;

                              return (
                                <div key={period}>
                                  {/* Cabeçalho do período */}
                                  <div className={`flex items-center gap-3 mb-4 p-3 rounded-lg ${periodInfo.bgLight}`}>
                                    <div className={`p-2 rounded-full ${periodInfo.color}`}>
                                      <PeriodIcon className="h-4 w-4 text-white" />
                                    </div>
                                    <div>
                                      <h3 className="font-semibold">{period}</h3>
                                      <p className="text-sm text-muted-foreground">
                                        {periodRoutes.length} rota{periodRoutes.length > 1 ? 's' : ''}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Grid de rotas do período */}
                                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                    {periodRoutes.map((route) => (
                                      <Card key={route.id} className="flex flex-col">
                                        <CardHeader>
                                          <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                  <CardTitle>{route.name}</CardTitle>
                                                  {route.status === 'draft' ? (
                                                    <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">
                                                      <FileEdit className="mr-1 h-3 w-3" />
                                                      Rascunho
                                                    </Badge>
                                                  ) : (
                                                    <Badge className={`${getRoutePeriod(route.plannedDate).color} text-white hover:${getRoutePeriod(route.plannedDate).color}`}>
                                                      {getRoutePeriod(route.plannedDate).label}
                                                    </Badge>
                                                  )}
                                                  {pendingNotifications.has(route.id) && (
                                                    <Badge className="bg-orange-500 hover:bg-orange-600 text-white animate-pulse">
                                                      <AlertCircle className="mr-1 h-3 w-3" />
                                                      Aguardando confirmação
                                                    </Badge>
                                                  )}
                                                </div>
                                                <CardDescription>
                                                    {format(route.plannedDate, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                                                </CardDescription>
                                            </div>
                                            <div className="flex items-center gap-2">
                                              {route.code && (
                                                <Badge variant="outline" className="font-mono">
                                                  {route.code}
                                                </Badge>
                                              )}
                                              {route.source === 'lunna' && <LunnaBadge />}
                                              <DropdownMenu open={openDropdownId === route.id} onOpenChange={(open) => setOpenDropdownId(open ? route.id : null)}>
                                                  <DropdownMenuTrigger asChild>
                                                  <Button variant="ghost" className="h-8 w-8 p-0">
                                                      <span className="sr-only">Abrir menu</span>
                                                      <MoreVertical className="h-4 w-4" />
                                                  </Button>
                                                  </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => handleDuplicateRoute(route)} disabled={isDuplicating}>
                                                        <Copy className="mr-2 h-4 w-4" />
                                                        <span>{isDuplicating ? 'Duplicando...' : 'Duplicar Rota'}</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleOpenEditNameDialog(route)}>
                                                      <Pencil className="mr-2 h-4 w-4" />
                                                      <span>Editar Nome</span>
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleOpenChangeDriver(route)}>
                                                        <UserCog className="mr-2 h-4 w-4" />
                                                        <span>Trocar Motorista</span>
                                                    </DropdownMenuItem>
                                                    {(userRole === 'admin' || userRole === 'socio') && (
                                                      <DropdownMenuItem
                                                        onClick={() => handleOpenCompleteRouteDialog(route)}
                                                        className="text-green-600 dark:text-green-400"
                                                      >
                                                        <CheckCircle className="mr-2 h-4 w-4" />
                                                        <span>Marcar como Concluída</span>
                                                      </DropdownMenuItem>
                                                    )}
                                                    <DropdownMenuItem
                                                        className="text-destructive"
                                                        onClick={() => handleOpenDeleteDialog(route)}
                                                    >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    <span>Excluir Rota</span>
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                              </DropdownMenu>
                                            </div>
                                          </div>
                                        </CardHeader>
                                        <CardContent className="flex-1 space-y-4">
                                            <div className="flex items-center justify-between text-sm">
                                              <div className="flex items-center gap-3">
                                                <User className="h-4 w-4 text-muted-foreground" />
                                                <span className="font-medium">{route.driverInfo?.name || 'Motorista não informado'}</span>
                                              </div>
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
                                          {route.status === 'draft' ? (
                                            <Button className="w-full" variant="outline" onClick={() => handleEditDraft(route)}>
                                              <FileEdit className="mr-2 h-4 w-4" />
                                              Continuar Editando
                                            </Button>
                                          ) : (
                                            <Button className="w-full" variant="outline" onClick={() => handleEditRoute(route)}>
                                              <Truck className="mr-2 h-4 w-4" />
                                              Acompanhar Rota
                                            </Button>
                                          )}
                                        </CardFooter>
                                      </Card>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                  </AccordionContent>
                </Card>
              </AccordionItem>
            )
          })}
        </Accordion>
      </div>

      {/* Change Driver Dialog */}
      <Dialog open={isChangeDriverDialogOpen} onOpenChange={setIsChangeDriverDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trocar Motorista</DialogTitle>
            <DialogDescription>
              Selecione um novo motorista para a rota "{routeToModify?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Motorista Atual</label>
              <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{routeToModify?.driverInfo?.name || 'Não informado'}</span>
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
      
      {/* Delete Route Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Você tem certeza absoluta?</AlertDialogTitle>
            <AlertDialogDescription>
                Esta ação não pode ser desfeita. Isso irá remover permanentemente a rota <span className="font-semibold">{routeToModify?.name}</span> do sistema.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
                <Button
                variant="destructive"
                onClick={handleDeleteRoute}
                disabled={isDeleting}
                >
                {isDeleting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                    <Trash2 className="mr-2 h-4 w-4" />
                )}
                {isDeleting ? 'Removendo...' : 'Sim, remover rota'}
                </Button>
            </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
        </AlertDialog>

        {/* Edit Name Dialog */}
      <Dialog open={isEditNameDialogOpen} onOpenChange={setIsEditNameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Nome da Rota</DialogTitle>
            <DialogDescription>
              Insira um novo nome para a rota "{routeToModify?.name}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="routeName">Novo nome</Label>
              <Input
                id="routeName"
                value={newRouteName}
                onChange={(e) => setNewRouteName(e.target.value)}
                placeholder="Ex: Entregas da Manhã"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditNameDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdateRouteName} disabled={isUpdating || !newRouteName?.trim()}>
              {isUpdating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Nome'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete Route Confirmation Dialog */}
      <AlertDialog open={isCompleteRouteDialogOpen} onOpenChange={setIsCompleteRouteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Marcar Rota como Concluída?</AlertDialogTitle>
            <AlertDialogDescription>
              Você está prestes a marcar a rota <span className="font-semibold">{routeToModify?.name}</span> como concluída.
              Esta ação irá remover a rota da lista de rotas ativas e movê-la para o histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCompleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="default"
                onClick={handleCompleteRoute}
                disabled={isCompleting}
                className="bg-green-600 hover:bg-green-700 dark:bg-green-600 dark:hover:bg-green-700"
              >
                {isCompleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                {isCompleting ? 'Concluindo...' : 'Sim, marcar como concluída'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force Complete Service Confirmation Dialog */}
      <AlertDialog open={isForceCompleteServiceDialogOpen} onOpenChange={setIsForceCompleteServiceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Forçar Conclusão do Serviço?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            <p className="text-sm text-muted-foreground">
              Você está prestes a <span className="font-semibold text-destructive">forçar a conclusão</span> do serviço{' '}
              <span className="font-semibold">{serviceToForceComplete?.service.code}</span>.
            </p>
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Esta ação irá:</p>
              <ul className="text-sm text-amber-800 dark:text-amber-200 list-disc list-inside mt-2 space-y-1">
                <li>Marcar TODAS as {serviceToForceComplete?.routes.length || 0} rotas como concluídas automaticamente</li>
                <li>Arquivar o serviço e removê-lo desta página</li>
                <li>Mover tudo para o histórico</li>
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Esta ação é útil para limpar serviços de teste ou cancelados.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCompletingService}>Cancelar</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={handleForceCompleteService}
                disabled={isCompletingService}
              >
                {isCompletingService ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Concluindo...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Sim, forçar conclusão
                  </>
                )}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
