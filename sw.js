self.addEventListener('install', (e) => {
 console.log('Service Worker instalado');
});

self.addEventListener('fetch', (e) => {
 // Necesario para que Chrome lo considere una App
});