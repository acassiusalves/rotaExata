'use client';

import { getApp,getApps,initializeApp } from 'firebase/app';
import type { MessagePayload } from 'firebase/messaging';

const config={
  apiKey:process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId:process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId:process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
const messagingApp='rotaexata-push';
function transportApp() {
  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) return null;
  return getApps().some(app=>app.name===messagingApp) ? getApp(messagingApp):initializeApp(config,messagingApp);
}

let messagingPromise: Promise<any | null> | null = null;

export async function getMessagingInstance() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  if (!messagingPromise) {
    messagingPromise = import('firebase/messaging').then(async ({ getMessaging, isSupported }) => {
      const supported = await isSupported();
      const app=supported ? transportApp():null;
      return app ? getMessaging(app):null;
    }).catch(error => {
      console.error('Erro ao importar Firebase Messaging:', error);
      return null;
    });
  }
  return messagingPromise;
}

export async function isPushSupported() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !config.apiKey) return false;

  try {
    const { isSupported } = await import('firebase/messaging');
    return await isSupported();
  } catch (error) {
    console.error('Erro ao verificar suporte a push:', error);
    return false;
  }
}

export async function requestPushPermission(vapidKey: string) {
  const messaging = await getMessagingInstance();
  if (!messaging) throw new Error('Navegador não suporta Web Push');

  if (!isValidVapidKey(vapidKey)) {
    throw new Error('NEXT_PUBLIC_VAPID_KEY inválida. Copie a chave Web Push (Key pair) do Firebase Console e atualize .env.local.');
  }

  const { getToken } = await import('firebase/messaging');

  const currentPermission = Notification.permission;

  if (currentPermission === 'granted') {
    const registration = await ensureServiceWorker();
    return await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
  }

  if (currentPermission === 'denied') {
    throw new Error(
      'Notificações bloqueadas no navegador. Libere o envio nas permissões do site e tente novamente.'
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notificações bloqueadas no navegador. Libere o envio nas permissões do site e tente novamente.'
        : 'Permissão de notificação negada'
    );
  }

  const registration = await ensureServiceWorker();
  return await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
}

function isValidVapidKey(key: string) {
  return /^[A-Za-z0-9_-]{43,}$/.test(key);
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return undefined;
  }

  const swUrl = '/firebase-messaging-sw.js';
  const scope = '/firebase-cloud-messaging-push-scope';
  let registration = await navigator.serviceWorker.getRegistration(scope);

  if (!registration?.active?.scriptURL.endsWith(swUrl) || !registration.scope.endsWith(scope)) {
    try {
      registration = await navigator.serviceWorker.register(swUrl, { scope });
    } catch (err) {
      console.error('Falha ao registrar service worker de push', err);
      throw new Error('Não foi possível registrar o service worker de notificações. Verifique se /firebase-messaging-sw.js está acessível.');
    }
  }

  const activeRegistration = await waitUntilActive(registration);
  return activeRegistration;
}

async function waitUntilActive(registration: ServiceWorkerRegistration) {
  if (registration.active) {
    return registration;
  }

  const installing = registration.installing ?? registration.waiting;
  if (installing) {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        installing.removeEventListener('statechange', onStateChange);
        reject(new Error('Tempo esgotado ao ativar notificações. Tente novamente.'));
      }, 15000);
      const onStateChange = () => {
        if (installing.state === 'activated') {
          clearTimeout(timeout);
          installing.removeEventListener('statechange', onStateChange);
          resolve();
        } else if (installing.state === 'redundant') {
          clearTimeout(timeout);
          installing.removeEventListener('statechange', onStateChange);
          reject(new Error('Service worker entrou em estado redundante.'));
        }
      };
      installing.addEventListener('statechange', onStateChange);
      onStateChange();
    });
    return registration;
  }

  throw new Error('Service worker de notificações não ficou ativo. Tente novamente.');
}

export async function onForegroundNotification(handler:(payload:MessagePayload)=>void) {
  const messaging=await getMessagingInstance();
  if (!messaging) return ()=>{};
  const {onMessage}=await import('firebase/messaging');
  return onMessage(messaging,handler);
}

const deviceTokens=new Map<string,string>();
export function rememberDriverPushToken(uid:string,token:string) { deviceTokens.set(uid,token); }
export function takeDriverPushToken(uid:string) {
  const token=deviceTokens.get(uid);
  deviceTokens.delete(uid);
  return token;
}
export async function releaseDriverPushTransport() {
  const messaging=await getMessagingInstance();
  if (messaging) {
    const {deleteToken}=await import('firebase/messaging');
    await deleteToken(messaging);
  }
}
