// Service Worker for Gait Detection System PWA
// Version 1.0.0

const CACHE_NAME = 'gait-detection-v1.0.0';
const RUNTIME_CACHE = 'gait-detection-runtime-v1.0.0';

// Core app shell files to cache immediately
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  // Assets will be added dynamically as they're discovered
];

// TensorFlow.js files - these should be cached for performance
const TF_CACHE_PATTERN = /@tensorflow\/|\.tensorflow/;

// Install event - cache core files
self.addEventListener('install', (event) => {
  console.log('[SW] Install event triggered');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        // Force the waiting service worker to become the active service worker
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('[SW] Install failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event triggered');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete old caches that don't match our current cache names
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Take control of all pages immediately
        return self.clients.claim();
      })
      .catch((error) => {
        console.error('[SW] Activation failed:', error);
      })
  );
});

// Fetch event - handle requests with different strategies
self.addEventListener('fetch', (event) => {
  const { url } = event.request;

  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip cross-origin requests unless they're CDN resources
  if (!url.startsWith(self.location.origin) && !url.includes('cdn.jsdelivr.net')) {
    return;
  }

  // Strategy 1: Cache First for app shell and static assets
  if (
    url.endsWith('.html') ||
    url.endsWith('.css') ||
    url.endsWith('.js') ||
    url.endsWith('.json') ||
    url.includes('/assets/')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Strategy 2: Network First for TensorFlow models and dynamic content
  if (TF_CACHE_PATTERN.test(url) || url.includes('tfjs')) {
    event.respondWith(networkFirst(event.request, RUNTIME_CACHE));
    return;
  }

  // Strategy 3: Network Only for everything else (camera streams, etc.)
  event.respondWith(fetch(event.request).catch(() => {
    // Return offline page or cached response as fallback
    return caches.match('/index.html');
  }));
});

// Cache First strategy - best for static assets
async function cacheFirst(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // If not in cache, fetch from network
    const networkResponse = await fetch(request);

    // Cache the response for future use
    if (networkResponse.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error('[SW] CacheFirst failed:', error);
    // Return cached response as fallback
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // If nothing in cache, return offline page
    return caches.match('/index.html');
  }
}

// Network First strategy - best for dynamic content and API calls
async function networkFirst(request, cacheName) {
  try {
    // Try network first
    const networkResponse = await fetch(request);

    // Cache the response for offline use
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', error);
    // If network fails, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // If nothing in cache, return offline page
    return caches.match('/index.html');
  }
}

// Handle background sync (optional enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncData());
  }
});

// Handle push notifications (optional enhancement)
self.addEventListener('push', (event) => {
  const options = {
    body: event.data ? event.data.text() : 'New notification',
    icon: '/image.png',
    badge: '/image.png',
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification('Gait Detection', options));
});

// Sync data function placeholder
async function syncData() {
  // Implement data sync logic here if needed
  console.log('[SW] Background sync triggered');
}
