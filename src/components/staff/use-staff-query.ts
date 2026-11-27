'use client';

import { useCallback,useEffect,useState } from 'react';
import { retainAuthorizedStaffData } from '@/lib/staff/query-refresh';

export function useStaffQuery<T>(load:(signal:AbortSignal)=>Promise<T>,interval=10_000) {
  const [data,setData]=useState<T>();
  const [error,setError]=useState<unknown>();
  const [trigger,setTrigger]=useState(0);
  const refresh=useCallback(()=>setTrigger(count=>count+1),[]);

  useEffect(()=>{
    const controller=new AbortController();
    let timer:number|undefined;
    let pending=false;
    let failures=0;
    async function run() {
      if (pending || controller.signal.aborted) return;
      pending=true;
      try {
        const next=await load(controller.signal);
        if (controller.signal.aborted) return;
        setData(next);
        setError(undefined);
        failures=0;
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!retainAuthorizedStaffData(err,navigator.onLine)) setData(undefined);
        setError(err);
        failures++;
      } finally {
        pending=false;
        if (!controller.signal.aborted) timer=window.setTimeout(foreground,Math.min(60_000,interval*2**failures));
      }
    }
    function foreground() {
      window.clearTimeout(timer);
      if (document.visibilityState==='visible') void run();
    }
    void run();
    document.addEventListener('visibilitychange',foreground);
    return ()=>{
      controller.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange',foreground);
    };
  },[load,interval,trigger]);

  return {data,error,loading:data===undefined && !error,refresh};
}
