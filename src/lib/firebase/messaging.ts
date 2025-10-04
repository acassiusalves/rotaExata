import { app, db } from '@/lib/firebase/client';
import { getMessaging, getToken, onMessage, isSupported, type Messaging } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

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
  
  const currentPermission = Notification.permission;
  if (currentPermission === 'granted') {
     console.log('Notification permission already granted.');
  } else if (currentPermission === 'denied') {
      throw new Error('Permissão de notificação foi bloqueada. Habilite nas configurações do navegador.');
  }
  
  if (currentPermission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        throw new Error('Permissão de notificação negada');
      }
  }

  return await getToken(messaging, { vapidKey });
}

export async function saveCourierToken(uid: string, token: string) {
  // Firestore path: /users/{uid}/tokens/{token}
  // We use the 'users' collection to keep consistency with the auth system.
  await setDoc(doc(db, 'users', uid, 'tokens', token), { 
      token: token,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      platform: 'web',
      userAgent: navigator.userAgent
   }, { merge: true });
}

export function onForegroundNotification(cb: (p: any) => void) {
  getMessagingInstance().then(m => {
    if (m) onMessage(m, cb);
  });
}
