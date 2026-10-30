// Product-event smoke: node tests/e2e/events-smoke.mjs  (dev server on 127.0.0.1:5173; PORT to change it)
// Every *.supabase.co request is aborted: the game must still run with no page errors, and the queue (FW.ev on #dev)
// must hold what a first session produced, unsent: first_open, session_start, tutorial_done, run_end, share, session_end.
// Then, against a fake backend, the wiring (rpc track, keepalive on hide) and the 사4-0 funnel props of run_end / session_start /
// daily_done over real runs; every track body goes to CAPTURE (a JSON path; default: events-capture.json in the temp dir).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
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
// bot (tests/e2e/surprise-smoke.mjs): flap whenever the bird sinks below the next gap's centre; stops when `until` says so, the run ends or the step cap is hit
const flyOn = (pg, until, cap = 120 * 120) => pg.evaluate(([u, c]) => {
  const stop = new Function('FW', 'return ' + u), flap = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  for (let i = 0; i < c && FW.state === 'play'; i++){
    const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), ty = g ? g.base + (g.off || 0) : 300;
    if (FW.bird.y > ty + 6 && FW.bird.vy > -120) flap();
    FW.step(1/120);
    if (stop(FW)) return 'hit';
  }
  return FW.state;
}, [until, cap]);
assert.deepEqual(await kinds(), ['session_start', 'first_open'], 'a first launch queues session_start and first_open');
const sid = await page.evaluate(() => FW.ev.st.sid); assert.match(sid, /^[0-9a-z]{16}$/);

// first run: the tutorial starts, gate 2 moves it to tip 2 and gate 6 to tip 3 (tutNext), the death then ends it as done
await tap('startBtn');
await page.waitForFunction(() => FW.state === 'play');
assert.equal(await flyOn(page, 'FW.run.gatesPassed >= 6', 120 * 600), 'hit', 'the bot reaches gate 6 on the first run');
await page.waitForTimeout(300);   // tutTick runs on the frame loop, not in FW.step: two real frames move tip 1 -> 2 -> 3
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
// the fake backend: a guest session, every rpc empty, each track body kept in `calls` (nothing reaches a real server)
const fakeBackend = (page, calls) => page.route(/supabase\.co/, async r => {
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
await fakeBackend(p2, calls);
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

// 사4-0 funnel props (semantics: tests/events-props.test.js). A seeded device (tutorial done, every stage open, 5,000 coins so the continue card
// comes up) plays against the fake backend: a death with the card declined, one with the coin continue taken, a boss death (FW.bossGo), a daily,
// and stage 1 flown to its 100th gate when the bot makes it. Every track body is captured. Checks: no kind outside the allow-list, every run_end
// carries the new fields with sane values, props far under 1 KB, and the events per run are the ones of old (run_end, plus daily_done on a daily
// and level_up on a level-up): 사4-0 widened props, never the count.
const KINDS = ['first_open', 'session_start', 'session_end', 'tutorial_done', 'run_end', 'daily_done', 'shop_buy', 'ad_view', 'share', 'level_up'];
const RUN_FIELDS = ['mode', 'score', 'gates', 'stage', 'bird', 'goal', 'pct', 'clr', 'cont', 'cm', 'bhp', 'att', 'best0', 'dur', 'sn', 'plat', 'v'];
const ctx3 = await b.newContext({ viewport: { width: 390, height: 844 } }), p3 = await ctx3.newPage(), calls3 = [], err3 = [];
p3.on('pageerror', e => err3.push('pageerror: ' + e.message));
await fakeBackend(p3, calls3);
await p3.goto(base);
const z50 = () => Array(50).fill(0);
await p3.evaluate(seed => { localStorage.clear(); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v)); },
  { fw27_tut: 1, fw27_lang: 'en', fw27_dintro: 1, fw27_ev_first: 1, fw27_stg2: { gates: z50(), score: z50(), clr: z50(), star: z50(), open: 49 }, fw27_wallet2: { xp: 0, lvl: 1, coins: 5000, dia: 0, gems: 0 } });
await p3.reload(); await p3.waitForFunction(() => window.FW && FW.state === 'menu' && FW.ev.tok, null, { timeout: 20000 });
assert.equal(await p3.evaluate(() => FW.W.coins), 5000, 'the seeded wallet survived the cloud pull');
const menu = async () => { if (await p3.evaluate(() => FW.state) === 'menu') return; await p3.evaluate(() => document.getElementById('menuBtn').click()); await p3.waitForFunction(() => FW.state === 'menu'); };
const start = async i => { await menu(); await p3.evaluate(() => document.getElementById('startBtn').click()); await p3.evaluate(n => document.querySelectorAll('#stageScr .stc')[n].click(), i); await p3.waitForFunction(() => FW.state === 'play'); };
const fly = (until, cap) => flyOn(p3, until, cap);
// the run is over: the result card, or the continue card first (declined here) — the real frame loop runs the death beat
const ended = async () => {
  await p3.waitForFunction(() => FW.state === 'cont' || FW.state === 'over', null, { timeout: 15000 });
  if (await p3.evaluate(() => FW.state) === 'cont') await p3.evaluate(() => document.getElementById('contNo').click());
  await p3.waitForFunction(() => FW.state === 'over', null, { timeout: 15000 }); await p3.waitForTimeout(150);
};
const labels = [];
// run 1: stage 1, three points, a death with the continue card up, declined
await start(0); await p3.waitForTimeout(1100);
assert.equal(await fly('FW.run.score >= 3'), 'hit', 'three points for the continue card');
await p3.evaluate(() => FW.kill()); await p3.waitForFunction(() => FW.state === 'cont', null, { timeout: 10000 }, 'the continue card');
await ended(); labels.push('decline');
// run 2: stage 1 again, the coin continue taken, then the second death (no second card: once a run)
await start(0); assert.equal(await fly('FW.run.score >= 3'), 'hit');
await p3.evaluate(() => FW.kill()); await p3.waitForFunction(() => FW.state === 'cont', null, { timeout: 10000 });
const coins0 = await p3.evaluate(() => FW.W.coins);
await p3.evaluate(() => document.getElementById('contCoin').click()); await p3.waitForFunction(() => FW.state === 'play');
assert.equal(await p3.evaluate(() => FW.W.coins), coins0 - 200, 'the continue cost its 200 coins');
await p3.evaluate(() => FW.step(1/60, 30)); await p3.evaluate(() => FW.kill());
await ended(); labels.push('coin');
// run 3: stage 10, its boss fight at once (FW.bossGo skips the course), a death with the boss at full HP
await start(9); assert.equal(await p3.evaluate(() => FW.bossGo()), true, 'the boss fight starts');
await p3.evaluate(() => FW.step(1/60, 10)); await p3.evaluate(() => FW.kill());
await ended(); labels.push('boss');
// run 4: the daily (first ever on this device)
await menu(); await p3.evaluate(() => document.getElementById('dailyBtn').click()); await p3.waitForFunction(() => FW.state === 'play');
await p3.evaluate(() => FW.step(1/60, 30)); await p3.evaluate(() => FW.kill());
await ended(); labels.push('daily');
// run 5+: stage 1 flown to its 100th gate — a stage win when the bot makes it (another course each try); a failed try is one more ordinary death
let won = false, tries = 0;
for (; tries < 12 && !won; tries++){
  await p3.evaluate(v => { FW.salt = v; }, 'try' + (tries + 1)); await start(0);
  won = await fly('FW.FX.winT > 0', 120 * 600) === 'hit';
  if (won) await p3.evaluate(() => FW.step(1/60, 100));
  await ended(); labels.push(won ? 'win' : 'win-try');
}
// everything out through track, then the hide beacon
await p3.evaluate(async () => { for (let i = 0; i < 20 && FW.ev.st.q.length; i++){ await FW.ev.flush(); await new Promise(r => setTimeout(r, 50)); } });
assert.equal(await p3.evaluate(() => FW.ev.st.q.length), 0, 'the queue went out');
const n3 = calls3.length;
await p3.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
for (let i = 0; i < 40 && calls3.length === n3; i++) await p3.waitForTimeout(100);
assert.deepEqual(err3, [], 'no page errors');

const events = calls3.flatMap(c => c.body.p_events), runs = events.filter(e => e.k === 'run_end');
const bytes = e => JSON.stringify(e.p).length, count = ks => ks.reduce((m, k) => ({ ...m, [k]: (m[k] || 0) + 1 }), {});
assert.deepEqual(events.filter(e => !KINDS.includes(e.k)), [], 'no new kind');
assert.equal(runs.length, labels.length, 'one run_end a run: ' + JSON.stringify(labels));
assert.ok(events.every(e => e.p && e.p.plat === 'web' && e.p.v === ''), 'plat and v under every event');
for (const r of runs){
  for (const f of RUN_FIELDS) assert.ok(f in r.p, `${f} in ${JSON.stringify(r.p)}`);
  assert.ok(['endless', 'daily'].includes(r.p.mode) && Number.isInteger(r.p.gates) && r.p.gates >= 0 && Number.isInteger(r.p.dur) && r.p.dur >= 0 && [0, 1].includes(r.p.clr) && [0, 1, 2].includes(r.p.cont) && r.p.bhp >= -1 && r.p.bhp <= 100, JSON.stringify(r.p));
  assert.ok(bytes(r) < 400, 'run_end under 400 bytes: ' + bytes(r));
}
assert.deepEqual(runs.map(r => r.p.sn), labels.map((_, i) => i + 1), 'sn counts the runs of the session');
const [d1, d2, bo, da] = runs;
assert.ok(d1.p.stage === 1 && d1.p.goal === 100 && d1.p.cont === 1 && d1.p.cm === '' && d1.p.clr === 0 && d1.p.bhp === -1 && d1.p.att === 1 && d1.p.best0 === 0 && d1.p.dur >= 1 && d1.p.score >= 3 && d1.p.pct === Math.round(d1.p.gates) / 100, 'decline: ' + JSON.stringify(d1.p));
assert.ok(d2.p.stage === 1 && d2.p.cont === 2 && d2.p.cm === 'coin' && d2.p.att === 2 && d2.p.best0 === d1.p.gates && d2.p.clr === 0, 'coin continue, second attempt, best0 is run 1: ' + JSON.stringify(d2.p));
assert.ok(bo.p.stage === 10 && bo.p.gates === 100 && bo.p.goal === 100 && bo.p.pct === 1 && bo.p.bhp === 100 && bo.p.cont === 0 && bo.p.att === 1 && bo.p.clr === 0, 'boss death at full HP: ' + JSON.stringify(bo.p));
assert.ok(da.p.mode === 'daily' && da.p.stage === null && da.p.goal === 0 && da.p.pct === 0 && da.p.clr === 0 && da.p.cont === 0 && da.p.bhp === -1 && da.p.att === 0 && da.p.best0 === 0, 'daily: ' + JSON.stringify(da.p));
const dd = events[events.indexOf(da) + 1];
assert.ok(dd && dd.k === 'daily_done' && dd.p.stk === 1 && dd.p.gap === 0 && dd.p.streak === 1, 'daily_done right after, first ever: ' + JSON.stringify(dd));
if (won){ const w = runs.at(-1); assert.ok(w.p.clr === 1 && w.p.gates === 100 && w.p.pct === 1 && w.p.cont === 0 && w.p.bhp === -1 && w.p.att === 2 + tries, 'the win: ' + JSON.stringify(w.p)); }
assert.equal(events[0].k, 'session_start'); assert.deepEqual(events[0].p, { plat: 'web', v: '', lvl: 1, clr_n: 0 }, 'session_start: the level and the clears');
assert.equal(events.at(-1).k, 'session_end'); assert.ok(events.at(-1).p.dur >= 1 && events.at(-1).p.plat === 'web');
// the events per run: slice the stream at each run_end; a slice is run_end, then at most one daily_done (a daily) and one level_up — as before 사4-0
const cuts = runs.map(r => events.indexOf(r)), slices = cuts.map((c, i) => events.slice(c, i + 1 < cuts.length ? cuts[i + 1] : events.length).map(e => e.k).filter(k => k !== 'session_end'));
slices.forEach((ks, i) => { const c = count(ks); assert.ok(c.run_end === 1 && (c.daily_done || 0) <= (labels[i] === 'daily' ? 1 : 0) && (c.level_up || 0) <= 1 && Object.keys(c).every(k => ['run_end', 'daily_done', 'level_up'].includes(k)), `run ${i + 1} (${labels[i]}): ${ks}`); });
assert.deepEqual(events.slice(0, cuts[0]).map(e => e.k), ['session_start'], 'before the first run: the session start only');
const maxBytes = Math.max(...events.map(bytes)), maxRun = Math.max(...runs.map(bytes));
assert.ok(maxBytes < 1024, 'every props under the 1 KB cap');
const out = process.env.CAPTURE || join(tmpdir(), 'events-capture.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ base, at: new Date().toISOString(), trackCalls: calls3.length, runs: labels, won, tries, kinds: count(events.map(e => e.k)), maxPropsBytes: maxBytes, maxRunEndBytes: maxRun, events }, null, 1));
console.log(`PASS events-smoke funnel: ${events.length} events over ${calls3.length} track calls, ${runs.length} runs [${labels.join(', ')}]`);
console.log('kinds:', JSON.stringify(count(events.map(e => e.k))), '— none outside the allow-list of', KINDS.length);
console.log('run_end fields:', RUN_FIELDS.length, 'each (the five of old + 12 funnel fields); plat', events[0].p.plat, 'v', JSON.stringify(events[0].p.v));
console.log('run_end decline:', JSON.stringify(d1.p));
console.log('run_end coin:   ', JSON.stringify(d2.p));
console.log('run_end boss:   ', JSON.stringify(bo.p));
console.log('run_end daily + daily_done:', JSON.stringify(da.p), JSON.stringify(dd.p));
console.log(won ? 'run_end win:    ' + JSON.stringify(runs.at(-1).p) : `no win in ${tries} bot tries (the win fields are checked only when the bot makes it)`);
console.log(`props bytes: max ${maxBytes} (run_end max ${maxRun}) of 1024; events per run: ${slices.map(s => s.length).join('/')} — run_end (+daily_done, +level_up) as before`);
console.log('saved:', out);
await b.close();
