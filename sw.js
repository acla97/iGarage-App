// Service worker di iGarage.
// - Pagina principale: prima la rete (così gli aggiornamenti arrivano subito alla prima apertura),
//   se la rete manca o è lenta (>3 s) si usa la copia salvata: l'app funziona offline.
// - Icone e manifest: dalla cache, aggiornati in background.
// Se cambi i file in modo importante, incrementa CACHE (es. v2).
const CACHE = 'garage-v10';
const ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function networkFirst(req, cache) {
  return new Promise((resolve) => {
    let done = false;
    const fallback = () => cache.match(req, { ignoreSearch: true }).then((m) => m || cache.match('index.html'));
    const timer = setTimeout(() => fallback().then((m) => { if (m && !done) { done = true; resolve(m); } }), 3000);
    fetch(req)
      .then((res) => {
        clearTimeout(timer);
        if (res && res.ok) cache.put(req, res.clone());
        if (!done) { done = true; resolve(res); }
      })
      .catch(() => {
        clearTimeout(timer);
        if (!done) fallback().then((m) => { done = true; resolve(m || new Response('Offline', { status: 503 })); });
      });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const isPage = req.mode === 'navigate' || /\/(index\.html)?$/.test(new URL(req.url).pathname);
  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      if (isPage) return networkFirst(req, cache);
      const cached = await cache.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      if (cached) { e.waitUntil(net); return cached; }
      return (await net) || new Response('', { status: 504 });
    })
  );
});
