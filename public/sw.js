// Service worker: simpan kerangka aplikasi agar terbuka tanpa internet. Data API selalu diambil dari server.
const C = 'tk-v1';
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(['/']))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== C).map(x => caches.delete(x))))));
self.addEventListener('fetch', e => { if (e.request.method !== 'GET' || new URL(e.request.url).pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then(r => { const k = r.clone(); caches.open(C).then(c => c.put(e.request, k)); return r; }).catch(() => caches.match(e.request))); });
