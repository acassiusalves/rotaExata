// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp, FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getFunctions, Functions } from "firebase/functions";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { shouldUseImpersonationFirebaseApp } from "@/lib/impersonation-session";

const explicitFirebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseOptions(): FirebaseOptions | undefined {
  // Firebase App Hosting injeta a config web via __FIREBASE_DEFAULTS__.
  // Quando os NEXT_PUBLIC_* não existirem no build, initializeApp() sem options
  // usa essa config padrão automaticamente.
  return explicitFirebaseConfig.apiKey ? explicitFirebaseConfig : undefined;
}

// Initialize Firebase - singleton pattern
let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let functions: Functions;
let storage: FirebaseStorage;

const impersonationMode = shouldUseImpersonationFirebaseApp();
const appName = impersonationMode ? 'impersonation-app' : '[DEFAULT]';
const existingApps = getApps();
const targetApp = existingApps.find((candidate) => candidate.name === appName);

if (targetApp) {
  app = impersonationMode ? getApp(appName) : getApp();
  if (typeof window !== 'undefined') {
    console.log('[Firebase Client] Using existing app instance:', appName);
  }
} else {
  const firebaseOptions = getFirebaseOptions();
  app = impersonationMode
    ? initializeApp(firebaseOptions, appName)
    : initializeApp(firebaseOptions);
  if (typeof window !== 'undefined') {
    console.log('[Firebase Client] Created new app instance:', appName);
  }
}

auth = getAuth(app);
db = getFirestore(app);
functions = getFunctions(app, 'southamerica-east1');
storage = getStorage(app);

export { app, auth, db, functions, storage };
