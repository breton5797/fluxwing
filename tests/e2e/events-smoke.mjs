// Product-event smoke: node tests/e2e/events-smoke.mjs  (dev server on 127.0.0.1:5173)
// Every *.supabase.co request is aborted: the game must still run with no page errors, and the queue (FW.ev on #dev)
// must hold what a first session produced, unsent: first_open, session_start, tutorial_done, run_end, share, session_end.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`;
const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
const page = await ctx.newPage();
const errors = [], tracked = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
page.on('dialog', d => d.accept());
await page.route(/supabase\.co/, r => { if (/\/rpc\/track/.test(r.request().url())) tracked.push(r.request().url()); return r.abort(); });

await page.goto(base);
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForFunction(() => window.FW && window.FW.ev);
const tap = id => page.evaluate(i => document.getElementById(i).click(), id);   // the #dev FX panel covers the lower buttons
const kinds = () => page.evaluate(() => FW.ev.st.q.map(e => e.k));
assert.deepEqual(await kinds(), ['session_start', 'first_open'], 'a first launch queues session_start and first_open');
const sid = await page.evaluate(() => FW.ev.st.sid); assert.match(sid, /^[0-9a-z]{16}$/);

// first run: the tutorial starts, three flaps move it to tip 2, the death ends it
await tap('startBtn');
await page.waitForFunction(() => FW.state === 'play');
for (let i = 0; i < 4; i++){ await page.keyboard.press('Space'); await page.waitForTimeout(250); }
await page.waitForTimeout(300);
await page.evaluate(() => FW.kill());
await page.waitForFunction(() => FW.state === 'over', null, { timeout: 10000 });
await page.waitForTimeout(300);
let q = await page.evaluate(() => FW.ev.st.q);
assert.ok(q.some(e => e.k === 'tutorial_done' && e.p.how === 'run'), 'tutorial_done: ' + JSON.stringify(q.map(e => e.k)));
const run = q.find(e => e.k === 'run_end');
assert.ok(run && run.p.mode === 'endless' && run.p.stage === 1 && typeof run.p.score === 'number' && run.s === sid, 'run_end: ' + JSON.stringify(run));
assert.equal(await page.evaluate(() => localStorage.getItem('fw27_tut')), '1');

// a share from the result card
await tap('shareBtn'); await page.waitForTimeout(400);
q = await page.evaluate(() => FW.ev.st.q);
assert.ok(q.some(e => e.k === 'share' && e.p.mode === 'endless'), 'share: ' + JSON.stringify(q.map(e => e.k)));

// hiding the page ends the session with its visible seconds; offline nothing is sent, the queue keeps it
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
q = await page.evaluate(() => FW.ev.st.q);
const end = q.at(-1);
assert.ok(end.k === 'session_end' && end.p.dur >= 1, 'session_end: ' + JSON.stringify(end));
// back within the idle window: the same session
await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
assert.equal(await page.evaluate(() => FW.ev.st.sid), sid);
assert.equal(await page.evaluate(() => localStorage.getItem('fw27_ev_first')), null, 'first_open is marked only once delivered');

// the game still runs after all that
await tap('retryBtn');
await page.waitForFunction(() => FW.state === 'play', null, { timeout: 5000 });
assert.equal(tracked.length, 0, 'no track request without a server session');
assert.deepEqual(errors, [], 'no page or console errors');
console.log('PASS events-smoke offline', JSON.stringify(q.map(e => e.k)));

// Online, against a fake backend (every supabase.co request is answered here, nothing reaches a real server): a guest
// session comes up, the queue goes out through rpc('track') with the user's token, first_open is marked once delivered,
// and hiding the page sends session_end with fetch keepalive and the same bearer token.
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const UID = '00000000-0000-4000-8000-00000000abcd', exp = Math.floor(Date.now() / 1000) + 3600;
const JWT = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: UID, role: 'authenticated', aud: 'authenticated', exp, is_anonymous: true })}.sig`;
const user = { id: UID, aud: 'authenticated', role: 'authenticated', is_anonymous: true, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
const sess = { access_token: JWT, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r1', user };
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 } }), p2 = await ctx2.newPage(), calls = [], err2 = [];
p2.on('pageerror', e => err2.push('pageerror: ' + e.message));
await p2.route(/supabase\.co/, async r => {
  const u = new URL(r.request().url()), json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' } });
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  if (u.pathname === '/auth/v1/signup') return json(sess);
  if (u.pathname === '/auth/v1/user') return json(user);
  if (u.pathname === '/auth/v1/settings') return json({ external: {} });
  if (u.pathname === '/rest/v1/rpc/track'){ const body = JSON.parse(r.request().postData()); calls.push({ auth: r.request().headers()['authorization'], body }); return json(body.p_events.length); }
  if (u.pathname.startsWith('/rest/v1/fw_scores')) return json(u.searchParams.get('player_id') ? null : []);
  if (u.pathname.startsWith('/rest/v1/rpc/')) return json(null);
  if (u.pathname.startsWith('/realtime/')) return r.abort();
  return json([]);
});
await p2.goto(base);
await p2.waitForFunction(() => window.FW && window.FW.ev && FW.ev.tok, null, { timeout: 20000 });
await p2.evaluate(() => FW.ev.flush());
await p2.waitForFunction(() => localStorage.getItem('fw27_ev_first') === '1', null, { timeout: 10000 });
assert.ok(calls.length >= 1, 'a batch went out');
assert.equal(calls[0].auth, 'Bearer ' + JWT, 'with the guest token');
assert.deepEqual(calls[0].body.p_events.map(e => e.k), ['session_start', 'first_open']);
assert.match(calls[0].body.p_build, /^L\d+$/);
const n0 = calls.length;
await p2.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
await p2.waitForFunction(() => FW.ev.st.q.length === 0);
for (let i = 0; i < 40 && calls.length === n0; i++) await p2.waitForTimeout(100);
const last = calls.at(-1);
assert.ok(calls.length > n0 && last.auth === 'Bearer ' + JWT && last.body.p_events.at(-1).k === 'session_end', 'the hide flush: ' + JSON.stringify(last));
assert.deepEqual(err2, [], 'no page errors online');
console.log('PASS events-smoke online', calls.length, 'track calls');
await b.close();
