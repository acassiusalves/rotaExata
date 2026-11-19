import { createHash } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import { isProtectedPhoto } from '../../driver/photo-policy.ts';
import { staffPhotoReferencePrefix } from '../../staff/photo-reference.ts';
import { routeDocumentId } from '../../staff/route-contract.ts';
import { staffRouteCanReadPhoto,type StaffPhotoView } from '../../staff/media-policy.ts';
import { readLegacyReportReceipt } from './legacy-photo-reader.ts';
import { EarningsError } from '../earnings/transport.ts';

export const proofFields=['photoUrl','attemptPhotoUrl','signatureUrl'] as const;
const sha=(source:string)=>createHash('sha256').update(source).digest('hex');

export function staffPhotoReference(routeId:string,source:unknown) {
  if (typeof source!=='string' || !source) return undefined;
  if (isProtectedPhoto(source)) return source;
  return staffPhotoReferencePrefix+'legacy.'+Buffer.from(routeId).toString('base64url')+'.'+sha(source);
}

export async function readStaffLegacyPhoto(db:Firestore,id:string,view:StaffPhotoView,canRead?:(routeId:string,data:Record<string,unknown>)=>boolean) {
  const parts=/^legacy\.([A-Za-z0-9_-]{1,800})\.([a-f0-9]{64})$/.exec(id);
  if (!parts) throw new EarningsError(404,'route_not_found');
  const routeId=routeDocumentId.safeParse(Buffer.from(parts[1],'base64url').toString());
  if (!routeId.success || Buffer.from(routeId.data).toString('base64url')!==parts[1]) throw new EarningsError(404,'route_not_found');
  const route=(await db.collection('routes').doc(routeId.data).get()).data();
  const stops=Array.isArray(route?.stops) ? route.stops:[];
  const source=stops.flatMap(stop=>proofFields.map(field=>stop?.[field])).find(value=>
    typeof value==='string' && !isProtectedPhoto(value) && sha(value)===parts[2]);
  if (!source || !route || (canRead && !canRead(routeId.data,route)) || !staffRouteCanReadPhoto(route,source,view)) throw new EarningsError(404,'route_not_found');
  if (source.startsWith('data:image/') && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+\/=]+$/.test(source) &&
      source.length<=8*1024*1024*4/3) return source;
  return readLegacyReportReceipt(source,process.env.FIREBASE_STORAGE_BUCKET);
}
