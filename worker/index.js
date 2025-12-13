// Custom Service Worker additions
// Este código é incluído no SW gerado pelo next-pwa

// Interceptar requisições ANTES do workbox processar
// Firebase e Google APIs devem passar direto sem cache
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Lista de domínios que devem ignorar o Service Worker completamente
  const bypassDomains = [
    'firestore.googleapis.com',
    'firebase.googleapis.com',
    'identitytoolkit.googleapis.com',
    'securetoken.googleapis.com',
    'www.googleapis.com',
    'firebaseinstallations.googleapis.com',
    'fcmregistrations.googleapis.com',
    '.firebaseapp.com',
    '.firebasestorage.app',
    '.cloudfunctions.net',
  ];

  // Se a URL contém algum dos domínios, deixa passar direto
  const shouldBypass = bypassDomains.some(domain => url.includes(domain));

  if (shouldBypass) {
    // Não interceptar - deixar o navegador fazer a requisição normalmente
    return;
  }
});
