'use client';

import React from 'react';

// Componente para registrar o Service Worker com atualização automática
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
      const registerServiceWorker = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');

          // Verificar atualizações periodicamente (a cada 1 hora)
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);

          // Quando uma nova versão estiver disponível
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                // Quando o novo SW estiver instalado e pronto
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // Nova versão disponível - recarregar automaticamente
                  window.location.reload();
                }
              });
            }
          });
        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      };

      // Quando o controlador mudar (novo SW assumiu), recarregar
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });

      window.addEventListener('load', registerServiceWorker);
    }
  }, []);

  return null;
}
