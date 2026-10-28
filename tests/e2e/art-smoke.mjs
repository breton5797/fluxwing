// Higgsfield art smoke: node tests/e2e/art-smoke.mjs  (dev server: PORT=5291 node scripts/serve.mjs; PORT defaults to 5173)
// Every *supabase* request is aborted. Waits for the 29 art files, then screenshots at a 390x844 phone size: the gates of each zone, every surprise
// kind in each zone (mid-lunge, mid-flight, mid-fall), all five bosses, a hit flash, the enraged state and a telegraph. Then it blocks art/ and checks
// the procedural fallback draws without an error. Screenshots land in $SHOTS as art-*.png.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`, shots = process.env.SHOTS || tmpdir();
const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.route(/supabase/, r => r.abort());

const z50 = () => Array(50).fill(0);
const seed = () => page.evaluate(stg => { localStorage.clear(); for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'en', fw27_dintro: 1, fw27_stg2: stg }))
  localStorage.setItem(k, JSON.stringify(v)); }, { gates: z50(), score: z50(), clr: z50(), star: z50(), open: 49 });
const artIn = () => page.waitForFunction(() => performance.getEntriesByType('resource').filter(e => /\/art\/[\w-]+\.webp$/.test(e.name) && e.responseEnd > 0).length >= 29, null, { timeout: 15000 });
const boot = async () => { await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu'); await artIn(); await page.waitForTimeout(150); };
const start = async (i, salt = '') => { await page.evaluate(v => { FW.salt = v; document.getElementById('startBtn').click(); }, salt); await page.evaluate(n => document.querySelectorAll('#stageScr .stc')[n].click(), i);
  await page.waitForFunction(() => FW.state === 'play'); };
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const snap = async name => { await page.evaluate(() => { const d = document.getElementById('fxDev'); if (d) d.remove(); }); await frame(); await page.screenshot({ path: join(shots, `art-${name}.png`) }); console.log('shot', name); };
const fly = (until, cap = 120 * 120) => page.evaluate(([u, c]) => {
  const stop = new Function('FW', 'return ' + u), flap = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  for (let i = 0; i < c && FW.state === 'play'; i++){
    const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), ty = g ? g.base + (g.off || 0) : 300;
    if (FW.bird.y > ty + 6 && FW.bird.vy > -120) flap();
    FW.step(1/120);
    if (stop(FW)) return 'hit';
  }
  return FW.state;
}, [until, cap]);
const hold = () => page.evaluate(() => { FW.hold = true; });
const ZONE = [[0, 'grove'], [14, 'canyon'], [33, 'magma'], [45, 'palace']];

await page.goto(base);
await seed(); await boot();
await snap('menu');

// the gates of each zone, a few seconds in
for (const [st, zone] of ZONE){
  let got = false;
  for (let tries = 0; tries < 20 && !got; tries++){ await boot(); await start(st, tries ? 'try' + tries : ''); got = await fly('FW.run.gatesPassed >= 4') === 'hit'; }
  assert.ok(got, 'flew 4 gates in the ' + zone);
  await hold(); await snap(`gates-${zone}`);
}

// each surprise kind in each zone
const WANT = {
  snap: "FW.gates.some(g => g.sr && g.sr.k === 'snap' && g.sr.ext > .85)",
  shot: "FW.surs.some(e => e.k === 'shot' && e.t > .45 + .2)",
  drop: "FW.surs.some(e => e.k === 'drop' && e.t > .4 + .25)",
};
for (const [st, zone] of [[6, 'grove'], ...ZONE.slice(1)]) for (const kind of ['snap', 'shot', 'drop']){
  let got = false;
  for (let tries = 0; tries < 40 && !got; tries++){ await boot(); await start(st, tries ? 'try' + tries : ''); got = await fly(WANT[kind]) === 'hit'; }
  assert.ok(got, `${kind} seen on stage ${st + 1}`);
  await hold(); await snap(`sur-${kind}-${zone}`);
}

// the five bosses: in the fight, then a telegraph, a hit flash and the enraged state on two of them
// hover: steps at 1/120 s, flapping around mid-screen, until `until` holds (true) or the bird dies (false)
const hover = until => page.evaluate(u => { const stop = new Function('FW', 'return ' + u);
  for (let i = 0; i < 120 * 30; i++){ if (FW.state !== 'play') return false; if (stop(FW)) return true;
    if (FW.bird.y > 300 && FW.bird.vy > -100) dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); FW.step(1/120); }
  return false; }, until);
for (const [st, id] of [[9, 'mawbloom'], [19, 'dunehulk'], [29, 'cinderwyrm'], [39, 'moltenking'], [49, 'stormcrown']]){
  const more = id === 'cinderwyrm' || id === 'stormcrown';
  let ok = false;
  for (let tries = 0; tries < 15 && !ok; tries++){
    await boot(); await start(st, tries ? 'try' + tries : ''); await hold();
    assert.equal(await page.evaluate(() => FW.bossGo()), true);
    ok = await hover('FW.boss && FW.boss.ph === "fight" && FW.boss.t > .6') && (!more || await hover('FW.boss.s.ph === "tel" && FW.boss.at > .25'));
  }
  assert.ok(ok, 'the ' + id + ' fight shown');
  await snap(more ? `boss-${id}-tel` : `boss-${id}`);
  if (more){
    await page.evaluate(() => { FW.boss.hitT = .52; }); await snap(`boss-${id}-hit`);
    await page.evaluate(() => { FW.boss.hitT = 0; FW.boss.rage = true; }); await snap(`boss-${id}-rage`);
  }
}

// no art at all: every draw path falls back to the procedural art, without an error
await page.route(/\/art\//, r => r.abort());
await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu'); await page.waitForTimeout(1200);
await start(45); await fly('false', 120 * 2);
assert.equal(await page.evaluate(() => performance.getEntriesByType('resource').some(e => /\/art\//.test(e.name) && e.responseEnd > 0 && e.transferSize > 0)), false, 'no art got through');
await hold(); await snap('fallback-palace');

assert.deepEqual(errors, []);
await b.close();
console.log('art smoke: ok');
