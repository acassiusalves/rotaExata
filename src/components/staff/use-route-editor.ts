'use client';

import { useMemo,useRef } from 'react';
import { useOptionalStaff } from './staff-session';
import { useAuth } from '@/hooks/auth-context';
import { EarningsRequestError } from '@/lib/earnings/session-request';
import { FALLBACK_ORIGIN } from '@/lib/default-origin';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { staffWorkspaceKey } from '@/lib/staff/workspace';
import { staffRouteDates } from '@/lib/staff/route-dates';
import { editorStop,staffPlanPayload } from '@/lib/staff/editor-payload';
import { staffArrangementSchema,type StaffEditorRead } from '@/lib/staff/editor-contract';
import type { PlaceValue,RouteInfo } from '@/lib/types';
import type { ExistingRoutePlan,RoutePlanBatchInput,SavedRoutePlanBatch } from '@/lib/route-stop-mutations';
import { RouteStructureConflictError } from '@/lib/route-stop-reconciliation';
import type { OptimizeDeliveryRoutesInput,OptimizeDeliveryRoutesOutput } from '@/ai/flows/optimize-delivery-routes';

type RouteRef={kind:'route';id:string};
type ServiceRef={kind:'service';id:string};
type OrderRef={kind:'order';id:string;revision?:string};
type LocationRef={kind:'location';id:string};
export type EditorRef=RouteRef|ServiceRef|OrderRef|LocationRef;
type PlanInput=RoutePlanBatchInput & {draftDispatch?:unknown};
type PendingDispatch=Map<string,PlanInput>;
type EditorRow=Record<string,any>;
type EditorSnapshot={id:string;ref:EditorRef;exists:()=>boolean;data:()=>EditorRow};
type Requester=<T>(path:string,init?:RequestInit)=>Promise<T>;
type Notice={outcome:'accepted'|'skipped_no_token'|'failed'};
const loadLegacy=()=>import('./legacy-editor-transport').then(module=>module.legacyEditor);
const post=(body:unknown,method='POST',signal?:AbortSignal)=>({method,body:JSON.stringify(body),signal});
const unavailable=<T>():Promise<T>=>Promise.reject(new EarningsRequestError(401,'earnings_unauthorized'));

export const routeRef=(id:string):RouteRef=>({kind:'route',id});
export const serviceRef=(id:string):ServiceRef=>({kind:'service',id});
export const orderRef=(id:string,revision?:string):OrderRef=>({kind:'order',id,revision});
export const locationRef=(id:string):LocationRef=>({kind:'location',id});
export const editorTime=()=>({editorMutation:'timestamp'} as const);
export const editorUnion=(...items:unknown[])=>({editorMutation:'union',items} as const);
export const editorIncrement=(amount:number)=>({editorMutation:'increment',amount} as const);
export const editorDate=(value:Date|{toDate:()=>Date}|null|undefined):Date|undefined=>
  value instanceof Date ? value:value?.toDate?.();
export const routesOnDay=(date:Date):EditorListRead=>({kind:'scheduled',
  date:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date)});
export const serviceRoutes=(id:string):EditorListRead=>({kind:'service-routes',id});
export const eligibleDrivers={kind:'drivers'} as const;
export const activeRoutes={kind:'active'} as const;
export const ordersByNumber=(numbers:string|string[]):EditorListRead=>({kind:'orders',numbers:Array.isArray(numbers) ? numbers:[numbers]});

function snapshot(reference:EditorRef,row:EditorRow|null):EditorSnapshot {
  return {id:reference.id,ref:reference,exists:()=>!!row,data:()=>row ?? {}};
}
type EditorChange={type:'added'|'modified'|'removed';doc:EditorSnapshot};
function list(docs:EditorSnapshot[],changes:EditorChange[]=[]) {
  return {docs,empty:docs.length===0,size:docs.length,forEach:(visit:(doc:EditorSnapshot)=>void)=>docs.forEach(visit),
    docChanges:()=>changes};
}
type EditorList=ReturnType<typeof list>;
type EditorListRead=Exclude<StaffEditorRead,{kind:'route'|'service'|'origin'}>;
function queryRef(read:StaffEditorRead,id:string,row?:EditorRow):EditorRef {
  return read.kind==='orders' ? orderRef(id,row?.revision):read.kind==='service' ? serviceRef(id):routeRef(id);
}
function noticeIdFrom(record:Map<string,string>,id:string) {return record.get(id);}
function cleanPlaces(items:unknown[]) {
  return staffArrangementSchema.shape.stops.parse(items.map(value=>{
    const {_originalStopKey:_,...stop}=editorStop(value);
    return stop;
  }));
}
const coordinate=({lat,lng}:Pick<PlaceValue,'lat'|'lng'>)=>({lat,lng});
const metrics=(data:EditorRow)=>typeof data.encodedPolyline==='string' && typeof data.distanceMeters==='number' &&
  typeof data.duration==='string' ? {encodedPolyline:data.encodedPolyline,distanceMeters:data.distanceMeters,duration:data.duration}:undefined;

function routeEditor(request:Requester,ids:Map<string,string>,notices:Map<string,string>,dispatches:PendingDispatch,legacyToken:()=>Promise<string|undefined>) {
  const commitId=(fingerprint:string)=>{
    let id=ids.get(fingerprint);
    if (!id) {
      id=crypto.randomUUID();
      ids.set(fingerprint,id);
    }
    return id;
  };

  async function read(query:StaffEditorRead,signal?:AbortSignal) {
    return staffRouteDates<{record?:EditorRow|null;records?:EditorRow[]}>(await request('/api/staff/routes/editor',post(query,'POST',signal)));
  }

  async function readDocument(reference:EditorRef,server=false):Promise<EditorSnapshot> {
    if (!nativeStaffEnabled) {
      const doc=await (await loadLegacy()).read(reference,server);
      return snapshot(reference,(doc.data() as EditorRow|undefined) ?? null);
    }
    if (reference.kind!=='route' && reference.kind!=='service') throw new Error('Dados do editor indisponíveis.');
    return snapshot(reference,(await read({kind:reference.kind,id:reference.id})).record ?? null);
  }

  async function readList(query:EditorListRead) {
    if (!nativeStaffEnabled) {
      const result=await (await loadLegacy()).select(query);
      return list(result.docs.map(doc=>snapshot(queryRef(query,doc.id),doc.data() as EditorRow)));
    }
    return list(((await read(query)).records ?? []).filter(Boolean).map(row=>snapshot(queryRef(query,row.id,row),row)));
  }

  function watch(query:RouteRef|ServiceRef,apply:(value:EditorSnapshot)=>unknown,reject?:(error:Error)=>void):()=>void;
  function watch(query:EditorListRead,apply:(value:EditorList)=>unknown,reject?:(error:Error)=>void):()=>void;
  function watch(query:EditorListRead|RouteRef|ServiceRef,apply:(value:any)=>unknown,reject?:(error:Error)=>void) {
    const controller=new AbortController();
    let unsubscribe:(()=>void)|undefined;
    const receiveError=(error:unknown)=>{
      if (!controller.signal.aborted) reject?.(error instanceof Error ? error:new Error('Não foi possível atualizar a rota.'));
    };
    if (!nativeStaffEnabled) {
      void loadLegacy().then(module=>{
        if (controller.signal.aborted) return;
        const receive=(value:any)=>{
          if (controller.signal.aborted) return;
          if ('docs' in value) {
            const snapshotOf=(doc:any)=>snapshot(queryRef(query,doc.id),doc.data());
            apply(list(value.docs.map(snapshotOf),value.docChanges().map((change:any)=>({type:change.type,doc:snapshotOf(change.doc)}))));
          }
          else apply(snapshot(queryRef(query,value.id),value.data() ?? null));
        };
        unsubscribe=module.watch(query,receive,receiveError);
      }).catch(receiveError);
      return ()=>{controller.abort();unsubscribe?.();};
    }
    let last='';
    let earlier=new Map<string,EditorSnapshot>();
    let timer:number|undefined;
    async function refresh() {
      if (controller.signal.aborted) return;
      try {
        if (document.visibilityState==='visible') {
          const response=await read(query,controller.signal);
          const next=JSON.stringify(response);
          if (next!==last && !controller.signal.aborted) {
            last=next;
            if (query.kind==='route' || query.kind==='service') await apply(snapshot(query,response.record ?? null));
            else {
              const docs=(response.records ?? []).filter(Boolean).map(row=>snapshot(queryRef(query,row.id,row),row));
              const indexed=new Map(docs.map(doc=>[doc.id,doc]));
              const changes=docs.flatMap<EditorChange>(doc=>{
                const before=earlier.get(doc.id);
                if (!before) return [{type:'added' as const,doc}];
                return JSON.stringify(before.data())!==JSON.stringify(doc.data()) ? [{type:'modified' as const,doc}]:[];
              });
              for (const doc of earlier.values()) if (!indexed.has(doc.id)) changes.push({type:'removed',doc});
              earlier=indexed;
              await apply(list(docs,changes));
            }
          }
        }
      } catch(error) {receiveError(error);}
      finally {
        if (!controller.signal.aborted) timer=window.setTimeout(refresh,8000);
      }
    }
    void refresh();
    return ()=>{controller.abort();window.clearTimeout(timer);};
  }

  async function sendNotice(noticeId:string|undefined):Promise<{push:Notice}> {
    if (!noticeId) return {push:{outcome:'skipped_no_token'}};
    return request('/api/staff/routes/notices/'+encodeURIComponent(noticeId),post({}));
  }

  async function saveBatch(input:PlanInput) {
    if (!nativeStaffEnabled) return (await loadLegacy()).plan(input);
    const fingerprint=JSON.stringify(input);
    const payload=staffPlanPayload(commitId(fingerprint),input);
    try {
      const result=staffRouteDates<SavedRoutePlanBatch>(await request('/api/staff/routes/plan',post(payload)));
      ids.delete(fingerprint);
      result.existingRoutes.forEach(route=>{
        if (route.noticeId) notices.set(route.routeId,route.noticeId);
      });
      return result;
    } catch(error) {
      if (error instanceof EarningsRequestError && error.status===409) throw new RouteStructureConflictError();
      throw error;
    }
  }

  function buildPlan(reference:EditorRef,data:EditorRow,current:EditorRow):ExistingRoutePlan {
    return {routeId:reference.id,expectedStatus:current.status,baseStops:current.stops ?? [],
      plannedStops:data.stops ?? current.stops ?? [],metrics:metrics(data),metadata:data};
  }

  async function patch(command:EditorRow) {
    const fingerprint=JSON.stringify(command);
    await request('/api/staff/routes/editor',post({...command,commandId:commitId(fingerprint)},'PATCH'));
    ids.delete(fingerprint);
  }

  async function update(reference:EditorRef,data:EditorRow) {
    if (!nativeStaffEnabled) return (await loadLegacy()).update(reference,data);
    if (reference.kind==='order') {
      // Dispatch writes the linkage in the same transaction as the route.
      if (data.logisticsStatus==='em_rota') return;
      if (!reference.revision) throw new Error('O pedido foi alterado. Recarregue a rota.');
      await patch({kind:'detach-order',orderId:reference.id,revision:reference.revision});
      return;
    }
    const doc=await readDocument(reference);
    if (!doc.exists()) throw new Error('O registro de planejamento não existe mais.');
    const current=doc.data();
    if (reference.kind==='service') {
      // Linking a route and updating totals are part of the plan transaction.
      if (!Array.isArray(data.allStops)) return;
      const retained=new Set(data.allStops.map((stop:PlaceValue)=>String(stop.id ?? stop.placeId)));
      const removed=(current.allStops ?? []).flatMap((stop:PlaceValue)=>{
        const key=String(stop.id ?? stop.placeId);
        return retained.has(key) ? []:[key];
      });
      if (removed.length) await patch({kind:'prune-service-pool',serviceId:reference.id,revision:current.revision,removed});
      return;
    }
    if (reference.kind!=='route') throw new Error('Ação de planejamento indisponível.');
    if (Array.isArray(data.organizedRoutes)) {
      await patch({kind:'arrange',routeId:reference.id,revision:current.revision,routes:data.organizedRoutes.filter((route:EditorRow)=>
        !route.dispatched).map((route:EditorRow)=>({key:route.key,name:route.name,stops:cleanPlaces(route.stops),
          info:{...metrics(route.info),color:route.info.color}}))});
      return;
    }
    if (Array.isArray(data.unassignedStops) && !data.stops) {
      await patch({kind:'route-pool',routeId:reference.id,revision:current.revision,
        stops:data.unassignedStops.map(editorStop)});
      return;
    }
    const result=await saveBatch({existingPlans:[buildPlan(reference,data,current)]});
    await Promise.allSettled(result.existingRoutes.map(route=>sendNotice(route.noticeId)));
  }

  async function createServicePair(serviceId:string,rows:EditorRow[]) {
    if (!nativeStaffEnabled) return Promise.all(rows.map(async data=>(await loadLegacy()).addRoute(data)));
    const newRoutes=rows.map(data=>({
      routeId:commitId(JSON.stringify({operation:'service-draft',serviceId,data})),data,plannedStops:data.stops,
    }));
    if (!newRoutes.length) return [];
    await saveBatch({existingPlans:[],newRoutes,serviceLink:{serviceId,routeIds:newRoutes.map(route=>route.routeId),requireUnplanned:true}});
    return newRoutes.map(route=>({id:route.routeId}));
  }

  async function createRoute(data:EditorRow,options?:{draftId:string;key:string}) {
    if (!nativeStaffEnabled) return (await loadLegacy()).addRoute(data);
    const fingerprint=JSON.stringify({operation:'route',data,options});
    let input=dispatches.get(fingerprint);
    if (!input) {
      const routeId=commitId(fingerprint);
      let draftDispatch:unknown;
      if (options) {
        const existing=await readDocument(routeRef(options.draftId),true);
        if (!existing.exists()) throw new RouteStructureConflictError();
        const row=existing.data();
        draftDispatch={routeId:options.draftId,revision:row.revision,key:options.key};
      }
      input={existingPlans:[],newRoutes:[{routeId,data,plannedStops:data.stops}],
        ...(data.serviceId ? {serviceLink:{serviceId:data.serviceId,routeIds:[routeId]}}:{}),draftDispatch};
      dispatches.set(fingerprint,input);
    }
    try {
      const result=await saveBatch(input);
      dispatches.delete(fingerprint);
      ids.delete(fingerprint);
      return {id:result.createdRoutes[0].routeId};
    } catch(error) {
      // A lost response can be retried against the same receipt even if its draft was consumed.
      // A definitive conflict requires rereading the latest draft before trying again.
      if (error instanceof RouteStructureConflictError) dispatches.delete(fingerprint);
      throw error;
    }
  }

  async function rename(data:EditorRow) {
    const route=(await readDocument(routeRef(data.routeId))).data();
    const body={kind:'rename',name:data.name,revision:route.revision};
    const fingerprint=JSON.stringify({routeId:data.routeId,body});
    const result=await request('/api/staff/routes/'+encodeURIComponent(data.routeId),post({...body,commandId:commitId(fingerprint)},'PATCH'));
    ids.delete(fingerprint);
    return result;
  }

  async function call(name:'notifyRouteChanges'|'updateRouteName',data:EditorRow) {
    if (!nativeStaffEnabled) return (await loadLegacy()).call(name,data);
    if (name==='updateRouteName') return {data:await rename(data)};
    const delivered=await sendNotice(noticeIdFrom(notices,data.routeId));
    if (delivered.push.outcome!=='accepted') throw new Error('Alterações salvas. O aviso não pôde ser enviado.');
    return {data:delivered};
  }

  async function remove(reference:EditorRef) {
    if (!nativeStaffEnabled) return (await loadLegacy()).remove(reference);
    if (reference.kind!=='route') throw new Error('Rascunho indisponível.');
    const row=(await readDocument(reference)).data();
    await patch({kind:'delete-draft',routeId:reference.id,revision:row.revision});
  }

  async function requestLocation(id:string) {
    if (!nativeStaffEnabled) return (await loadLegacy()).requestLocation(id);
    const selected=(await readList(activeRoutes)).docs.find(doc=>doc.data().driverId===id && doc.data().status==='in_progress');
    if (!selected) throw new Error('O motorista não tem rota em andamento.');
    await request('/api/staff/routes/'+encodeURIComponent(selected.id)+'/location',post({driverId:id,view:'route'}));
  }

  function batch() {
    const mutations:Array<{reference:EditorRef;data:EditorRow}>=[];
    return {
      update(reference:EditorRef,data:EditorRow) {mutations.push({reference,data});},
      async commit() {
        if (!nativeStaffEnabled) return (await loadLegacy()).batch(mutations);
        const plans=await Promise.all(mutations.map(async({reference,data})=>{
          if (reference.kind!=='route') throw new Error('Lote de planejamento indisponível.');
          return buildPlan(reference,data,(await readDocument(reference)).data());
        }));
        const result=await saveBatch({existingPlans:plans});
        await Promise.allSettled(result.existingRoutes.map(route=>sendNotice(route.noticeId)));
      },
    };
  }

  async function sequence(input:OptimizeDeliveryRoutesInput) {
    const path='/api/staff/maps/sequence';
    const body={origin:coordinate(input.origin),deliveryLocations:input.deliveryLocations};
    if (nativeStaffEnabled) return request<OptimizeDeliveryRoutesOutput>(path,post(body));
    const token=await legacyToken();
    if (!token) throw new Error('Entre novamente para otimizar a sequência.');
    const res=await fetch(path,{...post(body),headers:{'content-type':'application/json',Authorization:'Bearer '+token}});
    if (!res.ok) throw new Error('Falha ao otimizar a sequência das paradas.');
    return res.json() as Promise<OptimizeDeliveryRoutesOutput>;
  }

  async function computeRoute(origin:PlaceValue,stops:PlaceValue[]):Promise<RouteInfo|null> {
    if (!stops.length) return null;
    try {
      const path='/api/compute-optimized-route';
      const init=post(nativeStaffEnabled ? {origin:coordinate(origin),stops:stops.map(coordinate)} : {origin,stops});
      const data=nativeStaffEnabled ? await request<RouteInfo>(path,init) : await fetch(path,init).then(response=>{
        if (!response.ok) throw new Error('Falha ao calcular a rota.');
        return response.json() as Promise<RouteInfo>;
      });
      return {...data,stops,visible:true};
    } catch {return null;}
  }

  async function defaultOrigin() {
    if (!nativeStaffEnabled) return (await loadLegacy()).origin();
    return (await read({kind:'origin'})).record as PlaceValue | null ?? FALLBACK_ORIGIN;
  }

  return {
    readDocument,readList,watch,update,remove,createRoute,createServicePair,requestLocation,batch,call,sequence,computeRoute,defaultOrigin,sendNotice,
    notify:async(data:EditorRow)=>{
      if (!nativeStaffEnabled) return (await loadLegacy()).addNotification(data);
      return {id:noticeIdFrom(notices,data.routeId)};
    },
    code:async()=>nativeStaffEnabled ? '':(await loadLegacy()).code(),
    plan:saveBatch,
    saveExisting:async(plans:ExistingRoutePlan[])=>(await saveBatch({existingPlans:plans})).existingRoutes,
  };
}

export function useRouteEditor() {
  const actor=useOptionalStaff();
  const legacy=useAuth();
  const request=actor?.request ?? unavailable;
  const commandIds=useRef(new Map<string,string>());
  const notices=useRef(new Map<string,string>());
  const dispatches=useRef<PendingDispatch>(new Map());
  const legacyUser=nativeStaffEnabled ? null:legacy.user;
  const transport=useMemo(()=>routeEditor(request,commandIds.current,notices.current,dispatches.current,
    async()=>legacyUser?.getIdToken()),[request,legacyUser]);
  const draftKey=actor ? staffWorkspaceKey(actor.userId,actor.scopeId,'newRouteData'):'newRouteData';
  // Activity written by native commands is authoritative, including automated cleanup.
  return {...transport,draftKey,user:legacyUser,native:nativeStaffEnabled};
}

export async function logLegacyEditorActivity(name:keyof Awaited<ReturnType<typeof loadLegacy>>['activity'],context:unknown) {
  if (nativeStaffEnabled) return;
  const log=(await loadLegacy()).activity[name] as (input:unknown)=>Promise<unknown>;
  return log(context);
}
