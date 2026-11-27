import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { factsHash, plannedFingerprint, protectCompletion, sourceStopKey, timestampIso } from '../../../../functions/src/earnings-source-adapter';
import { getRouteChangeNotificationFingerprint } from '@/lib/route-change-fingerprint';
import { activeDriverStop } from '@/lib/driver/runtime-contract';
import { finishReadiness, routeActionLogLine } from '@/lib/driver/route-lifecycle';
import type { RouteAssist } from '@/lib/driver/assist-policy';
import { confirmationReplay,deliveryDistanceProblem,deliveryValidation,stopConfirmationProblem } from '@/lib/driver/stop-policy';
import { getStopIdentityKey } from '@/lib/route-stop-utils';
import { clearRouteChangeFlags, updateStopByIdentity } from '@/lib/route-stop-reconciliation';
import type { PlaceValue, RouteChangeNotification } from '@/lib/types';
import { earningsErrorResponse, readJsonBody } from './transport';

const routeId = z.string().min(1).max(150).regex(/^[^/]+$/);
const stopIdentity = z.object({
  id: z.string().max(150).optional(), pointCode: z.string().max(150).optional(),
  placeId: z.string().optional(), orderNumber: z.string().max(150).optional(),
});
const nullableText = (size: number) => z.string().max(size).nullable();
const photoUrl = z.union([z.string().url().max(4096).regex(/^https:\/\/|^http:\/\/127\.0\.0\.1:9198\//),
  z.string().regex(/^\/api\/driver\/media\/[0-9a-f-]{36}$/i)]).nullable();
const patch = z.object({
  deliveryStatus: z.enum(['completed','failed']),
  notes: nullableText(4000),
  failureReason: nullableText(500),
  wentToLocation: z.boolean().nullable(),
  payments: z.array(z.object({
    id: z.string().max(150), method: z.string().max(100), value: z.number().finite().nonnegative(),
    installments: z.number().int().min(1).max(100).optional(), pixType: z.enum(['qrcode','cnpj']).optional(),
  })).max(30).nullable(),
  deliveredItemIds: z.array(z.string().max(150)).max(300).nullable(),
  photoUrl,
  attemptPhotoUrl: photoUrl,
}).strict();
const actions = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), routeId }).strict(),
  z.object({ action: z.literal('finish'), routeId }).strict(),
  z.object({ action: z.literal('confirm'), routeId, targetStop: stopIdentity, patch, requestId:z.string().uuid().optional(),expectedRevision:z.string().regex(/^[a-f0-9]{64}$/).optional(),media:z.object({delivery:z.string().uuid().optional(),attempt:z.string().uuid().optional()}).optional() }).strict(),
  z.object({ action: z.literal('acknowledge'), routeId, fingerprint: z.string().min(1).max(60000) }).strict(),
]);

export async function performDriverRouteAction(request: Request, uid: string, authority: {canonical?:boolean;bindMedia?:boolean;assist?:RouteAssist} = {}) {
  if (!adminDb) return Response.json({ code: 'route_unavailable' }, { status: 503 });
  let input: z.infer<typeof actions>;
  try {
    const parsed = actions.safeParse(await readJsonBody(request,70000));
    if (!parsed.success) {
      console.warn(routeActionLogLine({ action: 'invalid', routeId: 'unknown', uid, httpStatus: 400, code: 'route_invalid_request',
        ...(authority.assist ? { assistGrantId: authority.assist.grantId } : {}) }));
      return Response.json({ code: 'route_invalid_request' }, { status: 400 });
    }
    input = parsed.data;
  } catch (error) { return earningsErrorResponse(error); }

  const db = adminDb;
  const routeRef = db.collection('routes').doc(input.routeId);
  const userRef = db.collection('users').doc(uid);
  const evidenceRef = db.collection('rotaEarningRouteEvidence').doc(input.routeId);
  const assist = authority.assist;
  const context = { action: input.action, routeId: input.routeId, uid, ...(assist ? { assistGrantId: assist.grantId } : {}) };
  try {
    const result = await db.runTransaction(async tx => {
      const [routeSnap, profile, proof] = await tx.getAll(routeRef,userRef,evidenceRef);
      const data = routeSnap.data();
      const user = profile.data();
      if (!data || data.driverId !== uid || !user ||
          (!authority.canonical && (user.role !== 'driver' || user.active === false || user.disabled === true || user.mustChangePassword))) {
        return { status: 403, body: { code: 'route_access_denied' } };
      }
      const stops = (Array.isArray(data.stops) ? data.stops : []) as PlaceValue[];
      const now = Timestamp.now();
      const evidence = proof.data();
      // Operador do painel agindo em nome do motorista: registra quem agiu. A remuneração não depende de marca:
      // parada confirmada pelo operador fica sem confirmação do motorista e é atestada na conferência.
      const assisted = assist ? { by: assist.staffSourceUid, name: assist.staffName, grantId: assist.grantId, at: now } : null;
      const markRoute = assisted ? { staffAssist: assisted } : {};
      const actorName = assist?.staffName ?? (user.displayName || user.name || 'Motorista');
      const logAssist = (eventType: string, action: string) => {
        if (!assist) return;
        tx.create(db.collection('activity_log').doc(), {
          eventType, userId: assist.staffSourceUid, canonicalUserId: assist.staffUserId, userName: assist.staffName,
          entityType: 'route', entityId: input.routeId, routeId: input.routeId, routeCode: data.code ?? null,
          serviceId: data.serviceId ?? null, serviceCode: data.serviceCode ?? null, action,
          metadata: { onBehalfOf: uid, assistGrantId: assist.grantId }, timestamp: now,
        });
      };
      if (input.action === 'start') {
        if (data.status === 'in_progress') return { status: 200, body: { ok: true } };
        if (data.status !== 'dispatched') {
          return { status: 409, body: { code: 'route_invalid_state', routeStatus: typeof data.status === 'string' ? data.status : null } };
        }
        tx.update(routeRef, { status: 'in_progress', startedAt: now, currentStopIndex: 0, ...markRoute });
        tx.set(evidenceRef, { start: { driverUid: uid, plan: plannedFingerprint(data), confirmations: {}, startedAt: now }, completion: null });
        logAssist('route_started', 'Rota iniciada pelo painel em nome do motorista');
        return { status: 200, body: { ok: true } };
      }
      if (input.action === 'acknowledge') {
        const noticeRef = db.collection('routeChangeNotifications').doc(input.routeId);
        const notice = (await tx.get(noticeRef)).data() as RouteChangeNotification | undefined;
        if (!notice || notice.driverId !== uid || getRouteChangeNotificationFingerprint(notice) !== input.fingerprint) {
          return { status: 409, body: { code: 'route_notice_changed' } };
        }
        tx.update(routeRef, { stops: clearRouteChangeFlags(stops), pendingChanges: false, updatedAt: now });
        tx.update(noticeRef, { acknowledged: true, acknowledgedAt: now });
        logAssist('route_changes_acknowledged', 'Alterações da rota confirmadas pelo painel em nome do motorista');
        return { status: 200, body: { ok: true } };
      }
      if (input.action === 'finish') {
        if (data.status === 'completed') return { status: 200, body: { ok: true } };
        const { ready, ...progress } = finishReadiness(data.status, stops);
        if (!ready) return { status: 409, body: { code: 'route_not_ready', ...progress } };
        const closed = { status: 'completed', completedAt: now };
        // Finalização pelo painel usa o tipo de evidência do painel; só há evidência se o motorista confirmou cada parada.
        const completion = protectCompletion({ ...data, ...closed, earningsSourceStart: evidence?.start },
          assist ? 'admin-server-v1' : 'driver-server-v1');
        tx.update(routeRef, { ...closed, ...markRoute });
        tx.set(evidenceRef, { completion: completion ?? null }, { merge: true });
        logAssist('route_completed', 'Rota finalizada pelo painel em nome do motorista');
        return { status: 200, body: { ok: true } };
      }

      const problem=(code:string,status=422)=>({status,body:{code}});
      const commandRef=authority.bindMedia && input.requestId
        ? db.collection('driverRouteCommands').doc(factsHash([uid,input.routeId,input.requestId])) : null;
      if (authority.bindMedia && (!commandRef || !input.expectedRevision)) return problem('route_invalid_request',400);
      const digest=factsHash(input);
      const previous=commandRef ? (await tx.get(commandRef)).data() : undefined;
      if (previous) return confirmationReplay(previous as {digest:string},digest,'','')==='replay'
        ? {status:200,body:previous.response}:problem('route_request_conflict',409);

      const visited = input.patch.deliveryStatus === 'failed' ? input.patch.wentToLocation : null;
      if (authority.bindMedia) {
        const failure=stopConfirmationProblem(data.status,{...input.patch,reason:input.patch.failureReason,visited});
        if (failure) return problem(failure,failure==='route_invalid_state' ? 409:422);
      } else if (!['dispatched','in_progress','completed','completed_auto'].includes(data.status)) {
        return problem('route_invalid_state',409);
      }
      const driverPatch = { ...input.patch, wentToLocation: visited, completedAt: now } as unknown as Partial<PlaceValue>;
      const mutation = updateStopByIdentity(stops,input.targetStop,driverPatch);
      if (!activeDriverStop(mutation.previousStop)) return problem('route_stop_changed',409);
      if (authority.bindMedia) {
        const current=factsHash(mutation.previousStop);
        if (confirmationReplay(undefined,digest,input.expectedRevision!,current)!=='new') return problem('route_stop_changed',409);
        const settings=deliveryValidation((await tx.get(db.doc('settings/general'))).data());
        if (settings.enabled && input.patch.deliveryStatus==='completed' && !assist) {
          const location=data.currentLocation;
          const measured=location?.timestamp?.toMillis?.();
          const validTime=typeof measured==='number' && measured<=now.toMillis() && now.toMillis()-measured<=120000;
          const failure=deliveryDistanceProblem(validTime ? location:undefined,mutation.previousStop,settings.maxDistance);
          if (failure) return problem(failure);
        }
        const stopKey=getStopIdentityKey(mutation.previousStop);
        for (const [kind,field] of [['delivery','photoUrl'],['attempt','attemptPhotoUrl']] as const) {
          const url=input.patch[field];
          if (!url || url===mutation.previousStop[field]) continue;
          const id=input.media?.[kind];
          const media=id ? (await tx.get(db.collection('driverDeliveryMedia').doc(id))).data() : null;
          if (!media || media.uid!==uid || media.routeId!==input.routeId || media.stopKey!==stopKey || media.kind!==kind || media.url!==url) {
            return { status:422,body:{code:'route_invalid_media'} };
          }
          if (url.startsWith('http:') && process.env.FIREBASE_STORAGE_EMULATOR_HOST!=='127.0.0.1:9198') {
            return { status:422,body:{code:'route_invalid_media'} };
          }
        }
      } else if (input.patch.photoUrl?.startsWith('http:') || input.patch.attemptPhotoUrl?.startsWith('http:')) {
        return { status:422,body:{code:'route_invalid_media'} };
      }
      const orderNumber=mutation.previousStop.orderNumber;
      const orderCandidates=authority.bindMedia && data.source==='lunna' && orderNumber
        ? await tx.get(db.collection('orders').where('number','==',orderNumber).limit(5)):null;
      const linkedOrders=orderCandidates?.docs.filter(order=>order.data().rotaExataRouteId===input.routeId) ?? [];
      const prior = mutation.previousStop.deliveryStatus;
      const wasPreviouslyFinalized = prior === 'completed' || prior === 'failed';
      const retainedTime=prior===input.patch.deliveryStatus && (mutation.previousStop.wentToLocation ?? null)===visited &&
        timestampIso(mutation.previousStop.completedAt) ? mutation.previousStop.completedAt:now;
      const updatedStop = wasPreviouslyFinalized
        ? { ...mutation.updatedStop, completedAt:retainedTime, ...(assist ? {}:{editedByDriver:true}),editedAt:now }
        : mutation.updatedStop;
      const updatedStops = mutation.stops.map((stop,index)=>index===mutation.index ? updatedStop:stop);
      tx.update(routeRef, { stops: updatedStops, currentStopIndex: mutation.index + 1, updatedAt: now, ...markRoute });
      if (prior !== 'completed' && input.patch.deliveryStatus === 'completed') tx.update(userRef, { totalDeliveries: FieldValue.increment(1) });

      if (authority.bindMedia) {
        const pointId=updatedStop.id || updatedStop.placeId || updatedStop.pointCode;
        tx.create(db.collection('activity_log').doc(),{
          eventType:input.patch.deliveryStatus==='completed'?'point_completed':'point_failed',
          userId:assist?.staffSourceUid ?? uid,userName:actorName,...(assist ? {canonicalUserId:assist.staffUserId}:{}),entityType:'point',entityId:pointId ?? null,
          entityCode:updatedStop.pointCode ?? null,routeId:input.routeId,routeCode:data.code ?? null,
          serviceId:data.serviceId ?? null,serviceCode:data.serviceCode ?? null,pointId:pointId ?? null,pointCode:updatedStop.pointCode ?? null,
          action:input.patch.deliveryStatus==='completed'?'Entrega confirmada':'Falha de entrega registrada',
          changes:[{field:'deliveryStatus',oldValue:prior ?? null,newValue:input.patch.deliveryStatus,fieldLabel:'Status'}],
          metadata:{photoUrl:updatedStop.photoUrl ?? null,attemptPhotoUrl:updatedStop.attemptPhotoUrl ?? null,
            failureReason:updatedStop.failureReason ?? null,wentToLocation:visited,address:updatedStop.address ?? null,
            customerName:updatedStop.customerName ?? null,notes:updatedStop.notes ?? null,
            ...(assist ? {onBehalfOf:uid,assistGrantId:assist.grantId}:{})},
          timestamp:now,
        });
        if (linkedOrders.length===1) {
          const logisticsStatus=input.patch.deliveryStatus==='completed'?'entregue':'falha';
          tx.update(linkedOrders[0].ref,{logisticsStatus,updatedAt:now});
        }
        if (wasPreviouslyFinalized) tx.create(db.collection('notifications').doc(),{
          type:'delivery_edited',title:assist ? 'Entrega editada pelo painel':'Entrega editada pelo motorista',
          message:`${actorName} editou uma parada na rota ${data.name || data.code || input.routeId}.`,
          priority:'normal',routeId:input.routeId,routeName:data.name ?? null,stopIndex:mutation.index,driverId:uid,
          driverName:user.displayName || user.name || 'Motorista',read:false,opened:false,openedAt:null,timestamp:now,forAdmin:true,
        });
      }

      const key = sourceStopKey(updatedStop as unknown as Record<string, unknown>);
      if (assist) {
        // Confirmação do operador não vale como confirmação do motorista: a parada fica para atestado na conferência.
        const recorded = evidence?.start?.confirmations;
        if (key && recorded && Object.hasOwn(recorded, key)) {
          tx.set(evidenceRef, { start: { confirmations: { [key]: FieldValue.delete() } } }, { merge: true });
        }
      } else if (key && evidence?.start?.driverUid === uid && data.status === 'in_progress') {
        const confirmation = { status: input.patch.deliveryStatus, visited, workedAt:timestampIso(updatedStop.completedAt) };
        tx.set(evidenceRef, { start: { ...evidence.start, confirmations: { ...evidence.start.confirmations, [key]: confirmation } } }, { merge: true });
      }
      const response={updatedStop,stopIndex:mutation.index,wasPreviouslyFinalized};
      if (commandRef) tx.create(commandRef,{digest,response,createdAt:now});
      return { status:200,body:response };
    });
    if (result.status >= 400) {
      const { code, ...detail } = result.body as { code?: string } & Record<string, unknown>;
      console.warn(routeActionLogLine({ ...context, httpStatus: result.status, code: code ?? 'unknown', detail }));
    }
    return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && ['RouteStopNotFoundError','RouteStructureConflictError'].includes(error.name)) {
      console.warn(routeActionLogLine({ ...context, httpStatus: 409, code: 'route_stop_changed' }));
      return Response.json({ code: 'route_stop_changed' }, { status: 409 });
    }
    // Sem este log a exceção vira um 503 sem causa nos registros.
    console.error(routeActionLogLine({ ...context, httpStatus: 503, code: 'route_unavailable', error }));
    return Response.json({ code: 'route_unavailable' }, { status: 503 });
  }
}
