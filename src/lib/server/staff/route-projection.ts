import { driverTimestamp } from '../../driver/runtime-contract.ts';
import { staffPhotoReference,proofFields } from './legacy-photo.ts';
import { isSourceDriverAssignable } from '../../dispatch-driver.ts';
import type { PlaceValue,LunnaService,RouteInfo } from '../../types';

type Fields=Record<string,unknown>;
const row=(value:unknown):Fields=>value && typeof value==='object' && !Array.isArray(value) ? value as Fields:{};
const scalar=(value:unknown)=>typeof value==='string' || typeof value==='boolean' || (typeof value==='number' && Number.isFinite(value));
function project(value:unknown,fields:readonly string[]) {
  const data=row(value);
  return Object.fromEntries(fields.filter(key=>scalar(data[key])).map(key=>[key,data[key]]));
}
function dates(data:Fields,fields:readonly string[]) {
  return Object.fromEntries(fields.filter(key=>data[key]!=null).map(key=>[key,driverTimestamp(data[key])]));
}
const strings=(value:unknown)=>Array.isArray(value) ? value.filter((item):item is string=>typeof item==='string'):[];
const items=(value:unknown,mapper:(item:unknown)=>object)=>Array.isArray(value) ? value.map(mapper):[];

const placeFields=['id','pointCode','placeId','address','addressString','addressSeverity','lat','lng','city','cidade','uf','state',
  'neighborhood','bairro','street','rua','number','numero','zipCode','cep','complemento','geocodedAddress','customerName','phone',
  'deliveryStatus','wentToLocation','failureReason','notes','orderNumber','lunnaClientCode',
  'hasExchangeItems','operationType','expectedValue','wasModified','modificationType','editedByDriver','timeWindowStart','timeWindowEnd',
  'hasTimePreference','previousRouteId','previousRouteCode','movedFromPointCode','fromRouteId','originalSequence','pending',
  'moveReason','movedBy','movedByName','reconciled','reconciledBy','reconciledMethod','aiExtractedValue','hasValidationIssues'] as const;
const placeDates=['arrivedAt','completedAt','reconciledAt','modifiedAt','movedAt','unlinkedAt'] as const;
export type StaffPlace = Omit<PlaceValue,typeof placeDates[number]> & Partial<Record<typeof placeDates[number],string|null>>;

export function projectStaffPlace(value:unknown) {
  const data=row(value);
  return {
    ...project(data,placeFields),
    ...dates(data,placeDates),
    ...(Array.isArray(data.deliveredItemIds) ? {deliveredItemIds:strings(data.deliveredItemIds)}:{}),
    ...(Array.isArray(data.validationIssues) ? {validationIssues:strings(data.validationIssues)}:{}),
    ...(data.originalAddressParts ? {originalAddressParts:project(data.originalAddressParts,['street','number','neighborhood','city','state','zipCode','rua','numero','bairro','cidade','uf','cep'])}:{}),
    ...(Array.isArray(data.payments) ? {payments:items(data.payments,payment=>project(payment,['id','method','value','installments','pixType']))}:{}),
    ...(Array.isArray(data.items) ? {items:items(data.items,item=>project(item,['id','code','description','quantity','subtotal','tipo']))}:{}),
  } as StaffPlace;
}
export function projectStaffEvidencePlace(routeId:string,value:unknown) {
  const data=row(value);
  return {...projectStaffPlace(value),...Object.fromEntries(proofFields.flatMap(field=>{
    const reference=staffPhotoReference(routeId,data[field]);
    return reference ? [[field,reference]]:[];
  }))};
}
const vehicleFields=['type','plate','model','color'];
function vehicle(value:unknown) {
  return {type:'',plate:'',...project(value,vehicleFields)};
}
const routeFields=['code','name','status','distanceMeters','duration','encodedPolyline','pendingChanges','currentStopIndex','source',
  'serviceId','serviceCode','routeDate','routeTime','period','driverId','lastModifiedBy','visible','color','createdBy','resentBy'];
const routeDates=['plannedDate','createdAt','updatedAt','dispatchedAt','completedAt','autoCompletedAt','startedAt','lastModifiedAt','resentAt'] as const;
function location(value:unknown) {
  return {
    ...project(value,['lat','lng','accuracy','heading','speed']),
    timestamp:driverTimestamp(row(value).timestamp),
  };
}
export type StaffRoute = Omit<RouteInfo,'stops'|'startedAt'|'completedAt'|'actualPath'|'currentLocation'|'lastModifiedAt'> &
  Partial<Record<typeof routeDates[number],string|null>> & {
    id:string;revision?:string;name:string;origin:StaffPlace;stops:StaffPlace[];driverId?:string;
    driverInfo?:{name:string;vehicle:ReturnType<typeof vehicle>};currentLocation?:ReturnType<typeof location>;
    actualPath?:ReturnType<typeof location>[];
    unassignedStops?:StaffPlace[];
    organizedRoutes?:{key?:string;name?:string;dispatched?:boolean;stops:StaffPlace[];info:Record<string,unknown>}[];
    routeNames?:Record<string,string>;
  };

export function projectStaffRoute(id:string,data:Fields,revision?:string):StaffRoute {
  const driver=row(data.driverInfo);
  return {
    name:'Rota',distanceMeters:0,duration:'0s',encodedPolyline:'',
    ...project(data,routeFields),
    ...dates(data,routeDates),
    id,revision,
    stops:Array.isArray(data.stops) ? data.stops.map(value=>projectStaffEvidencePlace(id,value)):[],
    origin:projectStaffPlace(data.origin),
    ...(Array.isArray(data.unassignedStops) ? {unassignedStops:data.unassignedStops.map(projectStaffPlace)}:{}),
    ...(Array.isArray(data.organizedRoutes) ? {organizedRoutes:data.organizedRoutes.map(value=>{
      const planned=row(value);
      return {...project(planned,['key','name','dispatched']),stops:items(planned.stops,projectStaffPlace) as StaffPlace[],
        info:project(planned.info,['distanceMeters','duration','encodedPolyline','color'])};
    })}:{}),
    ...(data.routeNames ? {routeNames:Object.fromEntries(Object.entries(row(data.routeNames)).filter(([key,name])=>
      /^[A-Z]{1,3}$/.test(key) && typeof name==='string')) as Record<string,string>} : {}),
    lunnaOrderIds:strings(data.lunnaOrderIds),
    ...(data.driverInfo ? {driverInfo:{name:typeof driver.name==='string'?driver.name:'Motorista',vehicle:vehicle(driver.vehicle)}}:{}),
    ...(data.currentLocation ? {currentLocation:location(data.currentLocation)}:{}),
    ...(Array.isArray(data.actualPath) ? {actualPath:data.actualPath.map(location)}:{}),
  };
}

const serviceDates=['plannedDate','createdAt','updatedAt','completedAt'] as const;
const serviceSearchFields=['customerName','address','phone','orderNumber'] as const;
export type StaffServiceSearchStop=Partial<Record<typeof serviceSearchFields[number],string>>;

function projectServiceSearchStop(value:unknown):StaffServiceSearchStop {
  const stop=row(value);
  return Object.fromEntries(serviceSearchFields.flatMap(field=>{
    const item=stop[field];
    return typeof item==='string' || typeof item==='number' ? [[field,String(item)]]:[];
  }));
}

export type StaffService = Pick<LunnaService,'code'|'name'|'source'|'status'> &
  Partial<Record<typeof serviceDates[number],string|null>> & {
    id:string; revision?:string; origin:StaffPlace; routeIds:string[]; lunnaOrderIds:string[];
    stats?:LunnaService['stats'];allStops?:StaffPlace[];searchStops?:StaffServiceSearchStop[];
  };
export function projectStaffService(id:string,data:Fields,includeStops:boolean,revision?:string):StaffService {
  const stats=row(data.stats);
  return {
    id,revision,code:'',name:'Serviço',source:'lunna',status:'organizing',
    ...project(data,['code','name','status']),
    ...dates(data,serviceDates),
    origin:projectStaffPlace(data.origin),
    routeIds:strings(data.routeIds),
    lunnaOrderIds:includeStops ? strings(data.lunnaOrderIds):[],
    ...(data.stats || Array.isArray(data.allStops) ? {stats:{
      totalRoutes:0,completedRoutes:0,
      totalDeliveries:Array.isArray(data.allStops) ? data.allStops.filter(stop=>!stop?.unlinkedAt).length:0,
      completedDeliveries:0,failedDeliveries:0,
      ...project(stats,['totalRoutes','completedRoutes','totalDeliveries','completedDeliveries','failedDeliveries']),
    }}:{}),
    ...(includeStops ? {allStops:Array.isArray(data.allStops) ? data.allStops.map(projectStaffPlace):[]}:{}),
    ...(!includeStops && Array.isArray(data.allStops) ? {searchStops:data.allStops.filter(stop=>!stop?.unlinkedAt).map(projectServiceSearchStop)}:{}),
  };
}

export function projectDispatchChoice(id:string,data:Fields) {
  const marker=project(data,['role','nativeDriverProvisioningId','nativeDriverReady','nativeDriverDispatchEnabled']);
  if (!isSourceDriverAssignable(marker) || data.active===false || data.disabled===true) return null;
  return {
    ...project(data,['email','phone','status','totalDeliveries','rating','photoURL']),
    id,name:String(data.displayName || data.name || 'Motorista'),
    vehicle:vehicle(data.vehicle),
    lastSeenAt:driverTimestamp(data.lastSeenAt),
  };
}
