const CACHE = 'pdf-tlac-v21';
const LIBS = 'pdf-tlac-lib-b964ed49';   // knižnice: menia sa zriedka, preto zvlášť (build.py sem dá odtlačok)
const SHARED = 'pdf-tlac-shared';
const APPS = ['pdf/', 'word/', 'excel/', 'poznamky/'];
const ICONS = ['icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png', 'manifest.webmanifest'];
const PAGES = ['./'].concat(APPS.map((a) => './' + a));
const ASSETS = PAGES.concat(ICONS.map((f) => './' + f), ...APPS.map((a) => ICONS.map((f) => './' + a + f)));
const LIBFILES = ['pdf.min.js', 'pdf.worker.min.js', 'mammoth.min.js', 'xlsx.min.js', 'docx.umd.js', 'pdf-lib.min.js', 'fontkit.min.js',
  'dejavu.b64.txt', 'dejavu-bold.b64.txt', 'fonts.css'].map((f) => './lib/' + f);

// stránka apky: /pdf/index.html a /pdf/?tab=1 sú tá istá stránka /pdf/
function pageKey(url) {
  const u = new URL(url);
  return u.origin + u.pathname.replace(/index\.html$/, '');
}

self.addEventListener('install', (e) => {
  e.waitUntil(Promise.all([
    caches.open(CACHE).then((c) => c.addAll(ASSETS)),
    caches.open(LIBS).then((c) => Promise.all(LIBFILES.map((f) => c.match(f).then((r) => r || c.add(f)))))
  ]));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== LIBS && k !== SHARED).map((k) => caches.delete(k))))
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
    const key = pageKey(req.url);
    e.respondWith(
      // no-cache: obísť 10-minútovú cache prehliadača, aby nová verzia prišla hneď
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
        if (!res.ok) throw new Error('http ' + res.status);
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(key, copy));
        return res;
      }).catch(() => caches.match(key, { ignoreSearch: true }).then((r) => r || caches.match(new URL('./', self.registration.scope).href)))
    );
    return;
  }

  if (url.pathname.indexOf('/lib/') >= 0) {
    e.respondWith(caches.open(LIBS).then((c) => c.match(req, { ignoreSearch: true }).then((r) => r || fetch(req).then((res) => {
      if (res.ok) c.put(req, res.clone());
      return res;
    }))));
    return;
  }

  e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});
