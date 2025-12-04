importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Configuración de tu proyecto (Copiada de tu entorno)
const firebaseConfig = {
  apiKey: "AIzaSyCsVGkQCAbEZ2gpdoEalomgee6XfUoN7Kg",
  authDomain: "studio-354048519-4bc1e.firebaseapp.com",
  projectId: "studio-354048519-4bc1e",
  storageBucket: "studio-354048519-4bc1e.firebasestorage.app",
  messagingSenderId: "230155353645",
  appId: "1:230155353645:web:694381d43e63e9787a82a4"
};

// Inicializar Firebase en el Service Worker
firebase.initializeApp(firebaseConfig);

// Recuperar instancia de mensajería
const messaging = firebase.messaging();

// Manejador de notificaciones en segundo plano
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Notificación recibida en background:', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192x192.png', // Asegúrate de tener un icono aquí o usa uno genérico
    badge: '/icons/icon-72x72.png',
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});