// Service Worker pentru Știri România
// Versiunea cache-ului - actualizează când faci modificări
const CACHE_NAME = 'stiri-romania-v2.0.0';
const RUNTIME_CACHE = 'stiri-romania-runtime';

// Fișierele care trebuie cache-uite pentru funcționare offline
const CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  // Adaugă alte resurse statice aici dacă ai
];

// URLs care trebuie cache-uite la runtime
const RUNTIME_CACHE_URLS = [
  'https://api.rss2json.com',
  'https://fonts.googleapis.com',
  'https://fonts.gstatic.com'
];

// Instalarea service worker-ului
self.addEventListener('install', event => {
  console.log('🔧 Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Caching app shell');
        return cache.addAll(CACHE_URLS);
      })
      .then(() => {
        console.log('✅ Service Worker installed successfully');
        // Forțează activarea imediat
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ Service Worker install failed:', error);
      })
  );
});

// Activarea service worker-ului
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      // Șterge cache-urile vechi
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('🗑️ Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Preia controlul tuturor clientilor
      self.clients.claim()
    ]).then(() => {
      console.log('✅ Service Worker activated successfully');
    })
  );
});

// Interceptarea request-urilor
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Doar pentru request-uri HTTP/HTTPS
  if (!request.url.startsWith('http')) {
    return;
  }
  
  // Strategy pentru app shell (cache first)
  if (CACHE_URLS.includes(url.pathname) || url.pathname === '/') {
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            console.log('📦 Serving from cache:', request.url);
            return response;
          }
          
          console.log('🌐 Fetching from network:', request.url);
          return fetch(request)
            .then(response => {
              // Clone response pentru cache
              if (response.status === 200) {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME)
                  .then(cache => cache.put(request, responseToCache));
              }
              return response;
            });
        })
        .catch(error => {
          console.error('❌ Fetch failed:', error);
          // Returnează o pagină offline básica dacă e disponibilă
          return caches.match('/index.html');
        })
    );
    return;
  }
  
  // Strategy pentru API-uri RSS (network first cu cache fallback)
  if (url.hostname === 'api.rss2json.com') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.status === 200) {
            console.log('🌐 RSS API success, caching response');
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => {
                // Cache doar pentru 10 minute
                cache.put(request, responseToCache);
                // Șterge cache-ul după 10 minute
                setTimeout(() => {
                  cache.delete(request);
                }, 10 * 60 * 1000);
              });
          }
          return response;
        })
        .catch(error => {
          console.log('📦 RSS API failed, trying cache');
          return caches.match(request)
            .then(cachedResponse => {
              if (cachedResponse) {
                console.log('📦 Serving cached RSS data');
                return cachedResponse;
              }
              // Dacă nu avem cache, returnăm o eroare handled
              return new Response(
                JSON.stringify({ 
                  status: 'error', 
                  message: 'Offline - no cached data available' 
                }),
                { 
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
        })
    );
    return;
  }
  
  // Strategy pentru alte resurse (network first)
  if (RUNTIME_CACHE_URLS.some(pattern => url.hostname.includes(pattern))) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.status === 200) {
            const responseToCache = response.clone();
            caches.open(RUNTIME_CACHE)
              .then(cache => cache.put(request, responseToCache));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }
  
  // Pentru toate celelalte request-uri, încearcă network first
  event.respondWith(
    fetch(request)
      .catch(() => {
        // Dacă network fail, încearcă cache
        return caches.match(request);
      })
  );
});

// Mesaje de la main thread
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('⏩ Skipping waiting...');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({
      version: CACHE_NAME
    });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('🗑️ Clearing all caches...');
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    }).then(() => {
      event.ports[0].postMessage({
        success: true,
        message: 'All caches cleared'
      });
    });
  }
});

// Sync background pentru actualizări
self.addEventListener('sync', event => {
  if (event.tag === 'background-sync') {
    console.log('🔄 Background sync triggered');
    event.waitUntil(
      // Aici poți adăuga logică pentru sincronizarea în background
      fetch('https://api.rss2json.com/v1/api.json?rss_url=https://www.digi24.ro/rss')
        .then(response => response.json())
        .then(data => {
          console.log('📰 Background sync completed');
          // Poți trimite notificări aici dacă sunt știri noi
        })
        .catch(error => {
          console.log('❌ Background sync failed:', error);
        })
    );
  }
});

// Push notifications (pentru viitor)
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: 'Vezi știrea',
        icon: '/icons/checkmark.png'
      },
      {
        action: 'close',
        title: 'Închide',
        icon: '/icons/xmark.png'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Click pe notificare
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

console.log('📰 Știri România Service Worker loaded successfully!');
