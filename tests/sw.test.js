// sw.js lets the Android app (a TWA on swishby.com) start with no signal. It runs here in a small fake worker global:
// the game page and its images are cached, Supabase, admin.html and anything but GET never are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const src = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://swishby.com';
const abs = u => new URL(typeof u === 'string' ? u : u.url, ORIGIN).href;

function fakeWorker({ net = async () => new Response('net', { status: 200 }), timeoutMs } = {}){
  const store = new Map(), handlers = {}, puts = [], fetched = [];
  const cacheOf = name => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      put: async (req, res) => { puts.push(abs(req)); m.set(abs(req), res); },
      match: async (req, o) => { const r = m.get(abs(req)) || (o && o.ignoreSearch ? m.get(abs(req).split('?')[0]) : undefined); return r && r.clone(); },   // a real cache hands out a fresh copy
      addAll: async list => { for (const u of list){ fetched.push(abs(u)); puts.push(abs(u)); m.set(abs(u), new Response('pre ' + u)); } }
    };
  };
  const caches = {
    open: async n => cacheOf(n),
    keys: async () => [...store.keys()],
    delete: async n => store.delete(n),
    match: async (req, o) => { for (const n of store.keys()){ const r = await cacheOf(n).match(req, o); if (r) return r; } }
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t, fn) => { handlers[t] = fn; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    registration: {}
  };
  const fetch = async (req, o) => { fetched.push(abs(req)); return net(abs(req), o); };
  const ctx = vm.createContext({ self, caches, fetch, URL, Response, Promise, setTimeout, clearTimeout, console });
  vm.runInContext(src.replace(/const NAV_TIMEOUT_MS = \d+;/, m => timeoutMs ? `const NAV_TIMEOUT_MS = ${timeoutMs};` : m), ctx);
  const fire = async (type, extra = {}) => {
    const waits = []; let responded = null;
    const ev = { ...extra, waitUntil: p => waits.push(p), respondWith: p => { responded = Promise.resolve(p); } };
    handlers[type](ev);
    const res = responded ? await responded : null;
    await Promise.allSettled(waits);
    return { responded: !!responded, res };
  };
  const req = (url, o = {}) => ({ url: abs(url), method: o.method || 'GET', mode: o.mode || 'cors', headers: {} });
  return { store, puts, fetched, fire, req, version: vm.runInContext('VERSION', ctx), caches };
}

test('sw.js has a version and no longer retires itself', () => {
  assert.match(src, /const VERSION = '[^']+';/);
  assert.doesNotMatch(src, /registration\.unregister\(\)/);
});

test('install precaches the game page, the logo and the manifest icons', async () => {
  const w = fakeWorker();
  await w.fire('install');
  const man = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(w.fetched.filter(u => u === abs('/')).length, 1, 'the 1.7 MB page is downloaded once for both keys');
  assert.ok(!w.fetched.includes(abs('/index.html')));
  for (const p of ['/', '/index.html', '/logo-swishby.webp', '/logo-swishby.png', ...man.icons.map(i => '/' + i.src)])
    assert.ok(w.puts.includes(abs(p)), `${p} is precached`);
  assert.equal(w.store.size, 1);
});

test('activate deletes the caches of older versions', async () => {
  const w = fakeWorker();
  await w.caches.open('flux-v1'); await w.caches.open('swishby-old');
  await w.fire('install');
  await w.fire('activate');
  assert.equal(w.store.size, 1);
  assert.ok([...w.store.keys()][0].includes(w.version));
});

test('Supabase, admin.html and non-GET requests are never answered or cached by the worker', async () => {
  const w = fakeWorker();
  for (const r of [w.req('https://abcd.supabase.co/rest/v1/fw_players'), w.req('https://abcd.supabase.co/storage/v1/x.png'),
    w.req('/admin.html', { mode: 'navigate' }), w.req('/admin', { mode: 'navigate' }), w.req('/admin.html'),
    w.req('/index.html', { method: 'POST', mode: 'navigate' }), w.req('/logo-swishby.png', { method: 'HEAD' })]){
    const { responded } = await w.fire('fetch', { request: r });
    assert.equal(responded, false, `${r.method} ${r.url} goes straight to the network`);
  }
  assert.deepEqual(w.puts, []);
  assert.ok(!/supabase|admin/.test(src.match(/const PRECACHE = \[[^\]]*\]/)[0]));
});

test('other origins and same-origin scripts or data go straight to the network', async () => {
  const w = fakeWorker();
  for (const r of [w.req('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js'), w.req('https://fonts.gstatic.com/s/x.woff2'),
    w.req('/fx-config.json'), w.req('/src/main.js')]){
    const { responded } = await w.fire('fetch', { request: r });
    assert.equal(responded, false, r.url);
  }
});

test('a navigation is network-first and refreshes the cached page', async () => {
  const w = fakeWorker({ net: async () => new Response('fresh', { status: 200 }) });
  await w.fire('install');
  const { res } = await w.fire('fetch', { request: w.req('/?ref=abc', { mode: 'navigate' }) });
  assert.equal(await res.text(), 'fresh');
  const cached = await w.caches.match(abs('/index.html'));
  assert.equal(await cached.text(), 'fresh');
});

test('an offline navigation falls back to the cached index.html', async () => {
  const w = fakeWorker();
  await w.fire('install');
  const off = fakeWorker({ net: async () => { throw new TypeError('offline'); } });
  for (const [k, v] of w.store) off.store.set(k, v);
  const { res } = await off.fire('fetch', { request: off.req('/', { mode: 'navigate' }) });
  assert.equal(await res.text(), 'net', 'the page install fetched');
  const other = await off.fire('fetch', { request: off.req('/privacy.html', { mode: 'navigate' }) });
  assert.equal(await other.res.text(), 'net');
});

test('a navigation slower than the timeout is answered from the cache', async () => {
  const w = fakeWorker({ timeoutMs: 20, net: () => new Promise(r => setTimeout(() => r(new Response('late')), 200)) });
  await w.caches.open('x');
  const c = await w.caches.open('swishby-' + w.version);
  await c.put('/index.html', new Response('cached'));
  const t0 = Date.now(), { res } = await w.fire('fetch', { request: w.req('/', { mode: 'navigate' }) });
  assert.equal(await res.text(), 'cached');
  assert.ok(Date.now() - t0 < 1000);
  assert.match(src, /const NAV_TIMEOUT_MS = 3000;/);
});

test('a slow navigation to another page waits for the network instead of showing the cached game', async () => {
  const w = fakeWorker({ timeoutMs: 20, net: () => new Promise(r => setTimeout(() => r(new Response('privacy page')), 120)) });
  const c = await w.caches.open('swishby-' + w.version);
  await c.put('/index.html', new Response('cached game'));
  for (const p of ['/privacy.html', '/delete-account.html', '/about/', '/guide/']){
    const { res } = await w.fire('fetch', { request: w.req(p, { mode: 'navigate' }) });
    assert.equal(await res.text(), 'privacy page', `${p} is not replaced by the game after the timeout`);
  }
});

test('an offline navigation to another page prefers its own cached copy', async () => {
  const w = fakeWorker({ net: async () => { throw new TypeError('offline'); } });
  const c = await w.caches.open('swishby-' + w.version);
  await c.put('/index.html', new Response('cached game'));
  await c.put('/terms.html', new Response('cached terms'));
  const t = await w.fire('fetch', { request: w.req('/terms.html', { mode: 'navigate' }) });
  assert.equal(await t.res.text(), 'cached terms');
  const p = await w.fire('fetch', { request: w.req('/privacy.html', { mode: 'navigate' }) });
  assert.equal(await p.res.text(), 'cached game', 'nothing else cached: the game opens rather than an error page');
});

test('same-origin images and fonts are cache-first', async () => {
  let n = 0;
  const w = fakeWorker({ net: async () => new Response('img' + (++n), { status: 200 }) });
  const r1 = await w.fire('fetch', { request: w.req('/guide/img/combo.jpg') });
  assert.equal(await r1.res.text(), 'img1');
  const r2 = await w.fire('fetch', { request: w.req('/guide/img/combo.jpg') });
  assert.equal(await r2.res.text(), 'img1', 'second answer comes from the cache');
  assert.equal(n, 1);
  const f = await w.fire('fetch', { request: w.req('/fonts/x.woff2') });
  assert.equal(f.responded, true);
});

test('failed or opaque answers are not cached', async () => {
  const w = fakeWorker({ net: async () => new Response('nope', { status: 404 }) });
  await w.fire('fetch', { request: w.req('/missing.png') });
  await w.fire('fetch', { request: w.req('/', { mode: 'navigate' }) });
  assert.deepEqual(w.puts, []);
});
