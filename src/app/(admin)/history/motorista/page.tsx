
'use client';

import * as React from 'react';
import { StaffRefreshNotice } from '@/components/staff/staff-refresh-notice';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { History, Loader2, MapPin, Milestone, User, FileText } from 'lucide-react';
import type { Timestamp } from 'firebase/firestore';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { staffRouteDates } from '@/lib/staff/route-dates';
import { reportErrorMessage, useReportPagination, useReportPageReset, useStaffReportData } from '@/components/reports/use-staff-report-data';
import { Pagination } from '@/components/ui/pagination';
import type { Driver, PlaceValue, RouteInfo } from '@/lib/types';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import Link from 'next/link';
import { RouteDetailsDialog } from '@/components/routes/route-details-dialog';

type DriverOption=Pick<Driver,'id'|'name'|'avatarUrl'>;

type RouteDocument = RouteInfo & {
  id: string;
  name: string;
  plannedDate: Timestamp | Date;
  completedAt?: Timestamp | Date;
  autoCompletedAt?: Timestamp | Date;
  origin: PlaceValue;
  driverInfo: {
    name: string;
    vehicle: {type:string;plate:string};
  } | null;
};

const formatDistance = (meters: number = 0) => (meters / 1000).toFixed(2);

// Componente de Badge de Status
const StatusBadge: React.FC<{ status?: RouteInfo['status'] }> = ({ status }) => {
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

const routeDate=(value:Date|Timestamp|undefined|null)=>value instanceof Date ? value:value?.toDate();
const finishedAt=(route:RouteDocument)=>routeDate(route.completedAt ?? route.autoCompletedAt);
const byCompletion=(a:RouteDocument,b:RouteDocument)=>(finishedAt(b)?.getTime() ?? 0)-(finishedAt(a)?.getTime() ?? 0) || a.id.localeCompare(b.id);

export default function HistoryPage() {
  const [drivers, setDrivers] = React.useState<DriverOption[]>([]);
  const [selectedDriverId, setSelectedDriverId] = React.useState<string | null>(null);
  const [completedRoutes, setCompletedRoutes] = React.useState<RouteDocument[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = React.useState(true);
  const [isLoadingRoutes, setIsLoadingRoutes] = React.useState(false);
  const [selectedRoute, setSelectedRoute] = React.useState<RouteDocument | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = React.useState(false);


  const nativeDrivers=useStaffReportData<DriverOption,'drivers'>('/api/staff/history?view=drivers','drivers');
  const nativeRoutes=useStaffReportData<RouteDocument,'routes'>(selectedDriverId ?
    '/api/staff/history?view=driver&driverId='+encodeURIComponent(selectedDriverId):null,'routes');
  const driverOptions=nativeStaffEnabled ? nativeDrivers.data ?? []:drivers;
  const driverRoutes=React.useMemo(()=>nativeStaffEnabled ?
    staffRouteDates<RouteDocument[]>(nativeRoutes.data ?? []).sort(byCompletion):completedRoutes,[nativeRoutes.data,completedRoutes]);
  const loadingDrivers=nativeStaffEnabled ? nativeDrivers.loading:isLoadingDrivers;
  const loadingRoutes=nativeStaffEnabled ? nativeRoutes.loading:isLoadingRoutes;
  const pagination=useReportPagination(driverRoutes,24);
  useReportPageReset(pagination.setPage,selectedDriverId);

  React.useEffect(()=>{
    if (nativeStaffEnabled) return;
    let cancelled=false;
    let unsubscribe:(()=>void)|undefined;
    void Promise.all([import('@/lib/firebase/client'),import('firebase/firestore')])
      .then(([{db},{collection,query,where,onSnapshot}])=>{
        if (cancelled) return;
        unsubscribe=onSnapshot(query(collection(db,'users'),where('role','==','driver')),snapshot=>{
          setDrivers(snapshot.docs.map(doc=>{
            const data=doc.data();
            return {id:doc.id,name:data.displayName || data.name || 'Motorista sem nome',avatarUrl:data.photoURL || ''};
          }));
          setIsLoadingDrivers(false);
        },error=>{console.error(error);setIsLoadingDrivers(false);});
      }).catch(error=>{if (!cancelled) {console.error(error);setIsLoadingDrivers(false);}});
    return ()=>{cancelled=true;unsubscribe?.();};
  },[]);

  React.useEffect(()=>{
    if (nativeStaffEnabled) return;
    if (!selectedDriverId) {
      setCompletedRoutes([]);
      return;
    }
    let cancelled=false;
    let unsubscribe:(()=>void)|undefined;
    setIsLoadingRoutes(true);
    void Promise.all([import('@/lib/firebase/client'),import('firebase/firestore')])
      .then(([{db},{collection,query,where,onSnapshot}])=>{
        if (cancelled) return;
        const filter=query(collection(db,'routes'),where('driverId','==',selectedDriverId),
          where('status','in',['completed','completed_auto']));
        unsubscribe=onSnapshot(filter,snapshot=>{
          setCompletedRoutes(snapshot.docs.map(doc=>({...doc.data(),id:doc.id} as RouteDocument)).sort(byCompletion));
          setIsLoadingRoutes(false);
        },error=>{console.error(error);setIsLoadingRoutes(false);});
      }).catch(error=>{if (!cancelled) {console.error(error);setIsLoadingRoutes(false);}});
    return ()=>{cancelled=true;unsubscribe?.();};
  },[selectedDriverId]);

  const handleOpenDetails = (route: RouteDocument) => {
    setSelectedRoute(route);
    setIsDetailsOpen(true);
  };

  if (nativeStaffEnabled && nativeDrivers.error && !nativeDrivers.data) return <div className="space-y-2" role="alert">
    <p>{reportErrorMessage(nativeDrivers.error)}</p>
    <Button variant="outline" onClick={nativeDrivers.refresh}>Tentar novamente</Button>
  </div>;

  return (
    <>
      {nativeStaffEnabled && !!nativeDrivers.error && <StaffRefreshNotice retry={nativeDrivers.refresh} />}
      <div className="flex-1 space-y-4">
        {selectedDriverId && nativeRoutes.data && !!nativeRoutes.error && <StaffRefreshNotice retry={nativeRoutes.refresh} />}
        {selectedDriverId && nativeRoutes.error && !nativeRoutes.data ? <div className="space-y-2" role="alert">
          <p>{reportErrorMessage(nativeRoutes.error)}</p>
          <Button variant="outline" onClick={nativeRoutes.refresh}>Tentar novamente</Button>
        </div>:null}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Histórico de Rotas</h2>
            <p className="text-muted-foreground">
              Selecione um motorista para consultar as rotas que já foram concluídas.
            </p>
          </div>
          <Select onValueChange={value=>{setSelectedDriverId(value);setSelectedRoute(null);}} value={selectedDriverId || ''} disabled={loadingDrivers}>
            <SelectTrigger className="w-full sm:w-[300px]">
              <SelectValue placeholder={loadingDrivers ? "Carregando motoristas..." : "Selecione um motorista"} />
            </SelectTrigger>
            <SelectContent>
              {driverOptions.map(driver => (
                  <SelectItem key={driver.id} value={driver.id}>
                      <div className="flex items-center gap-2">
                          <Avatar className='h-6 w-6'>
                              <AvatarImage src={driver.avatarUrl} alt={driver.name} />
                              <AvatarFallback>{driver.name.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <span>{driver.name}</span>
                      </div>
                  </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedDriverId && (
          <Card className="min-h-[400px] flex items-center justify-center border-dashed">
              <CardContent className="text-center pt-6">
                  <User className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Selecione um Motorista</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                      Escolha um motorista no menu acima para ver seu histórico.
                  </p>
              </CardContent>
          </Card>
        )}

        {loadingRoutes && (
          <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )}

        {!loadingRoutes && (!nativeRoutes.error || nativeRoutes.data) && selectedDriverId && driverRoutes.length === 0 && (
          <Card className="min-h-[400px] flex items-center justify-center border-dashed">
              <CardContent className="text-center pt-6">
                  <History className="mx-auto h-12 w-12 text-muted-foreground" />
                  <h3 className="mt-4 text-lg font-semibold">Nenhuma Rota no Histórico</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                      Este motorista ainda não completou nenhuma rota.
                  </p>
              </CardContent>
          </Card>
        )}

        {!loadingRoutes && (!nativeRoutes.error || nativeRoutes.data) && driverRoutes.length > 0 && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {pagination.pageRows.map(route => (
                  <Card key={route.id} className="flex flex-col">
                      <CardHeader>
                          <div className="flex items-start justify-between">
                            <CardTitle>{route.name}</CardTitle>
                            <StatusBadge status={route.status} />
                          </div>
                          <CardDescription>
                              {finishedAt(route) ? `Concluída em ${format(finishedAt(route)!, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` : 'Data de conclusão não registrada'}
                          </CardDescription>
                      </CardHeader>
                      <CardContent className="flex-1 space-y-4">
                          <div className="flex items-center gap-3 text-sm">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <span>{route.stops.length} paradas</span>
                          </div>
                          <div className="flex items-center gap-3 text-sm">
                              <Milestone className="h-4 w-4 text-muted-foreground" />
                              <span>{formatDistance(route.distanceMeters)} km</span>
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
      </div>
      <Pagination currentPage={pagination.page} totalPages={pagination.pageCount} itemsPerPage={24}
        totalItems={driverRoutes.length} onPageChange={pagination.setPage} showItemsPerPage={false} />
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
