importScripts('/rota-pwa-caches.js');
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil(removeRotaCaches().then(()=>self.registration.unregister()));
});
