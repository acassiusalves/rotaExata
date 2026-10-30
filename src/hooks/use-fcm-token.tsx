'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { auth } from '@/lib/firebase/client';
import { useToast } from '@/hooks/use-toast';
import { createPushRegistrar, type PushRegistrationResult } from '@/lib/push-registration';
import { isPushSupported, requestPushPermission, saveDriverToken, onForegroundNotification, getDriverPushPreference, disableDriverPush } from '@/lib/firebase/messaging';
import { isImpersonationSessionActive } from '@/lib/impersonation-session';

const permission = (): NotificationPermission => typeof Notification === 'undefined' ? 'default' : Notification.permission;
const registrar = createPushRegistrar({
  isSupported: isPushSupported,
  getPermission: permission,
  requestPermission: () => Notification.requestPermission(),
  getCurrentUid: () => auth.currentUser?.uid ?? null,
  isImpersonating: isImpersonationSessionActive,
  getPreference: getDriverPushPreference,
  getToken: () => requestPushPermission(process.env.NEXT_PUBLIC_VAPID_KEY || ''),
  saveToken: saveDriverToken,
  disableToken: disableDriverPush,
});
const EVENT = 'rotaexata:push-registration';

export function useFCMToken(userId: string | null, receiveForeground = true) {
  const [result, setResult] = useState<PushRegistrationResult>({ state: 'needs_permission', permission: 'default' });
  const [isRegistering, setIsRegistering] = useState(false);
  const currentUid = useRef(userId);
  currentUid.current = userId;
  const { toast } = useToast();

  const run = useCallback(async (ask: boolean) => {
    if (!userId) return false;
    setIsRegistering(true);
    const outcome = await registrar.register(userId, ask);
    if (currentUid.current !== userId) return false;
    setResult(outcome);
    setIsRegistering(false);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId, result: outcome } }));
    return outcome.state === 'enabled';
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    currentUid.current = userId;
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ userId: string; result: PushRegistrationResult }>).detail;
      if (detail.userId === userId) setResult(detail.result);
    };
    const resync = () => { void run(false); };
    window.addEventListener(EVENT, changed);
    window.addEventListener('focus', resync);
    void run(false);
    return () => {
      if (currentUid.current === userId) currentUid.current = null;
      window.removeEventListener(EVENT, changed); window.removeEventListener('focus', resync);
    };
  }, [userId, run]);

  useEffect(() => {
    if (!userId || !receiveForeground || isImpersonationSessionActive()) return;
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    void onForegroundNotification(async payload => {
      if (!alive || currentUid.current !== userId) return;
      const title = payload.data?.title || payload.notification?.title || 'Nova Notificação';
      const body = payload.data?.body || payload.notification?.body || 'Você tem uma nova mensagem';
      toast({ title, description: body, duration: 5000 });
      if (permission() === 'granted') {
        try {
          const registration = await navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope');
          if (alive && currentUid.current === userId) {
            await registration?.showNotification(title, { body, icon: '/icons/pwa-192.png', tag: payload.data?.routeId || 'notification', data: payload.data });
          }
        } catch { console.warn('Não foi possível mostrar o aviso de sistema. O aviso continua disponível no app.'); }
      }
    }).then(cleanup => { if (alive) unsubscribe = cleanup; else cleanup(); });
    return () => { alive = false; unsubscribe?.(); };
  }, [userId, toast, receiveForeground]);

  return {
    notificationPermission: result.permission,
    registrationState: result.state,
    registrationError: result.errorCode,
    isRegistering,
    requestPermission: () => run(true),
    disable: async () => {
      if (!userId) return false;
      setIsRegistering(true);
      try {
        await registrar.disable(userId);
        const outcome: PushRegistrationResult = { state: 'disabled', permission: permission() };
        if (currentUid.current === userId) {
          setResult(outcome);
          window.dispatchEvent(new CustomEvent(EVENT, { detail: { userId, result: outcome } }));
        }
        return true;
      } finally {
        if (currentUid.current === userId) setIsRegistering(false);
      }
    },
  };
}
