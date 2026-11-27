"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureFinancialRoute = captureFinancialRoute;
exports.retryCapturedFinancialRoutes = retryCapturedFinancialRoutes;
exports.reconcileFinancialRoutes = reconcileFinancialRoutes;
const firestore_1 = require("firebase-admin/firestore");
const google_auth_library_1 = require("google-auth-library");
const earnings_source_adapter_1 = require("./earnings-source-adapter");
const outboxName = "rotaEarningOutbox";
const evidenceName = "rotaEarningRouteEvidence";
const capture = () => process.env.ROTA_EARNINGS_BRIDGE_ENABLED === "true";
function sourceProject() {
    const project = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
    if (!project || project !== process.env.ROTA_EARNINGS_SOURCE_PROJECT)
        throw new Error("Earnings source project mismatch");
    return project;
}
async function deliver(ref, envelope) {
    const endpoint = process.env.ROTA_EARNINGS_EVENTS_URL;
    if (!endpoint || !endpoint.startsWith("https://"))
        throw new Error("Earnings endpoint unavailable");
    const auth = new google_auth_library_1.GoogleAuth();
    try {
        const client = await auth.getIdTokenClient(endpoint);
        await client.request({ url: endpoint, method: "POST", data: envelope, timeout: 10000, maxRedirects: 0 });
        await ref.update({ acknowledgedAt: firestore_1.FieldValue.serverTimestamp(), nextAttemptAt: firestore_1.FieldValue.delete() });
    }
    catch {
        // Retry with the same envelope. A timeout can occur after the destination commit.
        await ref.update({
            attempts: firestore_1.FieldValue.increment(1),
            nextAttemptAt: firestore_1.Timestamp.fromMillis(Date.now() + 60000),
            lastFailureAt: firestore_1.FieldValue.serverTimestamp(),
        });
        throw new Error("Earnings destination ACK unavailable");
    }
}
async function persistOutbox(envelope) {
    const ref = (0, firestore_1.getFirestore)().collection(outboxName).doc(envelope.eventId);
    try {
        await ref.create({ envelope, attempts: 0, nextAttemptAt: firestore_1.Timestamp.now(), createdAt: firestore_1.FieldValue.serverTimestamp() });
    }
    catch (error) {
        if (error.code !== 6)
            throw error;
    }
    return ref;
}
async function enqueue(envelope) {
    const ref = await persistOutbox(envelope);
    const persisted = (await ref.get()).data();
    if (!persisted?.acknowledgedAt)
        await deliver(ref, persisted?.envelope ?? envelope);
}
function completed(facts) {
    return facts.status === "completed" || facts.status === "completed_auto";
}
async function captureFinancialRoute(id, before, after, eventTime) {
    if (!capture())
        return;
    const project = sourceProject();
    const db = (0, firestore_1.getFirestore)();
    if (!after?.exists) {
        if (!before?.exists || !before.updateTime)
            return;
        await enqueue((0, earnings_source_adapter_1.makeEnvelope)(project, id, (0, earnings_source_adapter_1.deletionRevision)(eventTime, before.updateTime), "deleted", {}));
        return;
    }
    if (!after.updateTime)
        throw new Error("Source revision missing");
    const beforeData = before?.data() ?? {};
    const currentData = after.data() ?? {};
    if (!completed((0, earnings_source_adapter_1.routeFacts)(beforeData)) && !completed((0, earnings_source_adapter_1.routeFacts)(currentData)))
        return;
    const proof = (await db.collection(evidenceName).doc(id).get()).data();
    const prior = (0, earnings_source_adapter_1.sourceSnapshot)(beforeData, proof);
    const current = (0, earnings_source_adapter_1.sourceSnapshot)(currentData, proof);
    if ((0, earnings_source_adapter_1.factsHash)((0, earnings_source_adapter_1.routeFacts)(prior)) === (0, earnings_source_adapter_1.factsHash)((0, earnings_source_adapter_1.routeFacts)(current)))
        return;
    await enqueue((0, earnings_source_adapter_1.makeEnvelope)(project, id, after.updateTime, "snapshot", current));
}
async function retryCapturedFinancialRoutes() {
    if (!capture())
        return;
    sourceProject();
    const pending = await (0, firestore_1.getFirestore)().collection(outboxName).orderBy("nextAttemptAt").endAt(firestore_1.Timestamp.now()).limit(30).get();
    const results = await Promise.allSettled(pending.docs.map((doc) => deliver(doc.ref, doc.data().envelope)));
    const failed = results.filter((result) => result.status === "rejected").length;
    if (failed)
        console.error("Earnings bridge retry failures", { failed, considered: pending.size });
    const endpoint = process.env.ROTA_EARNINGS_EVENTS_URL;
    if (!endpoint || !endpoint.startsWith("https://"))
        throw new Error("Earnings endpoint unavailable");
    try {
        const client = await new google_auth_library_1.GoogleAuth().getIdTokenClient(endpoint);
        await client.request({ url: endpoint, method: "GET", timeout: 10000, maxRedirects: 0 });
        await client.request({ url: endpoint, method: "PUT", timeout: 45000, maxRedirects: 0 });
    }
    catch {
        throw new Error("Earnings worker unavailable");
    }
}
/** Full overlapping sweep by document id. Each page advances only after the
 * replayable evidence snapshots were acknowledged. It cannot recreate vanished history. */
async function reconcileFinancialRoutes() {
    if (!capture())
        return;
    const project = sourceProject();
    const inception = process.env.ROTA_EARNINGS_CAPTURE_FROM;
    if (!inception || !Number.isFinite(Date.parse(inception)))
        throw new Error("Missing earnings capture watermark");
    const db = (0, firestore_1.getFirestore)();
    const cursorRef = db.collection("rotaEarningReconcile").doc("cursor");
    const cursor = (await cursorRef.get()).data()?.after;
    let query = db.collection("routes").orderBy(firestore_1.FieldPath.documentId()).limit(50);
    if (typeof cursor === "string" && cursor)
        query = query.startAfter(cursor);
    const page = await query.get();
    let recovered = 0;
    let failed = 0;
    for (const route of page.docs) {
        const rev = route.updateTime;
        if (!rev || rev.seconds * 1000 + rev.nanoseconds / 1e6 < Date.parse(inception))
            continue;
        const proof = (await db.collection(evidenceName).doc(route.id).get()).data();
        if (!completed((0, earnings_source_adapter_1.routeFacts)(route.data())) && !proof?.completion)
            continue;
        try {
            await persistOutbox((0, earnings_source_adapter_1.makeEnvelope)(project, route.id, rev, "snapshot", (0, earnings_source_adapter_1.sourceSnapshot)(route.data(), proof)));
            recovered++;
        }
        catch {
            failed++;
        }
    }
    await cursorRef.set({
        after: failed ? cursor ?? null : page.size === 50 ? page.docs[page.docs.length - 1].id : null,
        checked: firestore_1.FieldValue.increment(page.size),
        recovered: firestore_1.FieldValue.increment(recovered),
        failures: firestore_1.FieldValue.increment(failed),
        lastSweepAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
    if (failed)
        console.error("Earnings bridge reconciliation failures", { failed });
    await reconcileMissingRouteHistory(project);
}
async function reconcileMissingRouteHistory(project) {
    const db = (0, firestore_1.getFirestore)();
    const cursor = db.collection("rotaEarningReconcile").doc("evidence-cursor");
    const after = (await cursor.get()).data()?.after;
    let query = db.collection(evidenceName).orderBy(firestore_1.FieldPath.documentId()).limit(30);
    if (typeof after === "string" && after)
        query = query.startAfter(after);
    const page = await query.get();
    if (!page.empty) {
        const routes = await db.getAll(...page.docs.map((doc) => db.collection("routes").doc(doc.id)));
        for (const route of routes) {
            if (route.exists)
                continue;
            const gap = db.collection("rotaEarningReconcileGaps").doc(route.id);
            const detected = await db.runTransaction(async (tx) => {
                const [current, prior] = await tx.getAll(route.ref, gap);
                if (current.exists)
                    return null;
                const observed = prior.data()?.detectedAt;
                if (observed)
                    return observed;
                const occurred = firestore_1.Timestamp.now();
                tx.create(gap, { detectedAt: occurred });
                return occurred;
            });
            if (detected)
                await persistOutbox((0, earnings_source_adapter_1.makeEnvelope)(project, route.id, detected, "gap", {}));
        }
    }
    await cursor.set({ after: page.size === 30 ? page.docs[page.size - 1].id : null }, { merge: true });
}
//# sourceMappingURL=earnings-source-bridge.js.map