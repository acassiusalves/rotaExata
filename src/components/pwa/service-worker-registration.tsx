'use client';

import React from 'react';

const APP_SERVICE_WORKER_URL = '/sw.js';
const FIREBASE_MESSAGING_SERVICE_WORKER = 'firebase-messaging';

// Componente para registrar o Service Worker com atualização automática
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    // Só registra em produção e se o navegador suportar
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Flag para evitar reload duplicado
    let refreshing = false;
    let updateIntervalId: number | null = null;

    const getRegistrationScriptUrl = (registration: ServiceWorkerRegistration) =>
      registration.active?.scriptURL ||
      registration.waiting?.scriptURL ||
      registration.installing?.scriptURL ||
      '';

    const isFirebaseMessagingRegistration = (registration: ServiceWorkerRegistration) =>
      getRegistrationScriptUrl(registration).includes(FIREBASE_MESSAGING_SERVICE_WORKER);

    const cleanupOldServiceWorkers = async (reason: string) => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();

        for (const registration of registrations) {
          if (isFirebaseMessagingRegistration(registration)) {
            continue;
          }

          console.log(`[SW] Removendo SW antigo (${reason}):`, registration.scope);
          await registration.unregister();
        }
      } catch (error) {
        console.log('[SW] Erro ao limpar SWs antigos:', error);
      }
    };

    const hasAppServiceWorker = async () => {
      try {
        const swResponse = await fetch(APP_SERVICE_WORKER_URL, {
          method: 'HEAD',
          cache: 'no-store',
        });

        return swResponse.ok;
      } catch (error) {
        console.log('[SW] Não foi possível verificar sw.js:', error);
        return false;
      }
    };

    const registerServiceWorker = async () => {
      try {
        const swExists = await hasAppServiceWorker();

        if (!swExists) {
          console.log('[SW] Service Worker não encontrado, limpando registros antigos');
          await cleanupOldServiceWorkers('sw.js ausente');
          return;
        }

        const registration = await navigator.serviceWorker.register(APP_SERVICE_WORKER_URL);
        console.log('[SW] Service Worker registrado com sucesso');

        // Verificar atualizações periodicamente (a cada 1 hora)
        updateIntervalId = window.setInterval(() => {
          registration.update().catch(() => {
            // Ignora erros de update silenciosamente
          });
        }, 60 * 60 * 1000);

      } catch (error) {
        console.log('[SW] Erro ao registrar Service Worker:', error);
        // Falha silenciosa - o app continua funcionando sem SW
      }
    };

    // Quando o controlador mudar (novo SW assumiu), recarregar UMA vez
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    const handleWindowLoad = () => {
      void registerServiceWorker();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    if (document.readyState === 'complete') {
      void registerServiceWorker();
    } else {
      window.addEventListener('load', handleWindowLoad);
    }

    return () => {
      if (updateIntervalId !== null) {
        window.clearInterval(updateIntervalId);
      }

      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      window.removeEventListener('load', handleWindowLoad);
    };
  }, []);

  return null;
}
