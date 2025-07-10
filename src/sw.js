const CACHE_NAME = 'shitty-pwa-v1.1.0';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/sw.js',
];

// Dynamic assets to cache on first fetch
const DYNAMIC_ASSETS = [
  '/client.js',
  '/dist/main.js',
  'https://cdn.tailwindcss.com',
];

// Install event
self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('Service worker activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch handler with improved caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // For navigation requests, try network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/'))
    );
    return;
  }

  // For API requests, always use network (no caching)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  // For JS, CSS, and other assets, use cache-first strategy
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // If not in cache, fetch and cache it
        return fetch(request).then((networkResponse) => {
          // Only cache successful responses
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'opaque') {
            return networkResponse;
          }

          // Check if this is a dynamic asset we should cache
          const shouldCache = DYNAMIC_ASSETS.some(asset => 
            request.url.includes(asset) || 
            request.url.endsWith('.js') || 
            request.url.endsWith('.css')
          );

          if (shouldCache) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }

          return networkResponse;
        });
      })
      .catch(() => {
        // If both cache and network fail, return offline page for navigation
        if (request.mode === 'navigate') {
          return caches.match('/');
        }
      })
  );
});

// Handle skip waiting message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
}); 