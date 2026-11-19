type Confirmation = {
  deliveryStatus:'completed'|'failed';
  photoUrl:string|null;
  attemptPhotoUrl:string|null;
  reason:string|null;
  visited:boolean|null;
};

export function stopConfirmationProblem(status:unknown,outcome:Confirmation) {
  if (status!=='in_progress') return 'route_invalid_state';
  if (outcome.deliveryStatus==='completed') return outcome.photoUrl ? null:'route_invalid_media';
  if (!outcome.reason?.trim() || typeof outcome.visited!=='boolean') return 'route_invalid_outcome';
  return outcome.visited && !outcome.attemptPhotoUrl ? 'route_invalid_media':null;
}

export function confirmationReplay(previous:{digest:string}|undefined,digest:string,expected:string,current:string) {
  if (previous) return previous.digest===digest ? 'replay':'conflict';
  return expected===current ? 'new':'stale';
}

function point(value:unknown) {
  if (!value || typeof value!=='object') return null;
  const {lat,lng}=value as {lat?:unknown;lng?:unknown};
  return typeof lat==='number' && typeof lng==='number' && Math.abs(lat)<=90 && Math.abs(lng)<=180 ? {lat,lng}:null;
}

export function deliveryDistanceProblem(origin:unknown,destination:unknown,maxDistance:number) {
  const from=point(origin);
  const to=point(destination);
  if (!from || !to) return 'route_delivery_location';
  const radians=Math.PI/180;
  const haversine=Math.sin((to.lat-from.lat)*radians/2)**2 +
    Math.cos(from.lat*radians)*Math.cos(to.lat*radians)*Math.sin((to.lng-from.lng)*radians/2)**2;
  const km=12742*Math.asin(Math.sqrt(Math.min(1,Math.max(0,haversine))));
  return km>maxDistance ? 'route_delivery_distance':null;
}

export function deliveryValidation(settings:{deliveryDistanceValidation?:unknown;maxDeliveryDistance?:unknown}|undefined) {
  const distance=settings?.maxDeliveryDistance;
  return {enabled:settings?.deliveryDistanceValidation===true,
    maxDistance:typeof distance==='number' && Number.isFinite(distance) && distance>0 ? distance:0.5};
}
