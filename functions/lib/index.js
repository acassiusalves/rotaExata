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
exports.syncAuthUsers = exports.authUserMirror = exports.sendCustomNotification = exports.notifyRouteChanges = exports.completeRoute = exports.duplicateRoute = exports.updateRouteDriver = exports.updateRouteName = exports.deleteRoute = exports.deleteUser = exports.inviteUser = void 0;
const https_1 = require("firebase-functions/v2/https");
const functionsV1 = __importStar(require("firebase-functions/v1"));
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const messaging_1 = require("firebase-admin/messaging");
(0, app_1.initializeApp)();
/**
 * Gera o próximo código sequencial único para uma rota
 * Formato: RT-0001, RT-0002, RT-0003, etc.
 */
async function generateRouteCode() {
    const db = (0, firestore_1.getFirestore)();
    const counterRef = db.collection("counters").doc("routeCode");
    try {
        const newCount = await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            let currentCount = 0;
            if (counterDoc.exists) {
                const data = counterDoc.data();
                currentCount = data?.count || 0;
            }
            const nextCount = currentCount + 1;
            // Atualizar o contador
            transaction.set(counterRef, { count: nextCount }, { merge: true });
            return nextCount;
        });
        // Formatar o código com padding de zeros (ex: RT-0001)
        const code = `RT-${String(newCount).padStart(4, "0")}`;
        return code;
    }
    catch (error) {
        console.error("Erro ao gerar código da rota:", error);
        throw new https_1.HttpsError("internal", "Não foi possível gerar o código da rota");
    }
}
// --- Presence function ---
// Listens for changes to the Realtime Database and updates Firestore.
// COMMENTED OUT: Requires Realtime Database to be configured
// export const onUserStatusChanged = functions.region("southamerica-east1").database
//   .ref('/status/{uid}')
//   .onUpdate(async (change, context) => {
//     const eventStatus = change.after.val();
//     const firestore = getFirestore();
//     const userDocRef = firestore.doc(`users/${context.params.uid}`);
//     return userDocRef.update({
//       status: eventStatus.state,
//       lastSeenAt: FieldValue.serverTimestamp(),
//     });
//   });
/* ========== inviteUser (callable) ========== */
exports.inviteUser = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const email = String(d.email || "").trim().toLowerCase();
    const role = String(d.role || "").trim();
    const displayName = String(d.displayName || "");
    const phone = String(d.phone || "");
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
                password: '123456', // Set default password
                emailVerified: false,
                displayName: displayName || undefined,
            });
        }
        // Update auth user if displayName is provided and different
        if (displayName && user.displayName !== displayName) {
            await auth.updateUser(user.uid, { displayName });
        }
        const userData = {
            email,
            role,
            displayName: displayName || '',
            phone: phone || '',
            status: 'offline', // Default status on creation
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            lastSeenAt: firestore_1.FieldValue.serverTimestamp(),
        };
        if (role === 'driver') {
            userData.mustChangePassword = true;
        }
        await db.collection("users").doc(user.uid).set(userData, { merge: true });
        return { ok: true, uid: user.uid, role };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : "Falha ao convidar";
        throw new https_1.HttpsError("internal", msg);
    }
});
/* ========== deleteUser (callable) ========== */
exports.deleteUser = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const uid = String(d.uid || "").trim();
    if (!uid) {
        throw new https_1.HttpsError("invalid-argument", "UID do usuário é obrigatório");
    }
    try {
        const auth = (0, auth_1.getAuth)();
        const db = (0, firestore_1.getFirestore)();
        // Delete from Firebase Authentication
        await auth.deleteUser(uid);
        // Delete from Firestore
        await db.collection("users").doc(uid).delete();
        return { ok: true, message: `Usuário ${uid} removido com sucesso.` };
    }
    catch (err) {
        const error = err;
        const msg = error.message || "Falha ao remover usuário";
        // If user not in auth, it's not a critical failure,
        // still try to delete from firestore as the main goal.
        if (error.code === 'auth/user-not-found') {
            try {
                const db = (0, firestore_1.getFirestore)();
                await db.collection("users").doc(uid).delete();
                return { ok: true, message: `Usuário ${uid} removido do Firestore (não encontrado na Autenticação).` };
            }
            catch (dbErr) {
                const dbMsg = dbErr instanceof Error ? dbErr.message : "Falha ao remover do Firestore";
                throw new https_1.HttpsError("internal", dbMsg);
            }
        }
        throw new https_1.HttpsError("internal", msg);
    }
});
/* ========== deleteRoute (callable) ========== */
exports.deleteRoute = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();
    if (!routeId) {
        throw new https_1.HttpsError("invalid-argument", "ID da rota é obrigatório");
    }
    try {
        const db = (0, firestore_1.getFirestore)();
        await db.collection("routes").doc(routeId).delete();
        return { ok: true, message: `Rota ${routeId} removida com sucesso.` };
    }
    catch (error) {
        const msg = error.message || "Falha ao remover a rota.";
        throw new https_1.HttpsError("internal", `Firestore Error: ${msg}`);
    }
});
/* ========== updateRouteName (callable) ========== */
exports.updateRouteName = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();
    const name = String(d.name || "").trim();
    if (!routeId) {
        throw new https_1.HttpsError("invalid-argument", "ID da rota é obrigatório");
    }
    if (!name) {
        throw new https_1.HttpsError("invalid-argument", "Nome da rota é obrigatório");
    }
    try {
        const db = (0, firestore_1.getFirestore)();
        await db.collection("routes").doc(routeId).update({ name });
        return { ok: true, message: `Nome da rota atualizado com sucesso.` };
    }
    catch (error) {
        const msg = error.message || "Falha ao atualizar o nome da rota.";
        throw new https_1.HttpsError("internal", `Firestore Error: ${msg}`);
    }
});
/* ========== updateRouteDriver (callable) ========== */
exports.updateRouteDriver = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();
    const driverId = String(d.driverId || "").trim();
    const driverInfo = d.driverInfo || null;
    if (!routeId) {
        throw new https_1.HttpsError("invalid-argument", "ID da rota é obrigatório");
    }
    if (!driverId) {
        throw new https_1.HttpsError("invalid-argument", "ID do motorista é obrigatório");
    }
    try {
        const db = (0, firestore_1.getFirestore)();
        await db.collection("routes").doc(routeId).update({
            driverId,
            driverInfo
        });
        return { ok: true, message: `Motorista da rota atualizado com sucesso.` };
    }
    catch (error) {
        const msg = error.message || "Falha ao atualizar o motorista da rota.";
        throw new https_1.HttpsError("internal", `Firestore Error: ${msg}`);
    }
});
/* ========== duplicateRoute (callable) ========== */
exports.duplicateRoute = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();
    if (!routeId) {
        throw new https_1.HttpsError("invalid-argument", "ID da rota é obrigatório");
    }
    try {
        const db = (0, firestore_1.getFirestore)();
        const routeDoc = await db.collection("routes").doc(routeId).get();
        if (!routeDoc.exists) {
            throw new https_1.HttpsError("not-found", "Rota não encontrada");
        }
        const routeData = routeDoc.data();
        if (!routeData) {
            throw new https_1.HttpsError("internal", "Dados da rota não encontrados");
        }
        // Gerar novo código sequencial para a rota duplicada
        const newCode = await generateRouteCode();
        // Criar uma cópia da rota com um novo nome e código
        const newRouteData = {
            ...routeData,
            code: newCode,
            name: `${routeData.name} (Cópia)`,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        };
        // Criar um novo documento
        await db.collection("routes").add(newRouteData);
        return { ok: true, message: `Rota duplicada com sucesso.` };
    }
    catch (error) {
        const msg = error.message || "Falha ao duplicar a rota.";
        throw new https_1.HttpsError("internal", `Firestore Error: ${msg}`);
    }
});
/* ========== completeRoute (callable) ========== */
exports.completeRoute = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();
    // Verificar permissão do usuário
    const auth = req.auth;
    if (!auth) {
        throw new https_1.HttpsError("unauthenticated", "Usuário não autenticado");
    }
    try {
        const db = (0, firestore_1.getFirestore)();
        // Buscar role do usuário
        const userDoc = await db.collection("users").doc(auth.uid).get();
        const userData = userDoc.data();
        const userRole = userData?.role || "";
        // Verificar se o usuário tem permissão (admin ou socio)
        if (userRole !== "admin" && userRole !== "socio") {
            throw new https_1.HttpsError("permission-denied", "Apenas administradores e sócios podem marcar rotas como concluídas");
        }
        if (!routeId) {
            throw new https_1.HttpsError("invalid-argument", "ID da rota é obrigatório");
        }
        // Atualizar status da rota para 'completed'
        await db.collection("routes").doc(routeId).update({
            status: "completed",
            completedAt: firestore_1.FieldValue.serverTimestamp(),
            completedBy: auth.uid,
        });
        return { ok: true, message: `Rota marcada como concluída com sucesso.` };
    }
    catch (error) {
        const msg = error.message || "Falha ao marcar a rota como concluída.";
        throw new https_1.HttpsError("internal", `Firestore Error: ${msg}`);
    }
});
/* ========== notifyRouteChanges (callable) ========== */
exports.notifyRouteChanges = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();
    const driverId = String(d.driverId || "").trim();
    const changes = d.changes || [];
    if (!routeId || !driverId) {
        throw new https_1.HttpsError("invalid-argument", "routeId e driverId são obrigatórios");
    }
    if (!Array.isArray(changes) || changes.length === 0) {
        throw new https_1.HttpsError("invalid-argument", "changes deve ser um array não vazio");
    }
    try {
        const db = (0, firestore_1.getFirestore)();
        // Criar ou atualizar a notificação
        await db.collection("routeChangeNotifications").doc(routeId).set({
            routeId,
            driverId,
            changes,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            acknowledged: false,
        });
        // Marcar a rota com flag de mudanças pendentes
        await db.collection("routes").doc(routeId).update({
            pendingChanges: true,
            lastModifiedAt: firestore_1.FieldValue.serverTimestamp(),
            lastModifiedBy: req.auth?.uid || "admin",
        });
        // Buscar FCM token do motorista
        const driverDoc = await db.collection("users").doc(driverId).get();
        const driverData = driverDoc.data();
        const fcmToken = driverData?.fcmToken;
        // Enviar push notification se o motorista tiver token FCM
        if (fcmToken) {
            const messaging = (0, messaging_1.getMessaging)();
            // Criar mensagem de notificação baseada no tipo de mudança
            let notificationTitle = "Alterações na Rota";
            let notificationBody = `Sua rota foi atualizada com ${changes.length} alteração${changes.length > 1 ? 'ões' : ''}.`;
            // Personalizar mensagem baseada no tipo de mudança mais prioritário
            const changeTypes = changes.map((c) => c.changeType);
            if (changeTypes.includes('address')) {
                notificationBody = `Endereço de parada foi modificado. Total: ${changes.length} alterações.`;
            }
            else if (changeTypes.includes('sequence')) {
                notificationBody = `Sequência de paradas foi alterada. Total: ${changes.length} alterações.`;
            }
            else if (changeTypes.includes('added')) {
                notificationBody = `Nova parada foi adicionada à rota. Total: ${changes.length} alterações.`;
            }
            else if (changeTypes.includes('removed')) {
                notificationBody = `Parada foi removida da rota. Total: ${changes.length} alterações.`;
            }
            const message = {
                notification: {
                    title: notificationTitle,
                    body: notificationBody,
                },
                data: {
                    routeId,
                    changeCount: String(changes.length),
                    type: 'route_change',
                },
                token: fcmToken,
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        priority: 'high',
                        channelId: 'route_updates',
                    },
                },
                webpush: {
                    notification: {
                        icon: '/icons/pwa-192.png',
                        badge: '/icons/pwa-192.png',
                        requireInteraction: true,
                        tag: routeId,
                    },
                    fcmOptions: {
                        link: `/my-routes/${routeId}`,
                    },
                },
            };
            try {
                await messaging.send(message);
                console.log(`✅ Push notification enviada para motorista ${driverId}`);
            }
            catch (notificationError) {
                console.error('❌ Erro ao enviar push notification:', notificationError);
                // Não falhar a função inteira se a notificação falhar
            }
        }
        return { ok: true, message: "Notificação de mudanças criada com sucesso." };
    }
    catch (error) {
        const msg = error.message || "Falha ao notificar mudanças.";
        throw new https_1.HttpsError("internal", `Firestore Error: ${msg}`);
    }
});
/* ========== sendCustomNotification (callable) ========== */
exports.sendCustomNotification = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const title = String(d.title || "").trim();
    const message = String(d.message || "").trim();
    const driverIds = Array.isArray(d.driverIds) ? d.driverIds : [];
    const priority = String(d.priority || "medium").trim();
    const type = String(d.type || "system").trim();
    // Verificar autenticação
    const auth = req.auth;
    if (!auth) {
        throw new https_1.HttpsError("unauthenticated", "Usuário não autenticado");
    }
    try {
        const db = (0, firestore_1.getFirestore)();
        // Verificar permissão (admin, socio ou gestor)
        const userDoc = await db.collection("users").doc(auth.uid).get();
        const userData = userDoc.data();
        const userRole = userData?.role || "";
        if (!["admin", "socio", "gestor"].includes(userRole)) {
            throw new https_1.HttpsError("permission-denied", "Apenas administradores podem enviar notificações customizadas");
        }
        if (!title || !message) {
            throw new https_1.HttpsError("invalid-argument", "Título e mensagem são obrigatórios");
        }
        if (driverIds.length === 0) {
            throw new https_1.HttpsError("invalid-argument", "Selecione pelo menos um motorista");
        }
        const messaging = (0, messaging_1.getMessaging)();
        let successCount = 0;
        let failureCount = 0;
        // Enviar notificação push para cada motorista
        for (const driverId of driverIds) {
            try {
                // Buscar FCM token do motorista
                const driverDoc = await db.collection("users").doc(driverId).get();
                const driverData = driverDoc.data();
                const fcmToken = driverData?.fcmToken;
                if (!fcmToken) {
                    console.log(`⚠️ Motorista ${driverId} não tem FCM token`);
                    failureCount++;
                    continue;
                }
                // Montar mensagem de notificação
                const pushMessage = {
                    notification: {
                        title,
                        body: message,
                    },
                    data: {
                        type,
                        priority,
                        customNotification: "true",
                    },
                    token: fcmToken,
                    android: {
                        priority: priority === "high" ? "high" : "normal",
                        notification: {
                            sound: "default",
                            priority: priority === "high" ? "high" : "default",
                            channelId: "custom_notifications",
                        },
                    },
                    webpush: {
                        notification: {
                            icon: "/icons/pwa-192.png",
                            badge: "/icons/pwa-192.png",
                            requireInteraction: priority === "high",
                            tag: `custom-${Date.now()}`,
                        },
                        fcmOptions: {
                            link: "/driver/notifications",
                        },
                    },
                };
                await messaging.send(pushMessage);
                successCount++;
                console.log(`✅ Push notification enviada para motorista ${driverId}`);
            }
            catch (error) {
                console.error(`❌ Erro ao enviar push para motorista ${driverId}:`, error);
                failureCount++;
            }
        }
        return {
            ok: true,
            message: `Notificações enviadas: ${successCount} sucesso, ${failureCount} falhas`,
            successCount,
            failureCount,
        };
    }
    catch (error) {
        const msg = error.message || "Falha ao enviar notificações.";
        throw new https_1.HttpsError("internal", `Firestore Error: ${msg}`);
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
            const existingData = snap.data() || {};
            const updateData = {
                email,
                updatedAt: firestore_1.FieldValue.serverTimestamp()
            };
            if (u.displayName && !existingData.displayName) {
                updateData.displayName = u.displayName;
            }
            tx.set(ref, updateData, { merge: true });
        }
        else {
            // Define 'admin' role for specific email, otherwise default to 'vendedor'
            const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'vendedor';
            tx.set(ref, {
                email,
                role: role,
                displayName: u.displayName || '',
                phone: u.phoneNumber || '',
                status: 'offline',
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
                lastSeenAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
    });
});
/* ========== syncAuthUsers (callable) ========== */
exports.syncAuthUsers = (0, https_1.onCall)({ region: "southamerica-east1" }, async (req) => {
    const d = req.data || {};
    const email = String(d.email || "").trim().toLowerCase();
    if (!email) {
        throw new https_1.HttpsError("invalid-argument", "O email é obrigatório.");
    }
    const auth = (0, auth_1.getAuth)();
    const db = (0, firestore_1.getFirestore)();
    try {
        const userRecord = await auth.getUserByEmail(email);
        const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'vendedor';
        await db.collection("users").doc(userRecord.uid).set({
            email: userRecord.email,
            role: role,
            displayName: userRecord.displayName || '',
            updatedAt: firestore_1.FieldValue.serverTimestamp()
        }, { merge: true });
        return { ok: true, synced: 1, uid: userRecord.uid, role: role };
    }
    catch (error) {
        console.error(`Failed to sync user ${email}:`, error);
        if (error.code === 'auth/user-not-found') {
            throw new https_1.HttpsError("not-found", `Usuário com email ${email} não encontrado.`);
        }
        const msg = error instanceof Error ? error.message : "Falha ao sincronizar usuário.";
        throw new https_1.HttpsError("internal", msg);
    }
});
//# sourceMappingURL=index.js.map