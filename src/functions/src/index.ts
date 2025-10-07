
import {onCall,HttpsError} from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import * as functions from "firebase-functions";

initializeApp();

// --- Presence function ---
// Listens for changes to the Realtime Database and updates Firestore.
export const onUserStatusChanged = functions.region("southamerica-east1").database
  .ref('/status/{uid}')
  .onUpdate(async (change, context) => {
    const eventStatus = change.after.val();
    const firestore = getFirestore();
    const userDocRef = firestore.doc(`users/${context.params.uid}`);

    return userDocRef.update({
      status: eventStatus.state,
      lastSeenAt: FieldValue.serverTimestamp(),
    });
  });


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
      const originalRouteRef = db.collection("routes").doc(routeId);
      const originalRouteSnap = await originalRouteRef.get();

      if (!originalRouteSnap.exists) {
        throw new HttpsError("not-found", "Rota original não encontrada.");
      }

      const originalData = originalRouteSnap.data()!;
      
      const duplicatedData = {
        ...originalData,
        name: `Cópia de ${originalData.name}`,
        status: 'dispatched',
        plannedDate: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        driverId: null,
        driverInfo: null,
        startedAt: null,
        completedAt: null,
        currentLocation: null,
        currentStopIndex: null,
      };

      const newRouteRef = await db.collection("routes").add(duplicatedData);
      
      return { ok: true, newRouteId: newRouteRef.id, message: `Rota duplicada com sucesso.` };
    } catch (error: any) {
      const msg = error.message || "Falha ao duplicar a rota.";
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
        // Define 'admin' role for specific email, otherwise default to 'socio'
        const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'socio';
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
      const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'socio';
      
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
