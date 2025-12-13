'use client';

import React from 'react';

// Componente para registrar o Service Worker com atualização automática
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
      // Flag para evitar reload duplicado
      let refreshing = false;

      const registerServiceWorker = async () => {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');

          // Verificar atualizações periodicamente (a cada 1 hora)
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000);

        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      };

      // Quando o controlador mudar (novo SW assumiu), recarregar UMA vez
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      window.addEventListener('load', registerServiceWorker);
    }
  }, []);

  return null;
}
