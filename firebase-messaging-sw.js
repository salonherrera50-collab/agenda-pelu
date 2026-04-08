importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

firebase.initializeApp({
      apiKey: "AIzaSyAcmTCIKmbTPGxTBtD_fRxt7-yb4lZ4plM",
      authDomain: "agenda-pelu-e31a9.firebaseapp.com",
      projectId: "agenda-pelu-e31a9",
      storageBucket: "agenda-pelu-e31a9.firebasestorage.app",
      messagingSenderId: "550887776386",
      appId: "1:550887776386:web:c908126b681ef5ad02549b",
      measurementId: "G-P4P6G5XM1P"
});

const messaging = firebase.messaging();

// Esto es lo que "despierta" al iPhone cuando llega el mensaje
messaging.onBackgroundMessage((payload) => {
  console.log('Push recibido:', payload);
  
  const notificationTitle = payload.notification.title || "Nueva Cita";
  const notificationOptions = {
    body: payload.notification.body || "Revisa la agenda del salón",
    icon: 'logo192.png',
    badge: 'logo192.png',
    // Parámetros críticos para iOS
    content_available: true,
    priority: "high",
    data: {
        click_action: "index.html"
    },
    // Sonido por defecto (el iPhone lo usará si el servidor no envía uno específico)
    sound: 'default' 
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});