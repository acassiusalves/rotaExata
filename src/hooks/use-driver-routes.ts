'use client';

import { useEffect,useMemo,useSyncExternalStore } from 'react';
import { useDriverRuntime } from '@/components/driver/driver-runtime';
import { createDriverRoutesSync } from '@/lib/driver-routes-sync';
import { driverPages } from '@/lib/driver/runtime-client';
import type { DriverRoute } from '@/lib/driver/runtime-contract';
import { createLogger } from '@/lib/logger';

export type DriverRouteDocument = DriverRoute & {status:'dispatched'|'in_progress'};
const log=createLogger('DriverRoutes');

export function useDriverRoutes(uid:string|null) {
  const {request,endpoint}=useDriverRuntime();
  const sync=useMemo(()=>{
    const read=(signal?:AbortSignal)=>driverPages<DriverRouteDocument>(request,endpoint,'active',signal)
      .then(routes=>({routes,fromCache:false}));
    return createDriverRoutesSync<DriverRouteDocument>({
      uid,
      observeRoutes: (next,error)=>{
        if (!uid) return ()=>{};
        let inFlight:AbortController|undefined;
        const poll=()=>{
          if (inFlight || !navigator.onLine || document.visibilityState==='hidden') return;
          const operation=new AbortController();
          inFlight=operation;
          void read(operation.signal).then(snapshot=>{if(!operation.signal.aborted) next(snapshot);})
            .catch(failure=>{if(!operation.signal.aborted) error(failure);})
            .finally(()=>{if (inFlight===operation) inFlight=undefined;});
        };
        // createDriverRoutesSync starts the first read and handles resumed tabs.
        const timer=setInterval(poll,10000);
        const push=()=>poll();
        window.addEventListener('rotaexata:driver-notification',push);
        return()=>{clearInterval(timer);inFlight?.abort();window.removeEventListener('rotaexata:driver-notification',push);};
      },
      readServer: () => uid ? read():Promise.resolve({routes:[],fromCache:false}),
      lifecycle: {
        document: typeof document==='undefined' ? new EventTarget():document,
        window: typeof window==='undefined' ? new EventTarget():window,
        isVisible:()=>typeof document!=='undefined' && document.visibilityState==='visible',
        isOnline:()=>typeof navigator==='undefined' || navigator.onLine,
      },
      onDiagnostic:entry=>{
        const details={buildId:process.env.NEXT_PUBLIC_BUILD_ID,...entry};
        if (entry.errorCode) log.warn('Falha ao sincronizar rotas',details);
        else log.debug('Estado da sincronização',details);
      },
    });
  },[uid,request,endpoint]);
  useEffect(()=>{sync.start();return sync.stop;},[sync]);
  const snapshot=useSyncExternalStore(sync.subscribe,sync.getSnapshot,sync.getServerSnapshot);
  return {...snapshot,refresh:sync.refresh};
}
