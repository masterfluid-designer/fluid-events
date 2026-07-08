/**
 * Service Worker — EventScan PWA (CDC §10.2).
 *
 * Runtime caching :
 *  - /api/scan/validate → NetworkOnly (scan toujours en ligne, pas de cache)
 *  - assets statiques → StaleWhileRevalidate (offline-first pour l'UI)
 *
 * Le scanner reste volontairement en mode connecté : la validation QR
 * nécessite le verrou atomique côté serveur (CDC §9.5), impossible hors-ligne.
 */
const CACHE_VERSION = 'eventscan-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) =>
      cache.addAll(['/', '/scanner', '/manifest.json']).catch(() => {
        /* tolère les échecs de pré-cache */
      }),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('eventscan-') && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Scan : toujours en réseau (sécurité atomique côté serveur)
  if (url.pathname.includes('/api/scan/validate')) {
    return; // laisse passer sans interception
  }

  // GET uniquement pour le cache
  if (request.method !== 'GET') return;

  // Assets statiques : StaleWhileRevalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
