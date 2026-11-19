import {getStorage} from 'firebase-admin/storage';
import {z} from 'zod';
import {adminApp,adminDb} from '@/lib/firebase/admin';
import {driverMediaObject} from '@/lib/driver/runtime-contract';
import {driverMayReadPhoto,protectedPhotoPath} from '@/lib/driver/photo-policy';
import {EarningsError} from '@/lib/server/earnings/transport';

export async function readDeliveryPhoto(id:string,authority:{sourceUid?:string;routeId?:string;routeAllowed?:(route:Record<string,unknown>|undefined,path:string,routeId:string)=>boolean}) {
  if (!z.string().uuid().safeParse(id).success) throw new EarningsError(404,'route_not_found');
  const bucket=process.env.FIREBASE_STORAGE_BUCKET;
  if (!adminDb || !adminApp || !bucket) throw new EarningsError(503,'route_media_unavailable');
  const receipt=(await adminDb.collection('driverDeliveryMedia').doc(id).get()).data();
  if (!receipt || receipt.url!==protectedPhotoPath(id) || !/^image\/(jpeg|png|webp)$/.test(receipt.contentType ?? '') ||
      (authority.routeId && receipt.routeId!==authority.routeId)) throw new EarningsError(404,'route_not_found');
  if (authority.sourceUid || authority.routeAllowed) {
    const route=(await adminDb.collection('routes').doc(receipt.routeId).get()).data();
    if ((authority.sourceUid && !driverMayReadPhoto(authority.sourceUid,route,receipt.url)) ||
        (authority.routeAllowed && !authority.routeAllowed(route,receipt.url,receipt.routeId))) throw new EarningsError(404,'route_not_found');
  }
  const path=driverMediaObject(receipt.routeId,receipt.stopKey,receipt.kind,id);
  const [bytes]=await getStorage(adminApp).bucket(bucket).file(path).download();
  return 'data:'+receipt.contentType+';base64,'+bytes.toString('base64');
}
