import { app, db } from '@/lib/firebase/client';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';

let messagingPromise: Promise<Messaging | null> | null = null;

export async function getMessagingInstance() {
  if (!messagingPromise) {
    messagingPromise = isSupported().then(s => (s ? getMessaging(app) : null));
  }
  return messagingPromise;
}

export function isPushSupported() {
  return isSupported();
}

export async function requestPushPermission(vapidKey: string) {
  const messaging = await getMessagingInstance();
  if (!messaging) throw new Error('Navegador não suporta Web Push');

  if (!isValidVapidKey(vapidKey)) {
    throw new Error('NEXT_PUBLIC_VAPID_KEY inválida. Copie a chave Web Push (Key pair) do Firebase Console e atualize .env.local.');
  }

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
  let registration = await navigator.serviceWorker.getRegistration();

  if (!registration) {
    try {
      registration = await navigator.serviceWorker.register(swUrl, { scope: '/' });
      console.log('Service Worker registrado:', swUrl);
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
      const onStateChange = () => {
        if (installing.state === 'activated') {
          installing.removeEventListener('statechange', onStateChange);
          resolve();
        } else if (installing.state === 'redundant') {
          installing.removeEventListener('statechange', onStateChange);
          reject(new Error('Service worker entrou em estado redundante.'));
        }
      };
      installing.addEventListener('statechange', onStateChange);
    });
    return registration;
  }

  const readyRegistration = await navigator.serviceWorker.ready;
  return readyRegistration;
}

export async function saveCourierToken(uid: string, token: string) {
  await setDoc(doc(db, 'couriers', uid, 'tokens', token), { createdAt: Date.now() }, { merge: true });
}

export function onForegroundNotification(cb: (p: any) => void) {
  getMessagingInstance().then(m => {
    if (m) onMessage(m, cb);
  });
}
