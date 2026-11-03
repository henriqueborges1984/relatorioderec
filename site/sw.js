// Relatório de Set — offline cache. Bump VERSION on each release.
const VERSION = 'rds-2.2.3';
const CORE = ['./', './index.html', './app.css', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './js/main.js', './js/util.js', './js/store.js', './js/docx.js', './js/model.js', './js/minipdf.js', './js/reports.js', './js/voice.js', './js/media.js', './js/drive.js', './js/config.js', './js/merge.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil((async () => { for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k); await self.clients.claim(); })()); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/.netlify/')) return;
    // network first (gets updates), cache when offline
    e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); } return r; }).catch(() => caches.match(req, { ignoreSearch: true }).then(h => h || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.host)) {
    e.respondWith(caches.match(req).then(h => h || fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })));
  }
});
