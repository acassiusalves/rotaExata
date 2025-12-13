'use client';

import { useState, useEffect } from 'react';
import { app } from '@/lib/firebase/client';
import { useToast } from '@/hooks/use-toast';

export function useFCMToken() {
  const [token, setToken] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const { toast } = useToast();

  useEffect(() => {
    // Verificar se está no navegador e suporta notificações
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return;
    }

    setNotificationPermission(Notification.permission);

    // Se já tem permissão, obter token
    if (Notification.permission === 'granted') {
      retrieveToken();
    }

    // Listener para mensagens em foreground - importação dinâmica
    let unsubscribe: (() => void) | undefined;

    if ('serviceWorker' in navigator) {
      import('firebase/messaging').then(({ getMessaging, onMessage }) => {
        try {
          const messaging = getMessaging(app);
          unsubscribe = onMessage(messaging, (payload) => {
            // Mostrar toast para notificação em foreground
            toast({
              title: payload.notification?.title || 'Nova Notificação',
              description: payload.notification?.body || 'Você tem uma nova mensagem',
              duration: 5000,
            });

            // Também mostrar notificação nativa se possível
            if (Notification.permission === 'granted') {
              new Notification(payload.notification?.title || 'Nova Notificação', {
                body: payload.notification?.body,
                icon: '/icons/pwa-192.png',
                tag: payload.data?.routeId || 'notification',
              });
            }
          });
        } catch (error) {
          console.error('Erro ao configurar Firebase Messaging:', error);
        }
      }).catch(error => {
        console.error('Erro ao importar Firebase Messaging:', error);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [toast]);

  const retrieveToken = async () => {
    try {
      if (!('serviceWorker' in navigator)) {
        return null;
      }

      const { getMessaging, getToken } = await import('firebase/messaging');
      const messaging = getMessaging(app);

      const currentToken = await getToken(messaging, {
        vapidKey: 'BIFyl9lKmf8W1Z1O7Pytq5fTI5NffCctMFpyECtfEezhN0vJUugnTKy-ArGfkb6xksBFGiQSp7GHA7JdswTN-30',
      });

      if (currentToken) {
        setToken(currentToken);
        return currentToken;
      } else {
        return null;
      }
    } catch (error) {
      console.error('Erro ao obter token FCM:', error);
      return null;
    }
  };

  const requestPermission = async () => {
    try {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        return null;
      }

      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        const token = await retrieveToken();
        return token;
      } else {
        return null;
      }
    } catch (error) {
      console.error('Erro ao solicitar permissão:', error);
      return null;
    }
  };

  return {
    token,
    notificationPermission,
    requestPermission,
  };
}
