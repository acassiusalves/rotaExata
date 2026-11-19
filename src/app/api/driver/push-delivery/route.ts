import {timingSafeEqual} from 'node:crypto';
import {FieldValue} from 'firebase-admin/firestore';
import {z} from 'zod';
import {adminDb} from '@/lib/firebase/admin';
import {nativeDriverEnabled} from '@/lib/driver/mode';
import {earningsScopeId} from '@/lib/server/earnings/actor';
import {privateJson} from '@/lib/server/earnings/store';
import {earningsErrorResponse,earningsRpc,EarningsError,readJsonBody} from '@/lib/server/earnings/transport';

export const runtime='nodejs';
const query=z.object({bindingId:z.string().uuid(),proof:z.string().regex(/^[a-f0-9]{64}$/),
  deliveryId:z.string().uuid().optional(),revoke:z.literal(true).optional()}).strict()
  .refine(body=>!body.deliveryId || !body.revoke);
const bindingSchema=z.object({
  proof:z.string().regex(/^[a-f0-9]{64}$/),token:z.string(),sourceUid:z.string().min(1).max(128),
  userId:z.string().uuid(),sessionId:z.string().uuid(),
});

export function GET() {return privateJson({native:nativeDriverEnabled});}

export async function POST(request:Request) {
  try {
    const db=adminDb;
    if (!nativeDriverEnabled || !db || !process.env.ROTA_EARNINGS_SOURCE_PROJECT ||
        process.env.FIREBASE_PROJECT_ID!==process.env.ROTA_EARNINGS_SOURCE_PROJECT) throw new EarningsError(404,'push_unavailable');
    const parsed=query.safeParse(await readJsonBody(request,1024));
    if (!parsed.success) throw new EarningsError(404,'push_unavailable');
    const {bindingId,proof,deliveryId,revoke}=parsed.data;
    const ref=db.collection('driverPushSessions').doc(bindingId);
    const raw=(await ref.get()).data();
    const state=bindingSchema.safeParse(raw);
    if (!state.success || !timingSafeEqual(Buffer.from(state.data.proof,'hex'),Buffer.from(proof,'hex'))) {
      throw new EarningsError(404,'push_unavailable');
    }
    const binding=state.data;
    const user=db.collection('users').doc(binding.sourceUid);
    if (revoke) {
      await db.runTransaction(async tx=>{
        const [current,profile]=await tx.getAll(ref,user);
        if (!current.exists) return;
        if (profile.data()?.fcmSessionBindingId===bindingId) {
          tx.update(user,{fcmToken:FieldValue.delete(),fcmSessionBindingId:FieldValue.delete(),fcmTokenUpdatedAt:FieldValue.serverTimestamp()});
        }
        tx.delete(ref);
      });
      return privateJson({ok:true});
    }
    const profile=(await user.get()).data();
    if (profile?.fcmSessionBindingId!==bindingId || profile.fcmToken!==binding.token ||
        !await earningsRpc<boolean>('rota_driver_push_session_valid',{
          p_user_id:binding.userId,p_session_id:binding.sessionId,p_scope_id:earningsScopeId(),p_source_uid:binding.sourceUid,
        })) throw new EarningsError(404,'push_unavailable');
    if (!deliveryId) return privateJson({ok:true});
    const delivery=raw?.deliveries?.[deliveryId];
    if (!delivery || typeof delivery.expiresAt!=='number' || delivery.expiresAt<=Date.now()) throw new EarningsError(404,'push_unavailable');
    return privateJson({routeId:typeof delivery.routeId==='string' ? delivery.routeId:null});
  } catch(error) {return earningsErrorResponse(error);}
}
