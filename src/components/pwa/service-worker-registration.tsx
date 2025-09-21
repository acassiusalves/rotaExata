
'use client';

import React from 'react';

// Componente para registrar o Service Worker
export function ServiceWorkerRegistration() {
  React.useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV !== 'development') {
      window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
          console.log('Service Worker registration successful with scope: ', registration.scope);
        }, function(err) {
          console.log('Service Worker registration failed: ', err);
        });
      });
    }
  }, []);

  return null;
}
