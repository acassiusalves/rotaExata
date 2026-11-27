// Firebase Cloud Messaging Service Worker
// Este arquivo é necessário para receber notificações push do Firebase

// Skip waiting e assume controle imediatamente para atualizações automáticas
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

importScripts('/rota-push-grant.js');
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
// Preserve the guard before the SDK can auto-render queued pre-cutover payloads.
self.addEventListener('push',event=>{
  let payload;
  try {payload=event.data?.json();} catch {return;}
  if (payload?.notification && typeof event.stopImmediatePropagation==='function') {
    event.stopImmediatePropagation();
    event.waitUntil(showDriverNotification(payload));
  }
});
self.addEventListener('message',event=>{
  if (event.data?.type==='rota-flush-push') event.waitUntil(flushRotaPushRevocations().catch(()=>{}));
});
const messaging = firebase.messaging();

function notificationTarget(routeId) {
  return typeof routeId==='string' && /^[A-Za-z0-9_-]{1,150}$/.test(routeId)
    ? '/my-routes/'+routeId : '/driver/notifications';
}

async function resolveBoundPush(data) {
  try {
    const grant=await readRotaPushGrant();
    if (!grant || grant.id!==data.bindingId) return null;
    const response=await fetch('/api/driver/push-delivery',{
      method:'POST',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({bindingId:grant.id,proof:grant.proof,deliveryId:data.deliveryId}),
    });
    if (!response.ok || (await readRotaPushGrant())?.id!==grant.id) return null;
    const payload=await response.json();
    return notificationTarget(payload.routeId);
  } catch {return null;}
}

async function acceptUnboundPush(data) {
  try {
    const grant=await readRotaPushGrant();
    if (grant) return false;
    const result=await fetch('/api/driver/push-delivery',{cache:'no-store',redirect:'error'});
    return result.ok && (!(await result.json()).native || data.legacyPush==='1');
  } catch {return false;}
}

async function showDriverNotification(payload) {
  await flushRotaPushRevocations().catch(()=>{});
  const data=payload.data ?? {};
  const bound=data.boundPush==='1';
  if (bound) {
    if (!await resolveBoundPush(data)) return;
  } else if (!await acceptUnboundPush(data)) return;
  const title=bound ? 'RotaExata' : data.title || data.notificationTitle || payload.notification?.title || 'Nova Notificação';
  const body=bound ? 'Você tem uma atualização. Abra o RotaExata para consultar.' :
    data.body || data.notificationBody || payload.notification?.body || 'Você tem uma nova mensagem';
  const options={
    body,icon:'/icons/pwa-192.png',badge:'/icons/pwa-192.png',
    data:bound ? {boundPush:'1',bindingId:data.bindingId,deliveryId:data.deliveryId} : data,
    tag:bound ? 'rota-bound:'+data.deliveryId : data.routeId || data.type || 'notification',
    actions:[{action:'open',title:'Abrir'},{action:'close',title:'Fechar'}],
  };
  return self.registration.showNotification(title,options);
}
messaging.onBackgroundMessage(showDriverNotification);

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  if (event.action==='close') return;
  const data=event.notification.data ?? {};
  event.waitUntil((async()=>{
    const target=data.boundPush==='1' ? await resolveBoundPush(data) : notificationTarget(data.routeId);
    if (!target) return;
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for (const client of windows) {
      if (new URL(client.url).origin!==self.location.origin || !client.focus) continue;
      if (new URL(client.url).pathname===target) return client.focus();
      if (client.navigate) {
        const navigated=await client.navigate(target).catch(()=>null);
        if (navigated) return navigated.focus();
      }
    }
    return clients.openWindow?.(target);
  })());
});
