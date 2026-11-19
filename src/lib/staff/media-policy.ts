import { driverTimestamp } from '../driver/runtime-contract.ts';
import { currentRouteDay } from './operational-day.ts';

export const staffPhotoViews=['dashboard','monitor','report','history','route'] as const;
export type StaffPhotoView=typeof staffPhotoViews[number];

export function staffPhotoViewForPath(path:string):StaffPhotoView|null {
  if (path==='/dashboard') return 'dashboard';
  if (path==='/routes/monitoring') return 'monitor';
  if (path==='/reports/general') return 'report';
  if (path==='/history/motorista' || path==='/history/rotas') return 'history';
  if (path==='/routes' || path.startsWith('/routes/') || path.startsWith('/track/')) return 'route';
  return null;
}

export function staffRouteCanReadPhoto(route:Record<string,unknown>|undefined,path:string,view:StaffPhotoView,now?:Date) {
  if (!route || !Array.isArray(route.stops) || !route.stops.some(stop=>stop &&
      (stop.photoUrl===path || stop.attemptPhotoUrl===path))) return false;
  if (view==='dashboard') {
    const planned=driverTimestamp(route.plannedDate);
    const [start,end]=currentRouteDay(now);
    return !!planned && Date.parse(planned)>=start && Date.parse(planned)<end;
  }
  if (view==='monitor') return route.status==='dispatched' || route.status==='in_progress';
  if (view==='report' || view==='history') return route.status==='completed' || route.status==='completed_auto';
  return true;
}
