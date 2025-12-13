'use client';

import React from 'react';

// Componente para registrar o Service Worker com atualização automática
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    // Só registra em produção e se o navegador suportar
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Flag para evitar reload duplicado
    let refreshing = false;

    const registerServiceWorker = async () => {
      try {
        // Primeiro verifica se o sw.js existe
        const swResponse = await fetch('/sw.js', { method: 'HEAD' });
        if (!swResponse.ok) {
          // SW não existe, não tenta registrar
          return;
        }

        const registration = await navigator.serviceWorker.register('/sw.js');

        // Verificar atualizações periodicamente (a cada 1 hora)
        setInterval(() => {
          registration.update().catch(() => {
            // Ignora erros de update silenciosamente
          });
        }, 60 * 60 * 1000);

      } catch {
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

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Registra após o load da página
    if (document.readyState === 'complete') {
      registerServiceWorker();
    } else {
      window.addEventListener('load', registerServiceWorker);
    }

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  return null;
}
