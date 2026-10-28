// SWISHBY service worker: lets the Android app (a TWA that opens swishby.com) start with no signal.
// index.html registers it only on swishby.com and *.vercel.app previews (swOk), never on the dev server or in the iOS app.
// The game page is network-first (a deploy shows up on the next launch); same-origin images and fonts are cache-first,
// so bump VERSION when one of them changes in place. Supabase, admin.html and any request but GET are never touched.
const VERSION = '2026-10-28.1';
const CACHE = `swishby-${VERSION}`;
const NAV_TIMEOUT_MS = 3000;
const PAGE = '/index.html';
const PRECACHE = ['/logo-swishby.webp', '/logo-swishby.png', '/icon-192.png', '/icon-512.png', '/icon.svg', '/apple-touch-icon.png'];
const STATIC_RX = /\.(?:png|webp|jpe?g|gif|svg|ico|woff2?|ttf|otf)$/i;

// 'page' | 'static' | null (null: the worker stays out of it and the browser goes to the network as usual)
function kindOf(req){
  if (req.method !== 'GET') return null;
  const u = new URL(req.url);
  if (/(^|\.)supabase\.co$/i.test(u.hostname) || u.origin !== self.location.origin) return null;
  if (/^\/admin(\.html)?$/i.test(u.pathname)) return null;
  if (req.mode === 'navigate') return 'page';
  return STATIC_RX.test(u.pathname) ? 'static' : null;
}
const isGame = req => /^\/(index\.html)?$/.test(new URL(req.url).pathname);
// A navigation cannot be answered with a redirected response, so a cached copy is stored as a plain one
const plain = res => res.redirected ? new Response(res.body, { status: res.status, statusText: res.statusText, headers: res.headers }) : res;

async function putPage(res){
  const c = await caches.open(CACHE), p = plain(res);
  await c.put('/', p.clone());
  await c.put(PAGE, p);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const res = await fetch('/', { cache: 'no-cache' });   // one download serves both '/' and '/index.html'
    if (!res.ok) throw new Error(`precache / ${res.status}`);
    await putPage(res);
    await c.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

async function fallback(req){
  return (isGame(req) ? null : await caches.match(req, { ignoreSearch: true })) || caches.match(PAGE);
}

function page(event){
  const req = event.request;
  const net = fetch(req).then(async res => { if (res.ok && isGame(req)) await putPage(res.clone()); return res; });
  event.waitUntil(net.catch(() => {}));
  let timer;
  const slow = new Promise(res => { timer = setTimeout(res, NAV_TIMEOUT_MS, null); });
  return Promise.race([net, slow]).catch(() => null).then(async res => {
    clearTimeout(timer);
    if (res) return res;
    return (await fallback(req)) || net;   // nothing cached yet: keep waiting for the network (or its error)
  });
}

async function stat(req){
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok){ const c = await caches.open(CACHE); await c.put(req, res.clone()); }
  return res;
}

self.addEventListener('fetch', event => {
  const k = kindOf(event.request);
  if (k === 'page') event.respondWith(page(event));
  else if (k === 'static') event.respondWith(stat(event.request));
});
