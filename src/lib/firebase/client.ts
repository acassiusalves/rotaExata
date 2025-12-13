// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getAuth, Auth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
import { getStorage, FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Debug: Log Firebase config - valores explícitos para diagnóstico
if (typeof window !== 'undefined') {
  const configDebug = {
    apiKey: firebaseConfig.apiKey ? firebaseConfig.apiKey.substring(0, 15) + '...' : '❌ MISSING!',
    authDomain: firebaseConfig.authDomain || '❌ MISSING!',
    projectId: firebaseConfig.projectId || '❌ MISSING!',
    storageBucket: firebaseConfig.storageBucket || '❌ MISSING!',
  };

  console.log('[Firebase Client] ====== CONFIG DEBUG ======');
  console.log('[Firebase Client] apiKey:', configDebug.apiKey);
  console.log('[Firebase Client] authDomain:', configDebug.authDomain);
  console.log('[Firebase Client] projectId:', configDebug.projectId);
  console.log('[Firebase Client] storageBucket:', configDebug.storageBucket);
  console.log('[Firebase Client] ===========================');

  // Alerta crítico se projectId estiver faltando
  if (!firebaseConfig.projectId) {
    console.error('[Firebase Client] ❌❌❌ ERRO CRÍTICO: NEXT_PUBLIC_FIREBASE_PROJECT_ID não está definido! ❌❌❌');
    console.error('[Firebase Client] O Firestore NÃO vai funcionar sem esta variável!');
    console.error('[Firebase Client] Adicione nas Environment Variables da Vercel:');
    console.error('[Firebase Client] NEXT_PUBLIC_FIREBASE_PROJECT_ID = studio-7321304121-9aa4d');
  }
}

// Initialize Firebase - singleton pattern
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;
let storage: FirebaseStorage;

const existingApps = getApps();
if (existingApps.length > 0) {
  app = getApp();
  if (typeof window !== 'undefined') {
    console.log('[Firebase Client] Using existing app instance, total apps:', existingApps.length);
  }
} else {
  app = initializeApp(firebaseConfig);
  if (typeof window !== 'undefined') {
    console.log('[Firebase Client] Created new app instance');
  }
}

auth = getAuth(app);
db = getFirestore(app);
functions = getFunctions(app, 'southamerica-east1');
storage = getStorage(app);

// Log auth instance ID for debugging
if (typeof window !== 'undefined') {
  console.log('[Firebase Client] Auth instance created, app name:', app.name);
}

export { app, auth, db, functions, storage };
