'use client';

import { useCallback,useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card,CardContent } from '@/components/ui/card';
import { DriverTableSkeleton } from '@/components/skeletons/table-skeleton';
import { DriverTable } from '@/components/drivers/driver-table';
import { DriverDetailsDialog } from '@/components/drivers/driver-details-dialog';
import { EditDriverDialog } from '@/components/drivers/edit-driver-dialog';
import { staffDriverAssignments,type StaffDriverAssignment } from '@/lib/staff/driver-assignments';
import { loadStaffPageList } from '@/lib/staff/query-pages';
import { useStaff } from '@/components/staff/staff-session';
import { useStaffQuery } from '@/components/staff/use-staff-query';
import { useToast } from '@/hooks/use-toast';
import type { Driver } from '@/lib/types';

type WireDriver=Omit<Driver,'lastSeenAt'> & {lastSeenAt:string|null;revision:string};
type StaffDriver=Driver & {revision:string};

export default function DriversPage() {
  const {request,paths}=useStaff();
  const {toast}=useToast();
  const [isRefreshing,setIsRefreshing]=useState(false);
  const [detailsId,setDetailsId]=useState<string|null>(null);
  const [edited,setEdited]=useState<StaffDriver|null>(null);
  const load=useCallback(async(signal:AbortSignal)=>{
    const [drivers,assignments]=await Promise.all([
      loadStaffPageList<WireDriver,'drivers'>(request,'/api/staff/drivers','drivers',signal),
      loadStaffPageList<StaffDriverAssignment,'assignments'>(request,'/api/staff/drivers?view=assignments','assignments',signal),
    ]);
    const counts=staffDriverAssignments(drivers,assignments);
    return drivers.map(driver=>({...driver,...counts.get(driver.id),lastSeenAt:new Date(driver.lastSeenAt ?? 0)}));
  },[request]);
  const {data,error,loading,refresh}=useStaffQuery(load);
  const rows=data ?? [];
  const details=rows.find(row=>row.id===detailsId) ?? null;

  async function updatePresence() {
    setIsRefreshing(true);
    try {
      const {updated}=await request<{updated:number}>('/api/staff/drivers/cleanup',{method:'POST'});
      refresh();
      toast({title:'Status atualizado',description:updated ?
        updated+' motorista(s) marcado(s) como offline.':'Nenhum motorista precisava de atualização.'});
    } catch {
      toast({variant:'destructive',title:'Não foi possível atualizar o status'});
    } finally {setIsRefreshing(false);}
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-3xl font-bold tracking-tight">Motoristas</h2>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={()=>void updatePresence()} disabled={isRefreshing}>
          <RefreshCw className={isRefreshing?'mr-2 size-4 animate-spin':'mr-2 size-4'} />
          {isRefreshing?'Atualizando…':'Atualizar status'}
        </Button>
        {paths.includes('/driver/admin/accounts') && <Button asChild>
          <Link href="/driver/admin/accounts#novo-motorista">Cadastrar e gerenciar contas</Link>
        </Button>}
      </div>
    </div>
    <Card><CardContent className="pt-6">
      {error && !data ? <div className="space-y-3">
        <p role="alert">Não foi possível carregar os motoristas.</p>
        <Button variant="outline" onClick={refresh}>Tentar novamente</Button>
      </div> : loading ? <DriverTableSkeleton /> :
        <DriverTable drivers={rows} onViewDetailsClick={driver=>setDetailsId(driver.id)}
          onEditClick={driver=>setEdited(rows.find(row=>row.id===driver.id) ?? null)} />}
    </CardContent></Card>
    <DriverDetailsDialog isOpen={!!details} onClose={()=>setDetailsId(null)} driver={details} />
    <EditDriverDialog isOpen={!!edited} onClose={()=>setEdited(null)} onSaved={refresh} driver={edited} revision={edited?.revision} />
  </div>;
}
