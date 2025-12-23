
import {onCall,HttpsError} from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import {getMessaging} from "firebase-admin/messaging";

initializeApp();

/**
 * Gera o próximo código sequencial único para uma rota
 * Formato: RT-0001, RT-0002, RT-0003, etc.
 */
async function generateRouteCode(): Promise<string> {
  const db = getFirestore();
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
  } catch (error) {
    console.error("Erro ao gerar código da rota:", error);
    throw new HttpsError("internal", "Não foi possível gerar o código da rota");
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
export const inviteUser = onCall(
  {region:"southamerica-east1"},
  async (req)=>{
    const d=req.data||{};
    const email=String(d.email||"").trim().toLowerCase();
    const role=String(d.role||"").trim();
    const displayName=String(d.displayName||"");
    const phone=String(d.phone||"");

    if(!email||!role){
      throw new HttpsError(
        "invalid-argument",
        "email e role são obrigatórios"
      );
    }
    try{
      const auth=getAuth();
      const db=getFirestore();
      let user;
      try{user=await auth.getUserByEmail(email);}
      catch{
        user=await auth.createUser({
          email,
          password: '123456', // Set default password
          emailVerified:false,
          displayName: displayName || undefined,
        });
      }

      // Update auth user if displayName is provided and different
      if (displayName && user.displayName !== displayName) {
        await auth.updateUser(user.uid, { displayName });
      }

      const userData: any = {
        email,
        role,
        displayName: displayName || '',
        phone: phone || '',
        status: 'offline', // Default status on creation
        createdAt:FieldValue.serverTimestamp(),
        updatedAt:FieldValue.serverTimestamp(),
        lastSeenAt: FieldValue.serverTimestamp(),
      };

      if (role === 'driver') {
        userData.mustChangePassword = true;
      }

      await db.collection("users").doc(user.uid).set(
        userData,
        {merge:true}
      );
      
      return {ok:true,uid:user.uid,role};
    }catch(err){
      const msg=err instanceof Error?err.message:"Falha ao convidar";
      throw new HttpsError("internal",msg);
    }
  }
);

/* ========== deleteUser (callable) ========== */
export const deleteUser = onCall(
  { region: "southamerica-east1" },
  async (req) => {
    const d = req.data || {};
    const uid = String(d.uid || "").trim();

    if (!uid) {
      throw new HttpsError("invalid-argument", "UID do usuário é obrigatório");
    }
    
    try {
      const auth = getAuth();
      const db = getFirestore();

      // Delete from Firebase Authentication
      await auth.deleteUser(uid);

      // Delete from Firestore
      await db.collection("users").doc(uid).delete();

      return { ok: true, message: `Usuário ${uid} removido com sucesso.` };

    } catch (err) {
      const error = err as any;
      const msg = error.message || "Falha ao remover usuário";

      // If user not in auth, it's not a critical failure,
      // still try to delete from firestore as the main goal.
      if (error.code === 'auth/user-not-found') {
          try {
            const db = getFirestore();
            await db.collection("users").doc(uid).delete();
            return { ok: true, message: `Usuário ${uid} removido do Firestore (não encontrado na Autenticação).` };
          } catch (dbErr) {
             const dbMsg = dbErr instanceof Error ? dbErr.message : "Falha ao remover do Firestore";
             throw new HttpsError("internal", dbMsg);
          }
      }
      throw new HttpsError("internal", msg);
    }
  }
);


/* ========== deleteRoute (callable) ========== */
export const deleteRoute = onCall(
  { region: "southamerica-east1" },
  async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();

    if (!routeId) {
      throw new HttpsError("invalid-argument", "ID da rota é obrigatório");
    }

    try {
      const db = getFirestore();
      await db.collection("routes").doc(routeId).delete();
      return { ok: true, message: `Rota ${routeId} removida com sucesso.` };
    } catch (error: any) {
      const msg = error.message || "Falha ao remover a rota.";
      throw new HttpsError("internal", `Firestore Error: ${msg}`);
    }
  }
);

/* ========== updateRouteName (callable) ========== */
export const updateRouteName = onCall(
  { region: "southamerica-east1" },
  async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();
    const name = String(d.name || "").trim();

    if (!routeId) {
      throw new HttpsError("invalid-argument", "ID da rota é obrigatório");
    }

    if (!name) {
      throw new HttpsError("invalid-argument", "Nome da rota é obrigatório");
    }

    try {
      const db = getFirestore();
      await db.collection("routes").doc(routeId).update({ name });
      return { ok: true, message: `Nome da rota atualizado com sucesso.` };
    } catch (error: any) {
      const msg = error.message || "Falha ao atualizar o nome da rota.";
      throw new HttpsError("internal", `Firestore Error: ${msg}`);
    }
  }
);

/* ========== updateRouteDriver (callable) ========== */
export const updateRouteDriver = onCall(
  { region: "southamerica-east1" },
  async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();
    const driverId = String(d.driverId || "").trim();
    const driverInfo = d.driverInfo || null;

    if (!routeId) {
      throw new HttpsError("invalid-argument", "ID da rota é obrigatório");
    }

    if (!driverId) {
      throw new HttpsError("invalid-argument", "ID do motorista é obrigatório");
    }

    try {
      const db = getFirestore();
      await db.collection("routes").doc(routeId).update({
        driverId,
        driverInfo
      });
      return { ok: true, message: `Motorista da rota atualizado com sucesso.` };
    } catch (error: any) {
      const msg = error.message || "Falha ao atualizar o motorista da rota.";
      throw new HttpsError("internal", `Firestore Error: ${msg}`);
    }
  }
);

/* ========== duplicateRoute (callable) ========== */
export const duplicateRoute = onCall(
  { region: "southamerica-east1" },
  async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();

    if (!routeId) {
      throw new HttpsError("invalid-argument", "ID da rota é obrigatório");
    }

    try {
      const db = getFirestore();
      const routeDoc = await db.collection("routes").doc(routeId).get();

      if (!routeDoc.exists) {
        throw new HttpsError("not-found", "Rota não encontrada");
      }

      const routeData = routeDoc.data();
      if (!routeData) {
        throw new HttpsError("internal", "Dados da rota não encontrados");
      }

      // Gerar novo código sequencial para a rota duplicada
      const newCode = await generateRouteCode();

      // Criar uma cópia da rota com um novo nome e código
      const newRouteData = {
        ...routeData,
        code: newCode,
        name: `${routeData.name} (Cópia)`,
        createdAt: FieldValue.serverTimestamp(),
      };

      // Criar um novo documento
      await db.collection("routes").add(newRouteData);

      return { ok: true, message: `Rota duplicada com sucesso.` };
    } catch (error: any) {
      const msg = error.message || "Falha ao duplicar a rota.";
      throw new HttpsError("internal", `Firestore Error: ${msg}`);
    }
  }
);

/* ========== completeRoute (callable) ========== */
export const completeRoute = onCall(
  { region: "southamerica-east1" },
  async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();

    // Verificar permissão do usuário
    const auth = req.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }

    try {
      const db = getFirestore();

      // Buscar role do usuário
      const userDoc = await db.collection("users").doc(auth.uid).get();
      const userData = userDoc.data();
      const userRole = userData?.role || "";

      // Verificar se o usuário tem permissão (admin ou socio)
      if (userRole !== "admin" && userRole !== "socio") {
        throw new HttpsError(
          "permission-denied",
          "Apenas administradores e sócios podem marcar rotas como concluídas"
        );
      }

      if (!routeId) {
        throw new HttpsError("invalid-argument", "ID da rota é obrigatório");
      }

      // Atualizar status da rota para 'completed'
      await db.collection("routes").doc(routeId).update({
        status: "completed",
        completedAt: FieldValue.serverTimestamp(),
        completedBy: auth.uid,
      });

      return { ok: true, message: `Rota marcada como concluída com sucesso.` };
    } catch (error: any) {
      const msg = error.message || "Falha ao marcar a rota como concluída.";
      throw new HttpsError("internal", `Firestore Error: ${msg}`);
    }
  }
);


/* ========== notifyRouteChanges (callable) ========== */
export const notifyRouteChanges = onCall(
  { region: "southamerica-east1" },
  async (req) => {
    const d = req.data || {};
    const routeId = String(d.routeId || "").trim();
    const driverId = String(d.driverId || "").trim();
    const changes = d.changes || [];

    if (!routeId || !driverId) {
      throw new HttpsError("invalid-argument", "routeId e driverId são obrigatórios");
    }

    if (!Array.isArray(changes) || changes.length === 0) {
      throw new HttpsError("invalid-argument", "changes deve ser um array não vazio");
    }

    try {
      const db = getFirestore();

      // Criar ou atualizar a notificação
      await db.collection("routeChangeNotifications").doc(routeId).set({
        routeId,
        driverId,
        changes,
        createdAt: FieldValue.serverTimestamp(),
        acknowledged: false,
      });

      // Marcar a rota com flag de mudanças pendentes
      await db.collection("routes").doc(routeId).update({
        pendingChanges: true,
        lastModifiedAt: FieldValue.serverTimestamp(),
        lastModifiedBy: req.auth?.uid || "admin",
      });

      // Buscar FCM token do motorista
      const driverDoc = await db.collection("users").doc(driverId).get();
      const driverData = driverDoc.data();
      const fcmToken = driverData?.fcmToken;

      // Enviar push notification se o motorista tiver token FCM
      if (fcmToken) {
        const messaging = getMessaging();

        // Criar mensagem de notificação baseada no tipo de mudança
        let notificationTitle = "Alterações na Rota";
        let notificationBody = `Sua rota foi atualizada com ${changes.length} alteração${changes.length > 1 ? 'ões' : ''}.`;

        // Personalizar mensagem baseada no tipo de mudança mais prioritário
        const changeTypes = changes.map((c: any) => c.changeType);
        if (changeTypes.includes('address')) {
          notificationBody = `Endereço de parada foi modificado. Total: ${changes.length} alterações.`;
        } else if (changeTypes.includes('sequence')) {
          notificationBody = `Sequência de paradas foi alterada. Total: ${changes.length} alterações.`;
        } else if (changeTypes.includes('added')) {
          notificationBody = `Nova parada foi adicionada à rota. Total: ${changes.length} alterações.`;
        } else if (changeTypes.includes('removed')) {
          notificationBody = `Parada foi removida da rota. Total: ${changes.length} alterações.`;
        }

        // Usando apenas 'data' para evitar "from RotaExata" no Android
        const message = {
          data: {
            routeId,
            changeCount: String(changes.length),
            type: 'route_change',
            title: notificationTitle,
            body: notificationBody,
            notificationTitle, // Backup
            notificationBody, // Backup
          },
          token: fcmToken,
          android: {
            priority: 'high' as const,
            // Remove 'notification' para evitar o "from RotaExata"
            // O Service Worker vai criar a notificação
          },
          webpush: {
            notification: {
              title: notificationTitle,
              body: notificationBody,
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
        } catch (notificationError: any) {
          console.error('❌ Erro ao enviar push notification:', notificationError);
          // Não falhar a função inteira se a notificação falhar
        }
      }

      return { ok: true, message: "Notificação de mudanças criada com sucesso." };
    } catch (error: any) {
      const msg = error.message || "Falha ao notificar mudanças.";
      throw new HttpsError("internal", `Firestore Error: ${msg}`);
    }
  }
);

/* ========== sendCustomNotification (callable) ========== */
export const sendCustomNotification = onCall(
  { region: "southamerica-east1" },
  async (req) => {
    const d = req.data || {};
    const title = String(d.title || "").trim();
    const message = String(d.message || "").trim();
    const driverIds = Array.isArray(d.driverIds) ? d.driverIds : [];
    const priority = String(d.priority || "medium").trim();
    const type = String(d.type || "system").trim();

    // Verificar autenticação
    const auth = req.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }

    try {
      const db = getFirestore();

      // Verificar permissão (admin, socio ou gestor)
      const userDoc = await db.collection("users").doc(auth.uid).get();
      const userData = userDoc.data();
      const userRole = userData?.role || "";

      if (!["admin", "socio", "gestor"].includes(userRole)) {
        throw new HttpsError(
          "permission-denied",
          "Apenas administradores podem enviar notificações customizadas"
        );
      }

      if (!title || !message) {
        throw new HttpsError("invalid-argument", "Título e mensagem são obrigatórios");
      }

      if (driverIds.length === 0) {
        throw new HttpsError("invalid-argument", "Selecione pelo menos um motorista");
      }

      const messaging = getMessaging();
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
          // Usando apenas 'data' para evitar "from RotaExata" no Android
          const pushMessage = {
            data: {
              type,
              priority,
              customNotification: "true",
              title, // Título
              body: message, // Mensagem
              notificationTitle: title, // Backup
              notificationBody: message, // Backup
            },
            token: fcmToken,
            android: {
              priority: priority === "high" ? ("high" as const) : ("normal" as const),
              // Remove 'notification' para evitar o "from RotaExata"
              // O Service Worker vai criar a notificação
            },
            webpush: {
              // Para web, precisamos do objeto notification
              notification: {
                title,
                body: message,
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
        } catch (error: any) {
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
    } catch (error: any) {
      const msg = error.message || "Falha ao enviar notificações.";
      throw new HttpsError("internal", `Firestore Error: ${msg}`);
    }
  }
);

/* ========== Espelho: Auth -> Firestore (v1 trigger) ========== */
export const authUserMirror=functionsV1.region("southamerica-east1")
  .auth.user()
  .onCreate(async (u:any)=>{
    const email=(u.email||"").toLowerCase();
    const db=getFirestore();
    const ref=db.collection("users").doc(u.uid);
    await db.runTransaction(async (tx)=>{
      const snap=await tx.get(ref);
      if(snap.exists){
        const existingData = snap.data() || {};
        const updateData: any = {
            email,
            updatedAt: FieldValue.serverTimestamp()
        };
        if (u.displayName && !existingData.displayName) {
            updateData.displayName = u.displayName;
        }
        tx.set(ref, updateData, {merge: true});
      }else{
        // Define 'admin' role for specific email, otherwise default to 'vendedor'
        const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'vendedor';
        tx.set(ref,
          {
            email,
            role: role,
            displayName: u.displayName || '',
            phone: u.phoneNumber || '',
            status: 'offline',
            createdAt:FieldValue.serverTimestamp(),
            updatedAt:FieldValue.serverTimestamp(),
            lastSeenAt: FieldValue.serverTimestamp(),
          }
        );
      }
    });
  });

/* ========== forceLogoutDriver (callable) ========== */
export const forceLogoutDriver = onCall(
  { region: "southamerica-east1" },
  async (req) => {
    const d = req.data || {};
    const uid = String(d.uid || "").trim();

    // Verificar autenticação
    const authContext = req.auth;
    if (!authContext) {
      throw new HttpsError("unauthenticated", "Usuário não autenticado");
    }

    if (!uid) {
      throw new HttpsError("invalid-argument", "UID do motorista é obrigatório");
    }

    try {
      const auth = getAuth();
      const db = getFirestore();

      // Verificar permissão (admin, socio ou gestor)
      const userDoc = await db.collection("users").doc(authContext.uid).get();
      const userData = userDoc.data();
      const userRole = userData?.role || "";

      if (!["admin", "socio", "gestor"].includes(userRole)) {
        throw new HttpsError(
          "permission-denied",
          "Apenas administradores podem forçar logout de motoristas"
        );
      }

      // Revogar todos os tokens de refresh do usuário
      await auth.revokeRefreshTokens(uid);

      // Atualizar documento do usuário com timestamp de logout forçado e limpar deviceInfo
      await db.collection("users").doc(uid).update({
        forceLogoutAt: FieldValue.serverTimestamp(),
        status: "offline",
        deviceInfo: FieldValue.delete(),
      });

      return { ok: true, message: `Logout forçado para motorista ${uid} com sucesso.` };
    } catch (err) {
      const error = err as any;
      const msg = error.message || "Falha ao forçar logout";

      if (error.code === "auth/user-not-found") {
        throw new HttpsError("not-found", `Usuário ${uid} não encontrado`);
      }
      throw new HttpsError("internal", msg);
    }
  }
);

/* ========== syncAuthUsers (callable) ========== */
export const syncAuthUsers=onCall(
  {region:"southamerica-east1"},
  async (req)=>{
    const d=req.data||{};
    const email=String(d.email||"").trim().toLowerCase();
    if (!email) {
      throw new HttpsError("invalid-argument", "O email é obrigatório.");
    }

    const auth=getAuth();
    const db=getFirestore();

    try {
      const userRecord = await auth.getUserByEmail(email);
      const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'vendedor';

      await db.collection("users").doc(userRecord.uid).set(
        {
          email: userRecord.email,
          role: role,
          displayName: userRecord.displayName || '',
          updatedAt:FieldValue.serverTimestamp()
        },
        {merge:true}
      );

      return {ok:true, synced: 1, uid: userRecord.uid, role: role};
    } catch (error: any) {
      console.error(`Failed to sync user ${email}:`, error);
      if (error.code === 'auth/user-not-found') {
        throw new HttpsError("not-found", `Usuário com email ${email} não encontrado.`);
      }
      const msg = error instanceof Error ? error.message : "Falha ao sincronizar usuário.";
      throw new HttpsError("internal", msg);
    }
  }
);

/* ========== cleanupOfflineDrivers (scheduled) ========== */
// Função scheduled que roda a cada 2 minutos para marcar motoristas inativos como offline
export const cleanupOfflineDrivers = functionsV1
  .region("southamerica-east1")
  .pubsub.schedule("every 2 minutes")
  .onRun(async () => {
    const db = getFirestore();
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    try {
      // Buscar motoristas online com lastSeenAt antigo
      const staleDrivers = await db
        .collection("users")
        .where("role", "==", "driver")
        .where("status", "in", ["online", "available"])
        .where("lastSeenAt", "<", twoMinutesAgo)
        .get();

      if (staleDrivers.empty) {
        console.log("✅ Nenhum motorista stale encontrado");
        return null;
      }

      // Atualizar em batch
      const batch = db.batch();
      staleDrivers.docs.forEach((doc) => {
        batch.update(doc.ref, { status: "offline" });
        console.log(`📴 Marcando motorista ${doc.id} como offline`);
      });

      await batch.commit();
      console.log(`✅ ${staleDrivers.size} motorista(s) marcado(s) como offline`);
      return null;
    } catch (error) {
      console.error("❌ Erro ao limpar motoristas offline:", error);
      return null;
    }
  });

/* ========== forceCleanupOfflineDrivers (callable) ========== */
// Função callable para limpeza manual de motoristas offline
export const forceCleanupOfflineDrivers = onCall(
  { region: "southamerica-east1" },
  async () => {
    const db = getFirestore();
    const now = new Date();
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    // Buscar todos os motoristas para filtragem em memória (evita problemas de índice)
    const allDrivers = await db
      .collection("users")
      .where("role", "==", "driver")
      .get();

    const driversToUpdate: string[] = [];

    allDrivers.docs.forEach((doc) => {
      const data = doc.data();
      const lastSeen = data.lastSeenAt?.toDate();
      const status = data.status;

      if ((status === "online" || status === "available") && lastSeen && lastSeen < twoMinutesAgo) {
        driversToUpdate.push(doc.id);
      }
    });

    if (driversToUpdate.length === 0) {
      return { ok: true, updated: 0, message: "Nenhum motorista precisava ser atualizado" };
    }

    const batch = db.batch();
    driversToUpdate.forEach((docId) => {
      batch.update(db.collection("users").doc(docId), { status: "offline" });
    });

    await batch.commit();

    return {
      ok: true,
      updated: driversToUpdate.length,
      message: `${driversToUpdate.length} motorista(s) marcado(s) como offline`
    };
  }
);
