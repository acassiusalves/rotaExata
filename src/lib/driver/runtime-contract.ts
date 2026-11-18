import type { PlaceValue, RouteChangeNotification, RouteInfo } from '../types';

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const pick = (data: RecordValue, keys: string[]) => Object.fromEntries(keys.filter(key => data[key] !== undefined).map(key => [key,data[key]]));

export type DriverRoute = Omit<RouteInfo,'status'|'completedAt'|'startedAt'> & {
  id: string; status: 'dispatched'|'in_progress'|'completed'|'completed_auto';
  plannedDate?: string | null; completedAt?: string | null; startedAt?: string | null;
  name: string; origin: PlaceValue; driverInfo?: { name?: string;vehicle?: unknown;plate?: string };
};
export type DriverDeliveryValidation = { enabled: boolean; maxDistance: number };
export type DriverNotice = { notification: RouteChangeNotification; fingerprint: string };
export type DriverOverview = {
  uid: string; displayName: string; email?: string; photoURL?: string;
  phone?: string; vehicle?: { type?:string; plate?:string; model?:string; color?:string } | string;
  createdAt?: string | null; totalDeliveries?:number; cnh?: string; cpf?: string; city?: string;
};
export type DriverSettings = { notifications: boolean; darkMode: boolean; autoNavigation: boolean; keepScreenOn: boolean; pushRevision: number };
export type DriverInbox = {
  id: string; type: string; title: string; message: string; priority?: string;
  opened: boolean; timestamp: string | null; openedAt?: string | null;
  routeId?: string; routeName?: string; reportId?: string; link?: string;
};

export function driverOwnsRoute(route: RecordValue | undefined, sourceUid: string) {
  return Boolean(route && sourceUid && route.driverId === sourceUid);
}

export function driverTimestamp(value: unknown) {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') value=value.toDate();
  const date = value instanceof Date ? value : typeof value==='string' || typeof value==='number' ? new Date(value) : null;
  return date && Number.isFinite(date.valueOf()) ? date.toISOString() : null;
}

const placeFields = ['id','pointCode','placeId','address','addressString','lat','lng','city','cidade','uf','neighborhood',
  'bairro','street','rua','number','numero','complemento','customerName','phone','deliveryStatus','wentToLocation',
  'photoUrl','attemptPhotoUrl','failureReason','notes','orderNumber','lunnaClientCode','hasExchangeItems','operationType',
  'expectedValue','wasModified','modificationType','editedByDriver','deliveredItemIds','timeWindowStart','timeWindowEnd',
  'hasTimePreference','previousRouteId','fromRouteId','originalSequence','pending'];
function serializePlace(value: unknown) {
  const source=object(value);
  const payments=Array.isArray(source.payments) ? source.payments.map(payment => pick(object(payment),['id','method','value','installments','pixType'])) : undefined;
  const items=Array.isArray(source.items) ? source.items.map(item => pick(object(item),[
    'id','code','sku','name','description','quantity','price','unitPrice','value','total','subtotal','tipo','productId','isExchange',
  ])) : undefined;
  return {...pick(source,placeFields), ...(payments ? {payments}:{}), ...(items ? {items}:{}),
    ...(source.completedAt ? {completedAt:driverTimestamp(source.completedAt)}:{}),
  } as unknown as PlaceValue;
}
export function serializeDriverRoute(id: string,data: RecordValue): DriverRoute {
  return {
    ...pick(data,['code','status','distanceMeters','duration','encodedPolyline','pendingChanges','currentStopIndex','source','serviceId','serviceCode']),
    id,name: typeof data.name==='string' ? data.name : 'Rota',
    stops: Array.isArray(data.stops) ? data.stops.map(serializePlace):[],
    origin:serializePlace(data.origin),
    driverInfo:pick(object(data.driverInfo),['name','vehicle','plate']),
    plannedDate:driverTimestamp(data.plannedDate), completedAt:driverTimestamp(data.completedAt ?? data.autoCompletedAt),startedAt:driverTimestamp(data.startedAt),
  } as DriverRoute;
}

export function driverMediaObject(routeId: string,stopId: string,kind:'delivery'|'attempt',uploadId: string) {
  for (const id of [routeId,stopId]) {
    if (!/^[\p{L}\p{N}_.:-]{1,160}$/u.test(id) || id==='.' || id==='..') throw new Error('invalid_media_path');
  }
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(uploadId)) throw new Error('invalid_media_path');
  return (kind==='delivery'?'delivery-photos/':'delivery-attempt-photos/')+routeId+'/'+stopId+'/'+uploadId;
}
