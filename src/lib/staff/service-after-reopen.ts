/**
 * Situacao do servico Luna depois que uma de suas rotas e reaberta.
 *
 * Mesma conta do reenvio (`resendStaffHistoryRoute`), com uma diferenca: a rota
 * reaberta pode voltar `in_progress` (ja tinha sido iniciada), e nesse caso o
 * servico volta a "em andamento" mesmo com irmas concluidas.
 */
const finalStatuses=new Set(['completed','completed_auto']);

type RouteSnapshot={id:string;status?:unknown;stops?:unknown};
type StopSnapshot={deliveryStatus?:unknown;unlinkedAt?:unknown}|null;

export type ServiceStatsAfterReopen={
  status:'dispatched'|'partial'|'in_progress';
  completedRoutes:number;
  completedDeliveries:number;
};

export function serviceStatsAfterReopen(
  routes:readonly RouteSnapshot[],reopenedId:string,target:'dispatched'|'in_progress',
):ServiceStatsAfterReopen {
  const others=routes.filter(route=>route.id!==reopenedId);
  const finished=others.filter(route=>finalStatuses.has(String(route.status)));
  const resumes=target==='in_progress' || others.some(route=>route.status==='in_progress');
  return {
    status:resumes ? 'in_progress':finished.length ? 'partial':'dispatched',
    completedRoutes:finished.length,
    completedDeliveries:finished.reduce((count,route)=>{
      const stops=Array.isArray(route.stops) ? route.stops as StopSnapshot[]:[];
      return count+stops.filter(stop=>stop && !stop.unlinkedAt && stop.deliveryStatus==='completed').length;
    },0),
  };
}
