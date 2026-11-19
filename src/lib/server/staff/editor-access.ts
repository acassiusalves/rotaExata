import type { Firestore,DocumentSnapshot } from 'firebase-admin/firestore';
import { requireStaffActor,type StaffActor } from './actor';
import { staffSourceDb } from './source';
import { staffEditorPath,staffPathAllowed,type StaffEditorSurface } from '../../staff/access';
import { EarningsError } from '../earnings/transport';

export async function requireStaffEditor(request:Request,surface:StaffEditorSurface) {
  const actor=await requireStaffActor(request,'session');
  const path=staffEditorPath(surface);
  if (!path || !staffPathAllowed(actor,path)) throw new EarningsError(403,'staff_access_denied');
  const db=staffSourceDb(actor);
  if ('anchor' in surface) {
    const collection=surface.view==='route-follow' ? 'routes':'services';
    const anchor=await db.collection(collection).doc(surface.anchor).get();
    if (!anchor.exists) throw new EarningsError(404,'staff_resource_not_found');
  }
  return {actor,db};
}

export function editorCanReadRoute(actor:StaffActor,surface:StaffEditorSurface,
  route:{id:string;status?:unknown;serviceId?:unknown}) {
  const specific='/routes/'+route.id+'/acompanhar';
  if ([actor.policy,actor.rotaPolicy].some(policy=>policy.inactivePages.includes(specific))) return false;
  if (surface.view==='route-follow' && route.id===surface.anchor) return true;
  if ((surface.view==='service-follow'||surface.view==='service-organize') && route.serviceId===surface.anchor) return true;
  if ((surface.view==='organize'||surface.view==='organize-follow') && route.status==='draft' && !route.serviceId) return true;
  return staffPathAllowed(actor,specific);
}

export function editorCanReadService(actor:StaffActor,surface:StaffEditorSurface,id:string) {
  if ((surface.view==='service-follow'||surface.view==='service-organize') && id===surface.anchor) return true;
  return staffPathAllowed(actor,'/routes/service/'+id+'/acompanhar');
}

export async function assertEditorResources(db:Firestore,actor:StaffActor,surface:StaffEditorSurface,refs:{
  routeIds?:string[];serviceId?:string;creating?:boolean;draftId?:string;replayedDraft?:()=>Promise<boolean>;
}) {
  const routeIds=[...new Set([...(refs.routeIds ?? []),...(refs.draftId ? [refs.draftId]:[])])];
  const docs=routeIds.length ? await db.getAll(...routeIds.map(id=>db.collection('routes').doc(id))):[];
  for (const doc of docs) {
    if (doc.exists && editorCanReadRoute(actor,surface,editorRouteTarget(doc))) continue;
    if (!doc.exists && doc.id===refs.draftId && editorCanReadRoute(actor,surface,{id:doc.id,status:'draft'}) &&
        await refs.replayedDraft?.()) continue;
    throw new EarningsError(403,'staff_access_denied');
  }
  if (refs.serviceId && !editorCanReadService(actor,surface,refs.serviceId)) {
    throw new EarningsError(403,'staff_access_denied');
  }
  if (refs.creating && !['organize','organize-follow','service-organize'].includes(surface.view) &&
      !staffPathAllowed(actor,'/routes/organize')) throw new EarningsError(403,'staff_access_denied');
}

export function editorRouteTarget(doc:DocumentSnapshot) {
  return {id:doc.id,status:doc.get('status'),serviceId:doc.get('serviceId')};
}
