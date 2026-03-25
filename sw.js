// --- 1. NOMBRE DE LA VERSIÓN ---
// ¡IMPORTANTE! Cambia 'v1.1' a 'v1.2' la próxima vez que subas cambios
const CACHE_NAME = 'v3.3'; 

const assets = [
  '/',
  'index.html',
  'script.js',
  'style.css',
  'manifest.json',
  '404.html'
];

// --- 2. INSTALACIÓN ---
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('SW: Cargando archivos en caché...');
      return cache.addAll(assets);
    }).then(() => self.skipWaiting()) // Obliga al nuevo SW a activarse de inmediato
  );
});

// --- 3. ACTIVACIÓN (Limpieza de caché vieja) ---
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('SW: Borrando caché antigua:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
});

// --- 4. PETICIONES (Estrategia: Primero red, si falla, caché) ---
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
