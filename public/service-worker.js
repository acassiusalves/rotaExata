// Service Worker com atualização automática
// Skip waiting para que atualizações sejam aplicadas imediatamente

self.addEventListener('install', (event) => {
  // Força o novo Service Worker a assumir imediatamente
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Assume controle de todas as páginas imediatamente
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first strategy para garantir conteúdo atualizado
});
