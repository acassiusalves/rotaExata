// This file is intentionally left blank in development.
// next-pwa will generate the service worker in production.

// Import and initialize the Firebase SDK
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.2.0/firebase-messaging-compat.js');

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAJMoLSBriJDkNLYtjJ6-rJyaUK8x3sLG0",
  authDomain: "studio-7321304121-9aa4d.firebaseapp.com",
  projectId: "studio-7321304121-9aa4d",
  storageBucket: "studio-7321304121-9aa4d.firebasestorage.app",
  messagingSenderId: "470233078453",
  appId: "1:470233078453:web:4fdf0696986f5d48e5fcfc"
};

firebase.initializeApp(firebaseConfig);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/pwa-192.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
