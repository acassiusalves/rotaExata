import {randomUUID} from "node:crypto";
import type {TokenMessage} from "firebase-admin/messaging";
import {blocksLegacyDriverAccountAction} from "./legacy-driver-accounts";

const FIVE_MINUTES=300000;
type Grant={
  proof?:string;token?:string;sourceUid?:string;sessionId?:string;
  deliveries?:Record<string,{routeId:string|null;expiresAt:number}>;
};

export function boundPushMessage(token:string,bindingId:string,deliveryId:string):TokenMessage {
  return {token,data:{boundPush:"1",bindingId,deliveryId},
    android:{priority:"high",ttl:FIVE_MINUTES},webpush:{headers:{TTL:"300"}}};
}

export async function driverPushMessage(
  db:FirebaseFirestore.Firestore,sourceUid:string,profile:FirebaseFirestore.DocumentData|undefined,legacy:TokenMessage,
  validate?:(bindingId:string,proof:string)=>Promise<boolean>,
):Promise<TokenMessage|null> {
  const transition=(await db.doc("rotaAuthTransition/driver").get()).data();
  const bindingId=profile?.fcmSessionBindingId;
  const protectedDriver=typeof bindingId==="string" || (transition?.mode==="supabase" &&
    (profile?.role==="driver" || blocksLegacyDriverAccountAction(transition,{uid:sourceUid})));
  if (!protectedDriver) {
    return transition?.mode==="supabase" ? {...legacy,data:{...legacy.data,legacyPush:"1"}}:legacy;
  }
  if (typeof bindingId!=="string" || !/^[0-9a-f-]{36}$/i.test(bindingId)) return null;
  const ref=db.collection("driverPushSessions").doc(bindingId);
  const grant=(await ref.get()).data() as Grant|undefined;
  if (!grant || grant.sourceUid!==sourceUid || grant.token!==legacy.token || !grant.proof) return null;
  try {
    if (validate) {
      if (!await validate(bindingId,grant.proof)) return null;
    } else {
      const configured=new URL(process.env.ROTA_EARNINGS_EVENTS_URL ?? "");
      if (configured.protocol!=="https:" || configured.username || configured.password ||
          configured.pathname!=="/api/internal/earnings/events" || configured.search || configured.hash) return null;
      const response=await fetch(new URL("/api/driver/push-delivery",configured.origin),{
        method:"POST",headers:{"Content-Type":"application/json"},redirect:"error",cache:"no-store",
        signal:AbortSignal.timeout(5000),body:JSON.stringify({bindingId,proof:grant.proof}),
      });
      if (!response.ok) return null;
    }
  } catch {return null;}
  const deliveryId=randomUUID();
  const outcome=await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data() as Grant|undefined;
    if (!current || current.sessionId!==grant.sessionId || current.proof!==grant.proof || current.token!==legacy.token) return false;
    const now=Date.now();
    const deliveries=Object.fromEntries(Object.entries(current.deliveries ?? {}).filter(([,item])=>item.expiresAt>now)
      .sort((a,b)=>b[1].expiresAt-a[1].expiresAt).slice(0,31));
    deliveries[deliveryId]={routeId:legacy.data?.routeId ?? null,expiresAt:now+FIVE_MINUTES};
    tx.update(ref,{deliveries});
    return true;
  });
  return outcome ? boundPushMessage(legacy.token,bindingId,deliveryId):null;
}
