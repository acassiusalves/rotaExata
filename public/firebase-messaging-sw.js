// Firebase Cloud Messaging Service Worker
// Este arquivo é necessário para receber notificações push do Firebase

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Configuração do Firebase (mesma do client.ts)
const firebaseConfig = {
  apiKey: "AIzaSyAJMoLSBriJDkNLYtjJ6-rJyaUK8x3sLG0",
  authDomain: "studio-7321304121-9aa4d.firebaseapp.com",
  projectId: "studio-7321304121-9aa4d",
  storageBucket: "studio-7321304121-9aa4d.firebasestorage.app",
  messagingSenderId: "470233078453",
  appId: "1:470233078453:web:4fdf0696986f5d48e5fcfc"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Inicializar Firebase Messaging
const messaging = firebase.messaging();

// Handler para mensagens recebidas em background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Recebida mensagem em background:', payload);

  // Priorizar dados do payload.data para evitar "from RotaExata"
  const notificationTitle = payload.data?.title || payload.data?.notificationTitle || payload.notification?.title || 'Nova Notificação';
  const notificationBody = payload.data?.body || payload.data?.notificationBody || payload.notification?.body || 'Você tem uma nova mensagem';

  const notificationOptions = {
    body: notificationBody,
    icon: '/icons/pwa-192.png',
    badge: '/icons/pwa-192.png',
    data: payload.data,
    tag: payload.data?.routeId || payload.data?.type || 'notification',
    requireInteraction: payload.data?.priority === 'high',
    actions: [
      {
        action: 'open',
        title: 'Abrir'
      },
      {
        action: 'close',
        title: 'Fechar'
      }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handler para cliques na notificação
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Clique na notificação:', event);

  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  // Abrir ou focar na janela da aplicação
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Se há uma janela aberta, focar nela
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Caso contrário, abrir nova janela
      if (clients.openWindow) {
        const routeId = event.notification.data?.routeId;
        const url = routeId ? `/my-routes/${routeId}` : '/driver/notifications';
        return clients.openWindow(url);
      }
    })
  );
});

console.log('[firebase-messaging-sw.js] Service Worker de Firebase Messaging carregado');
