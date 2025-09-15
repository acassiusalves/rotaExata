import {onCall,HttpsError} from "firebase-functions/v2/https";
import * as functionsV1 from "firebase-functions/v1";
import {initializeApp} from "firebase-admin/app";
import {getAuth} from "firebase-admin/auth";
import {getFirestore,FieldValue} from "firebase-admin/firestore";
import * as crypto from "node:crypto";

initializeApp();

/* ========== inviteUser (callable) ========== */
export const inviteUser = onCall(
  {region:"southamerica-east1"},
  async (req)=>{
    const d=req.data||{};
    const email=String(d.email||"").trim().toLowerCase();
    const role=String(d.role||"").trim();
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
          password:crypto.randomUUID(),
          emailVerified:false
        });
      }
      await db.collection("users").doc(user.uid).set(
        {
          email,
          role,
          createdAt:FieldValue.serverTimestamp(),
          updatedAt:FieldValue.serverTimestamp()
        },
        {merge:true}
      );
      const appUrl=process.env.APP_URL
        || "https://soldemaria.vercel.app/auth/finish";
      const resetLink=await auth.generatePasswordResetLink(
        email,{url:appUrl}
      );
      return {ok:true,uid:user.uid,role,resetLink};
    }catch(err){
      const msg=err instanceof Error?err.message:"Falha ao convidar";
      throw new HttpsError("internal",msg);
    }
  }
);

/* ========== Espelho: Auth -> Firestore (v1 trigger) ========== */
export const authUserMirror=functionsV1.auth.user()
  .onCreate(async (u:any)=>{
    const email=(u.email||"").toLowerCase();
    const db=getFirestore();
    const ref=db.collection("users").doc(u.uid);
    await db.runTransaction(async (tx)=>{
      const snap=await tx.get(ref);
      if(snap.exists){
        tx.set(ref,
          {email,updatedAt:FieldValue.serverTimestamp()},
          {merge:true}
        );
      }else{
        // Define 'admin' role for specific email, otherwise default to 'vendedor'
        const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'vendedor';
        tx.set(ref,
          {
            email,
            role: role,
            createdAt:FieldValue.serverTimestamp(),
            updatedAt:FieldValue.serverTimestamp()
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
      const role = email === 'acassiusalves@gmail.com' ? 'admin' : 'vendedor';
      
      await db.collection("users").doc(userRecord.uid).set(
        {
          email: userRecord.email,
          role: role,
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
