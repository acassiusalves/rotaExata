import {activeDriverStop,driverOwnsRoute} from './runtime-contract.ts';

export const protectedPhotoPrefix='/api/driver/media/';
export const protectedPhotoPath=(id:string)=>protectedPhotoPrefix+id;
export const isProtectedPhoto=(src:string)=>/^\/api\/driver\/media\/[a-f0-9-]{36}$/i.test(src);

export function driverMayReadPhoto(uid:string,route:Record<string,unknown>|undefined,path:string) {
  return driverOwnsRoute(route,uid) && Array.isArray(route?.stops) && route.stops.some(stop=>
    activeDriverStop(stop) && (stop.photoUrl===path || stop.attemptPhotoUrl===path));
}
