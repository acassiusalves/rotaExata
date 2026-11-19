import { FieldValue,type Firestore } from 'firebase-admin/firestore';
import { z } from 'zod';
import { requireStaffActor } from '@/lib/server/staff/actor';
import { staffSourceDb } from '@/lib/server/staff/source';
import { staffRouteRevision } from '@/lib/server/staff/route-commands';
import { routeRevisionSchema } from '@/lib/staff/route-contract';
import { EarningsError,earningsErrorResponse,readJsonBody } from '@/lib/server/earnings/transport';
import { privateJson } from '@/lib/server/earnings/store';

const command=z.object({key:z.string().trim().regex(/^AIza[0-9A-Za-z_-]{30,70}$/),expectedRevision:routeRevisionSchema.nullable()}).strict();
const path='settings/googleMaps';
async function status(db:Firestore) {
  const settings=await db.doc(path).get();
  return {
    configured:(typeof settings.get('apiKey')==='string' && settings.get('apiKey').length>0) || !!process.env.GMAPS_SERVER_KEY,
    browserConfigured:!!process.env.NEXT_PUBLIC_GMAPS_KEY,
    revision:staffRouteRevision(settings.updateTime) ?? null,
  };
}
async function validateKey(key:string) {
  const point={location:{latLng:{latitude:-16.6799,longitude:-49.255}}};
  const response=await fetch('https://routes.googleapis.com/directions/v2:computeRoutes',{
    method:'POST',headers:{'content-type':'application/json','x-goog-api-key':key,'x-goog-fieldmask':'routes.duration'},
    body:JSON.stringify({
      origin:point,destination:{location:{latLng:{latitude:-16.683,longitude:-49.257}}},travelMode:'DRIVE',
    }),
    cache:'no-store',redirect:'error',signal:AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new EarningsError(422,'staff_maps_key_invalid');
}

export async function GET(request:Request) {
  try {
    const actor=await requireStaffActor(request,'integration:manage');
    return privateJson(await status(staffSourceDb(actor)));
  } catch(error) {return earningsErrorResponse(error);}
}

export async function PATCH(request:Request) {
  try {
    const actor=await requireStaffActor(request,'integration:manage');
    const parsed=command.safeParse(await readJsonBody(request,2048));
    if (!parsed.success) throw new EarningsError(422,'staff_maps_key_invalid');
    const {key,expectedRevision}=parsed.data;
    const db=staffSourceDb(actor);
    const ref=db.doc(path);
    const initial=await ref.get();
    if ((staffRouteRevision(initial.updateTime) ?? null)!==expectedRevision) throw new EarningsError(409,'staff_settings_conflict');
    await validateKey(key);
    await db.runTransaction(async tx=>{
      const snapshot=await tx.get(ref);
      if ((staffRouteRevision(snapshot.updateTime) ?? null)!==expectedRevision) throw new EarningsError(409,'staff_settings_conflict');
      tx.set(ref,{apiKey:key,updatedAt:FieldValue.serverTimestamp(),updatedBy:actor.sourceUid ?? actor.userId},{merge:true});
      tx.create(db.collection('activity_log').doc(),{
        timestamp:FieldValue.serverTimestamp(),eventType:'settings_updated',entityType:'settings',entityId:'googleMaps',
        canonicalUserId:actor.userId,userId:actor.sourceUid ?? actor.userId,userName:actor.name,action:'Credencial de rotas atualizada',
      });
    });
    return privateJson(await status(db));
  } catch(error) {return earningsErrorResponse(error);}
}
