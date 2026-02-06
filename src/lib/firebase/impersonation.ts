// Firebase instance isolada para impersonação
// Usa um nome de app diferente para evitar conflito de sessão com a aba principal

import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Nome único para a app de impersonação
const IMPERSONATION_APP_NAME = 'impersonation-app';

// Criar app isolada para impersonação
let impersonationApp;
let impersonationAuth: Auth;
let impersonationDb: Firestore;

try {
  // Tentar pegar app existente
  impersonationApp = getApp(IMPERSONATION_APP_NAME);
} catch (error) {
  // Se não existir, criar nova
  impersonationApp = initializeApp(firebaseConfig, IMPERSONATION_APP_NAME);
}

impersonationAuth = getAuth(impersonationApp);
impersonationDb = getFirestore(impersonationApp);

export { impersonationAuth as auth, impersonationDb as db };
