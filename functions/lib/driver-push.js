"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.boundPushMessage = boundPushMessage;
exports.driverPushMessage = driverPushMessage;
const node_crypto_1 = require("node:crypto");
const legacy_driver_accounts_1 = require("./legacy-driver-accounts");
const FIVE_MINUTES = 300000;
function boundPushMessage(token, bindingId, deliveryId) {
    return { token, data: { boundPush: "1", bindingId, deliveryId },
        android: { priority: "high", ttl: FIVE_MINUTES }, webpush: { headers: { TTL: "300" } } };
}
async function driverPushMessage(db, sourceUid, profile, legacy) {
    const transition = (await db.doc("rotaAuthTransition/driver").get()).data();
    const bindingId = profile?.fcmSessionBindingId;
    const protectedDriver = typeof bindingId === "string" || (transition?.mode === "supabase" &&
        (profile?.role === "driver" || (0, legacy_driver_accounts_1.blocksLegacyDriverAccountAction)(transition, { uid: sourceUid })));
    if (!protectedDriver) {
        return transition?.mode === "supabase" ? { ...legacy, data: { ...legacy.data, legacyPush: "1" } } : legacy;
    }
    if (typeof bindingId !== "string" || !/^[0-9a-f-]{36}$/i.test(bindingId))
        return null;
    const ref = db.collection("driverPushSessions").doc(bindingId);
    const grant = (await ref.get()).data();
    if (!grant || grant.sourceUid !== sourceUid || grant.token !== legacy.token || !grant.proof)
        return null;
    try {
        const configured = new URL(process.env.ROTA_EARNINGS_EVENTS_URL ?? "");
        if (configured.protocol !== "https:" || configured.username || configured.password ||
            configured.pathname !== "/api/internal/earnings/events" || configured.search || configured.hash)
            return null;
        const response = await fetch(new URL("/api/driver/push-delivery", configured.origin), {
            method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error", cache: "no-store",
            signal: AbortSignal.timeout(5000), body: JSON.stringify({ bindingId, proof: grant.proof }),
        });
        if (!response.ok)
            return null;
    }
    catch {
        return null;
    }
    const deliveryId = (0, node_crypto_1.randomUUID)();
    const outcome = await db.runTransaction(async (tx) => {
        const current = (await tx.get(ref)).data();
        if (!current || current.sessionId !== grant.sessionId || current.proof !== grant.proof || current.token !== legacy.token)
            return false;
        const now = Date.now();
        const deliveries = Object.fromEntries(Object.entries(current.deliveries ?? {}).filter(([, item]) => item.expiresAt > now)
            .sort((a, b) => b[1].expiresAt - a[1].expiresAt).slice(0, 31));
        deliveries[deliveryId] = { routeId: legacy.data?.routeId ?? null, expiresAt: now + FIVE_MINUTES };
        tx.update(ref, { deliveries });
        return true;
    });
    return outcome ? boundPushMessage(legacy.token, bindingId, deliveryId) : null;
}
//# sourceMappingURL=driver-push.js.map