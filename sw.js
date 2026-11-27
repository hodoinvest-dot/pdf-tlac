const CACHE = 'pdf-tlac-v11';
const SHARED = 'pdf-tlac-shared';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-192.png', './icon-maskable-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== SHARED).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // súbor poslaný z inej apky cez Zdieľať
  if (req.method === 'POST' && url.pathname.endsWith('/share')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const file = form.get('pdf');
        if (file && file.size) {
          const c = await caches.open(SHARED);
          await c.put('shared.pdf', new Response(file, {
            headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-Type': file.type || '', 'X-Name': encodeURIComponent(file.name || 'dokument.pdf') }
          }));
        }
      } catch (err) { /* stránka ukáže chybu */ }
      return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
    })());
    return;
  }

  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // najprv internet (kvôli aktualizáciám), bez internetu uložená verzia
    e.respondWith(
      // no-cache: obísť 10-minútovú cache prehliadača, aby nová verzia prišla hneď
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
        if (!res.ok) throw new Error('http ' + res.status);
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
