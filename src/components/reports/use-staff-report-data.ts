'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOptionalStaff } from '@/components/staff/staff-session';
import { addDays, startOfDay } from 'date-fns';
import { useStaffQuery } from '@/components/staff/use-staff-query';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { EarningsRequestError } from '@/lib/earnings/session-request';

type Request=NonNullable<ReturnType<typeof useOptionalStaff>>['request'];
type ReportPage<T,K extends string>=Record<K,T[]> & {cursor:string|null};

export async function readStaffPages<T,K extends string>(request:Request,path:string,key:K,signal:AbortSignal) {
  const rows:T[]=[];
  let next=path;
  let cursor:string|null=null;
  do {
    const result:ReportPage<T,K>=await request(next,{signal});
    rows.push(...result[key]);
    if (result.cursor && result.cursor===cursor) throw new Error('Invalid report cursor');
    cursor=result.cursor;
    next=path+(path.includes('?') ? '&':'?')+'cursor='+encodeURIComponent(cursor ?? '');
  } while (cursor);
  return rows;
}

export function useStaffReportData<T,K extends string>(path:string|null,key:K,interval=60_000) {
  const session=useOptionalStaff();
  const request=session?.request;
  const scope=session ? session.userId+':'+session.scopeId:'';
  const selection=scope+':'+path;
  const load=useCallback(async (signal:AbortSignal)=>{
    if (!nativeStaffEnabled || !path) return {selection,rows:[] as T[]};
    if (!request) throw new EarningsRequestError(401,'staff_session_unavailable');
    return {selection,rows:await readStaffPages<T,K>(request,path,key,signal)};
  },[request,path,key,selection]);
  const result=useStaffQuery(load,interval);
  return {...result,data:result.data?.selection===selection ? result.data.rows:undefined,
    loading:nativeStaffEnabled && !!path && !result.error && result.data?.selection!==selection};
}

export function useReportPagination<T>(rows:T[],size=50) {
  const [page,setPage]=useState(1);
  const pageCount=Math.max(1,Math.ceil(rows.length/size));
  const current=Math.min(page,pageCount);
  const pageRows=useMemo(()=>rows.slice((current-1)*size,current*size),[rows,current,size]);
  return {page:current,pageCount,pageRows,setPage};
}

export function useStaffReportCommandIds() {
  const [ids]=useState(()=>new Map<string,string>());
  return (value:unknown)=>{
    const key=JSON.stringify(value);
    const existing=ids.get(key);
    if (existing) return existing;
    if (ids.size>=200) ids.delete(ids.keys().next().value!);
    const created=crypto.randomUUID();
    ids.set(key,created);
    return created;
  };
}

export function useReportPageReset(reset:(page:number)=>void,...filters:unknown[]) {
  const key=JSON.stringify(filters);
  useEffect(()=>reset(1),[reset,key]);
}

export function reportErrorMessage(error:unknown) {
  if (error instanceof EarningsRequestError) {
    if (error.status===401) return 'Sua sessão expirou. Entre novamente para continuar.';
    if (error.status===403) return 'Sua conta não tem acesso a esta operação.';
    if (error.code==='staff_route_counter_conflict') return 'O próximo código já existe. Confira o contador antes de continuar.';
    if (error.code==='staff_driver_unavailable') return 'O motorista original não está disponível para receber esta rota.';
    if (error.status===409) return 'Os dados mudaram. Atualize e confira a seleção antes de tentar de novo.';
    if (error.status===429) return 'Aguarde um minuto antes de iniciar outra conciliação com IA.';
    if (error.status===422) return 'Confira os dados informados.';
  }
  return 'Não foi possível concluir a operação. Tente novamente.';
}

export function csvCell(value:unknown) {
  const text=String(value ?? '');
  const escaped=/^[\s\uFEFF]*[=+\-@]/.test(text) && typeof value!=='number' ? "'"+text:text;
  return '"'+escaped.replaceAll('"','""')+'"';
}

export function reportDayBounds(from:Date,to:Date) {
  const start=startOfDay(from);
  const midnight=startOfDay(to);
  // O preset Ontem termina exatamente na virada para hoje.
  const end=to.getTime()===midnight.getTime() && midnight>start ? midnight:startOfDay(addDays(to,1));
  return {start,end};
}
