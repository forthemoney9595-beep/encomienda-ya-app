importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyCsVGkQCAbEZ2gpdoEalomgee6XfUoN7Kg",
  authDomain: "studio-354048519-4bc1e.firebaseapp.com",
  projectId: "studio-354048519-4bc1e",
  storageBucket: "studio-354048519-4bc1e.firebasestorage.app",
  messagingSenderId: "230155353645",
  appId: "1:230155353645:web:694381d43e63e9787a82a4"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// 1. Mostrar notificación en segundo plano
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Notificación recibida:', payload);
  
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    // Pasamos el link dentro de 'data' para leerlo en el click.
    // OJO (Fase PP): el payload que recibe el cliente NO tiene nivel `webpush` — el SDK
    // entrega { notification, data, fcmOptions }. El viejo `payload.webpush?...` era
    // siempre undefined y todos los push sin data.url abrían la home.
    data: {
        url: payload.fcmOptions?.link || payload.data?.url || '/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// 2. ✅ NUEVO: Manejar el CLIC en la notificación
self.addEventListener('notificationclick', function(event) {
  console.log('[SW] Notificación clickeada');
  
  // Cierra la notificación
  event.notification.close();

  // Recupera el link que guardamos en 'data'
  const link = event.notification.data.url;

  // Abre la ventana
  event.waitUntil(
    clients.matchAll({type: 'window', includeUncontrolled: true}).then(windowClients => {
      // Si ya hay una pestaña de la app abierta, la enfoca y navega al destino.
      // OJO (Fase PP): antes comparaba la URL ABSOLUTA de la pestaña contra el path
      // relativo del link -- nunca coincidía y siempre se abría una ventana nueva.
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if ('focus' in client) {
          if (client.navigate && link) client.navigate(link);
          return client.focus();
        }
      }
      // Si no, abre una nueva
      if (clients.openWindow) {
        return clients.openWindow(link);
      }
    })
  );
});