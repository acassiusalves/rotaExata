'use client';
import { useCallback,useEffect,useState } from 'react';
import { useDriverRuntime } from '@/components/driver/driver-runtime';

export function useDriverResource<Result>(url:string,poll=15000) {
  const {request}=useDriverRuntime();
  const [state,setState]=useState<{url:string;data?:Result;error?:Error}>();
  const [revision,setRevision]=useState(0);
  const refresh=useCallback(()=>setRevision(value=>value+1),[]);
  useEffect(()=>{
    let controller:AbortController|undefined;
    const load=()=>{
      if (controller) return;
      controller=new AbortController();
      const operation=controller;
      void request<Result>(url,{signal:operation.signal}).then(data=>{
        if (!operation.signal.aborted) setState({url,data});
      }).catch(error=>{
        if (!operation.signal.aborted) setState(current=>({url,data:current?.url===url ? current.data:undefined,error}));
      }).finally(()=>{if(controller===operation) controller=undefined;});
    };
    load();
    const visible=()=>{if (document.visibilityState==='visible' && navigator.onLine) load();};
    const timer=poll>0?setInterval(visible,poll):undefined;
    window.addEventListener('online',visible);
    window.addEventListener('focus',visible);
    window.addEventListener('rotaexata:driver-notification',visible);
    document.addEventListener('visibilitychange',visible);
    return()=>{controller?.abort();if(timer) clearInterval(timer);window.removeEventListener('online',visible);window.removeEventListener('focus',visible);window.removeEventListener('rotaexata:driver-notification',visible);
      document.removeEventListener('visibilitychange',visible);};
  },[request,url,revision,poll]);
  return {data:state?.url===url?state.data:undefined,error:state?.url===url?state.error:undefined,
    loading:state?.url!==url,refresh};
}
