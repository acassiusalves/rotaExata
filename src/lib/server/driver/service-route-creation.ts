import { createHash } from 'node:crypto';
import { FieldValue,type DocumentReference,type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import type { LunnaService,PlaceValue } from '../../types';
import { InvalidDispatchDriverError,resolveDispatchDriver } from '../../dispatch-driver.ts';
import { EarningsError } from '../earnings/transport.ts';

export const serviceRouteConfigs=z.array(z.object({
  name:z.string().optional(),
  driverId:z.string().nullish(),
  stopIds:z.array(z.string()),
})).min(1);

type RouteConfig=z.infer<typeof serviceRouteConfigs>[number];
type CreatedRoute={id:string;code:string;stopsCount:number};
type CreationResult={success:true;routes:CreatedRoute[];serviceStatus:'dispatched'|'organizing'};
type CreationLog=CreatedRoute&{serviceCode:string;pointCodes:string[];driver?:Awaited<ReturnType<typeof resolveDispatchDriver>>};

export async function createServiceRoutesAtomically(db:Firestore,serviceId:string,actorId:string,routes:RouteConfig[]) {
  const normalized=routes.map(route=>{
    const driverId=route.driverId?.trim() || null;
    if (route.driverId && !driverId) throw new InvalidDispatchDriverError('Motorista inválido.');
    return {name:route.name || '',driverId,stopIds:route.stopIds};
  });
  const fingerprint=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const service=db.collection('services').doc(serviceId);
  const receipt=service.collection('routeCreationRequests').doc(fingerprint);
  return db.runTransaction(async tx=>{
    const snapshot=await tx.get(service);
    if (!snapshot.exists) throw new EarningsError(404,'Serviço não encontrado');
    const committed=await tx.get(receipt);
    if (committed.exists) return {result:committed.data()!.result as CreationResult,logs:[] as CreationLog[]};
    const source=snapshot.data() as LunnaService;
    if (source.status!=='organizing') throw new EarningsError(400,'Serviço não está em estado de organização');

    const drivers=new Map<string,Awaited<ReturnType<typeof resolveDispatchDriver>>>();
    for (const id of new Set(normalized.flatMap(route=>route.driverId ? [route.driverId] : []))) {
      drivers.set(id,await resolveDispatchDriver(id,async uid=>(await tx.get(db.collection('users').doc(uid))).data() ?? null));
    }

    const byStopId=new Map(source.allStops.map(stop=>[stop.id,stop]));
    const plans=normalized.flatMap((config,index)=>{
      const code=source.code+'-'+String.fromCharCode(65+index);
      const stops=config.stopIds.flatMap((id):PlaceValue[]=>byStopId.has(id) ? [byStopId.get(id)!] : [])
        .map((stop,index)=>({...stop,pointCode:code+'-'+String(index+1).padStart(3,'0')}));
      if (!stops.length) return [];
      const driver=config.driverId ? drivers.get(config.driverId) : undefined;
      const ref=db.collection('routes').doc();
      return [{ref,code,stops,driver,name:config.name || 'Rota '+String.fromCharCode(65+index)}];
    });

    const orders=new Map<string,DocumentReference|undefined>();
    for (const plan of plans) {
      for (const {orderNumber} of plan.stops) {
        if (!orderNumber || orders.has(orderNumber)) continue;
        const found=await tx.get(db.collection('orders').where('number','==',orderNumber).limit(1));
        orders.set(orderNumber,found.docs[0]?.ref);
      }
    }

    const updates=new Map<string,{ref:DocumentReference;routeId:string;code:string;dispatched:boolean}>();
    const logs:CreationLog[]=[];
    for (const plan of plans) {
      const {ref,code,stops,driver}=plan;
      tx.create(ref,{
        code,name:plan.name,origin:source.origin,stops,encodedPolyline:'',distanceMeters:0,duration:'0s',
        status:driver ? 'dispatched':'draft',source:'lunna',serviceId,serviceCode:source.code,
        lunnaOrderIds:stops.flatMap(s=>s.orderNumber ? [s.orderNumber] : []),visible:true,
        plannedDate:source.plannedDate || FieldValue.serverTimestamp(),createdBy:actorId,createdAt:FieldValue.serverTimestamp(),
        ...(driver ? {driverId:driver.id,driverInfo:{name:driver.name,vehicle:driver.vehicle}} : {}),
      });
      logs.push({id:ref.id,code,stopsCount:stops.length,serviceCode:source.code,pointCodes:stops.map(stop=>stop.pointCode),driver});
      for (const stop of stops) {
        const order=stop.orderNumber ? orders.get(stop.orderNumber) : undefined;
        if (order) updates.set(order.path,{ref:order,routeId:ref.id,code,dispatched:!!driver});
      }
    }
    for (const {ref,routeId,code,dispatched} of updates.values()) {
      tx.update(ref,{logisticsStatus:dispatched?'em_rota':'pendente',rotaExataRouteId:routeId,
        rotaExataRouteCode:code,updatedAt:FieldValue.serverTimestamp()});
    }
    const result:CreationResult={success:true,routes:logs.map(({id,code,stopsCount})=>({id,code,stopsCount})),
      serviceStatus:normalized.every(route=>route.driverId) ? 'dispatched':'organizing'};
    tx.update(service,{routeIds:result.routes.map(route=>route.id),status:result.serviceStatus,
      'stats.totalRoutes':result.routes.length,updatedAt:FieldValue.serverTimestamp()});
    tx.create(receipt,{result,actorId,createdAt:FieldValue.serverTimestamp()});
    return {result,logs};
  });
}
