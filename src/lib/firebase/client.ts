// Import the functions you need from the SDKs you need
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyAJMoLSBriJDkNLYtjJ6-rJyaUK8x3sLG0",
  authDomain: "studio-7321304121-9aa4d.firebaseapp.com",
  projectId: "studio-7321304121-9aa4d",
  storageBucket: "studio-7321304121-9aa4d.firebasestorage.app",
  messagingSenderId: "470233078453",
  appId: "1:470233078453:web:4fdf0696986f5d48e5fcfc"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app, 'southamerica-east1');

export { app, auth, db, functions };
