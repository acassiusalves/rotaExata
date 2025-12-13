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

// Debug: Log Firebase config (sem expor valores sensíveis)
if (typeof window !== 'undefined') {
  console.log('[Firebase Client] Initializing with config:', {
    hasApiKey: !!firebaseConfig.apiKey,
    authDomain: firebaseConfig.authDomain,
    projectId: firebaseConfig.projectId,
    hasStorageBucket: !!firebaseConfig.storageBucket,
  });
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
