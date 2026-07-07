// G & P Finance Service Worker v5 (network-first HTML + push + online applications + reliable uploads)
const CACHE_NAME = 'gp-finance-v5';
const APP_SHELL = [
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL).catch(err => console.warn('Cache warning:', err)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  const req = event.request;

  if (url.includes('supabase.co') || url.includes('/rest/') || url.includes('/auth/') || url.includes('/storage/')) {
    return;
  }

  if (req.method !== 'GET') return;

  const isHtmlRequest = req.destination === 'document' ||
                        url.endsWith('/') ||
                        url.endsWith('/index.html') ||
                        url.endsWith('/GandP-Finance/') ||
                        url.endsWith('/GandP-Finance/index.html');

  if (isHtmlRequest) {
    event.respondWith(
      fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.match(req).then(cached => {
              if (cached) {
                Promise.all([cached.text(), clone.clone().text()]).then(([oldText, newText]) => {
                  if (oldText !== newText) {
                    self.clients.matchAll().then(clients => {
                      clients.forEach(client => client.postMessage({ type: 'UPDATE_AVAILABLE' }));
                    });
                  }
                });
              }
              cache.put(req, clone).catch(() => {});
            });
          });
        }
        return response;
      }).catch(() => {
        return caches.match(req);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone).catch(() => {}));
        }
        return response;
      }).catch(() => cached);
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// =====================================================
// PUSH NOTIFICATION HANDLING
// =====================================================
self.addEventListener('push', event => {
  let payload = { title: 'G & P Finance', body: 'New notification', data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body || payload.message || 'New event',
    icon: payload.icon || '/favicon.svg',
    badge: payload.badge || '/favicon.svg',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: payload.data?.event_type || 'gp-notification',
    renotify: true
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'G & P Finance', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const baseUrl = self.registration.scope;
  let targetUrl = baseUrl;
  if (data.loan_id) targetUrl += `?open_loan=${data.loan_id}`;
  else if (data.client_id) targetUrl += `?open_client=${data.client_id}`;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // If app is already open, focus it and post a message to navigate
      for (const client of clientList) {
        if (client.url.startsWith(baseUrl)) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', data });
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
