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

export async function requestPushPermission(vapidKey: string) {
  const messaging = await getMessagingInstance();
  if (!messaging) throw new Error('Navegador não suporta Web Push');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Permissão de notificação negada');
  }

  return await getToken(messaging, { vapidKey });
}

export async function saveCourierToken(uid: string, token: string) {
  await setDoc(doc(db, 'couriers', uid, 'tokens', token), { createdAt: Date.now() }, { merge: true });
}

export function onForegroundNotification(cb: (p: any) => void) {
  getMessagingInstance().then(m => {
    if (m) onMessage(m, cb);
  });
}
