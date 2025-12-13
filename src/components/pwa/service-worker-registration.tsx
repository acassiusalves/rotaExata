'use client';

import React from 'react';

// Componente para registrar o Service Worker com atualização automática
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    // Só registra em produção e se o navegador suportar
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Verifica se está na Vercel (onde o PWA está desabilitado)
    // A variável NEXT_PUBLIC_VERCEL é automaticamente definida pela Vercel
    const isVercel = process.env.NEXT_PUBLIC_VERCEL === '1' ||
                     window.location.hostname.includes('vercel.app') ||
                     window.location.hostname.includes('rotaexata');

    // Flag para evitar reload duplicado
    let refreshing = false;

    const registerServiceWorker = async () => {
      try {
        // Primeiro verifica se o sw.js existe
        const swResponse = await fetch('/sw.js', { method: 'HEAD' });
        if (!swResponse.ok) {
          console.log('[SW] Service Worker não encontrado, pulando registro');
          // Se há um SW antigo registrado, remove ele
          const registrations = await navigator.serviceWorker.getRegistrations();
          for (const registration of registrations) {
            console.log('[SW] Removendo SW antigo:', registration.scope);
            await registration.unregister();
          }
          return;
        }

        const registration = await navigator.serviceWorker.register('/sw.js');
        console.log('[SW] Service Worker registrado com sucesso');

        // Verificar atualizações periodicamente (a cada 1 hora)
        setInterval(() => {
          registration.update().catch(() => {
            // Ignora erros de update silenciosamente
          });
        }, 60 * 60 * 1000);

      } catch (error) {
        console.log('[SW] Erro ao registrar Service Worker:', error);
        // Falha silenciosa - o app continua funcionando sem SW
      }
    };

    // Se está na Vercel, apenas limpa SWs antigos (não registra novo)
    const cleanupOldServiceWorkers = async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          // Não remove o firebase-messaging-sw.js
          if (!registration.active?.scriptURL?.includes('firebase-messaging')) {
            console.log('[SW] Removendo SW antigo na Vercel:', registration.scope);
            await registration.unregister();
          }
        }
      } catch (error) {
        console.log('[SW] Erro ao limpar SWs antigos:', error);
      }
    };

    // Quando o controlador mudar (novo SW assumiu), recarregar UMA vez
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Na Vercel, apenas limpa SWs antigos
    // Em outros ambientes, registra o SW
    if (document.readyState === 'complete') {
      if (isVercel) {
        cleanupOldServiceWorkers();
      } else {
        registerServiceWorker();
      }
    } else {
      window.addEventListener('load', () => {
        if (isVercel) {
          cleanupOldServiceWorkers();
        } else {
          registerServiceWorker();
        }
      });
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null;
}
