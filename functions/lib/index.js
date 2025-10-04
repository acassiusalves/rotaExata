"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncAuthUsers = exports.authUserMirror = exports.inviteUser = void 0;
exports.notifyRunAssigned = notifyRunAssigned;
const https_1 = require("firebase-functions/v2/https");
const functionsV1 = __importStar(require("firebase-functions/v1"));
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
const crypto = __importStar(require("node:crypto"));
(0, app_1.initializeApp)();
/* ========== inviteUser (callable) ========== */
exports.inviteUser = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const email = String(d.email || "").trim().toLowerCase();
    const role = String(d.role || "").trim();
    if (!email || !role) {
        throw new https_1.HttpsError("invalid-argument", "email e role são obrigatórios");
    }
    try {
        const auth = (0, auth_1.getAuth)();
        const db = (0, firestore_1.getFirestore)();
        let user;
        try {
            user = await auth.getUserByEmail(email);
        }
        catch {
            user = await auth.createUser({
                email,
                password: crypto.randomUUID(),
                emailVerified: false
            });
        }
        await db.collection("users").doc(user.uid).set({
            email,
            role,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        const appUrl = process.env.APP_URL
            || "https://soldemaria.vercel.app/auth/finish";
        const resetLink = await auth.generatePasswordResetLink(email, { url: appUrl });
        return { ok: true, uid: user.uid, role, resetLink };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : "Falha ao convidar";
        throw new https_1.HttpsError("internal", msg);
    }
});
/* ========== Espelho: Auth -> Firestore (v1 trigger) ========== */
exports.authUserMirror = functionsV1.region("southamerica-east1")
    .auth.user()
    .onCreate(async (u) => {
    const email = (u.email || "").toLowerCase();
    const db = (0, firestore_1.getFirestore)();
    const ref = db.collection("users").doc(u.uid);
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists) {
            tx.set(ref, { email, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
        }
        else {
            // Define 'admin' role for specific email, otherwise default to 'vendedor'
            const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'vendedor';
            tx.set(ref, {
                email,
                role: role,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            });
        }
    });
});
/* ========== Backfill: Auth -> Firestore (rodar 1x) ========== */
exports.syncAuthUsers = (0, https_1.onCall)({ region: "southamerica-east1" }, async () => {
    const auth = (0, auth_1.getAuth)();
    const db = (0, firestore_1.getFirestore)();
    let token = undefined;
    let count = 0;
    do {
        const page = await auth.listUsers(1000, token);
        for (const ur of page.users) {
            const email = (ur.email || "").toLowerCase();
            // Also apply the admin role logic here during backfill
            const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'vendedor';
            await db.collection("users").doc(ur.uid).set({
                email,
                role: role,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            }, { merge: true });
            count++;
        }
        token = page.pageToken;
    } while (token);
    return { ok: true, synced: count };
});
/* ========== Push notification when a run is assigned ========== */
async function notifyRunAssigned(runId, courierId) {
    const db = (0, firestore_1.getFirestore)();
    const tokensSnap = await db
        .collection("couriers")
        .doc(courierId)
        .collection("tokens")
        .get();
    const tokens = tokensSnap.docs.map((doc) => doc.id);
    if (!tokens.length)
        return;
    await (0, messaging_1.getMessaging)().sendEachForMulticast({
        tokens,
        notification: {
            title: "Nova corrida",
            body: `Run #${runId} atribuída a você.`,
        },
        data: { runId },
    });
}
//# sourceMappingURL=index.js.map