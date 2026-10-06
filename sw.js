// Offline shell. Network-first so a new deploy is picked up immediately; the cache only
// answers when the network cannot.
const CACHE = 'fluxwing2-v1';
const SHELL = [
  './', 'index.html', 'styles.css', 'icon.svg', 'manifest.webmanifest',
  'src/main.js', 'src/audio.js', 'src/config.js', 'src/feedback.js', 'src/fx.js', 'src/logic.js',
  'src/progress.js', 'src/render.js', 'src/rng.js', 'src/sim.js', 'src/storage.js', 'src/ui.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Give the network a few seconds, then let the cache answer.
function fetchWithTimeout(request, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetchWithTimeout(request, 3000)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        if (request.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
        return Response.error();
      }),
  );
});
