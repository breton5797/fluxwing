// Unit-evolution smoke: node tests/e2e/evo-smoke.mjs  (dev server on 127.0.0.1:5173)
// Every *.supabase.co request is aborted. A bot clears stage 1 with VOLT, which already holds two other stage clears:
// the third clear must evolve it to form II (save + banner), the next stage run must fly form II's numbers, a daily run form I's,
// and the hangar must say what the form gives. Screenshots of form V land in $SHOTS (default: the system temp dir).
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`, shots = process.env.SHOTS || tmpdir();
const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.route(/supabase\.co/, r => r.abort());

const seed = evo => page.evaluate(e => { localStorage.clear(); for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'en', fw27_dintro: 1, fw27_evo: e }))
  localStorage.setItem(k, JSON.stringify(v)); }, evo);
const boot = async () => { await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu'); };
const tap = id => page.evaluate(i => document.getElementById(i).click(), id);
const stage1 = async () => { await tap('startBtn'); await page.evaluate(() => document.querySelector('#stageScr .stc').click()); await page.waitForFunction(() => FW.state === 'play'); };
await page.goto(base);

// 1. clearing stage 1 is VOLT's third distinct clear -> form II
await seed({ volt: [1, 2] }); await boot();
assert.match(await page.textContent('#hgEvo'), /^FORM I — 1 more stage clears to FORM II$/);
await stage1();
assert.equal(await page.evaluate(() => FW.PK.evoHit), 1, 'form I flies the base hitbox');
const cleared = await page.evaluate(() => {   // bot: flap whenever the bird sinks below the next gap's centre
  const flap = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  for (let i = 0; i < 120 * 90 && FW.state === 'play'; i++){
    const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), ty = g ? g.base + (g.off || 0) : 300;
    if (FW.bird.y > ty + 6 && FW.bird.vy > -120) flap();
    FW.step(1/120);
    if (FW.FX.clearDone) return true;
  }
  return FW.FX.clearDone;
});
assert.ok(cleared, 'the bot clears stage 1');
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fw27_evo'))), { volt: [0, 1, 2] });
await page.evaluate(() => FW.kill()); await page.waitForFunction(() => FW.state === 'over', null, { timeout: 10000 });

// 2. the next stage run flies form II; a daily run flies form I
await boot();
assert.match(await page.textContent('#hgEvo'), /^FORM II — 7 more stage clears to FORM III · Stage mode: hitbox −3% · Perfect \+1px$/);
await stage1();
const [hit, win, r, r0] = await page.evaluate(() => [FW.PK.evoHit, FW.PK.windowBonus, FW.bird.r, FW.BIRDS.find(u => u.id === 'volt').r]);
assert.deepEqual([hit, win], [0.97, 1]); assert.ok(Math.abs(r - r0 * 0.97) < 1e-9, `hitbox ${r} = ${r0} x 0.97`);
await page.evaluate(() => FW.kill()); await page.waitForFunction(() => FW.state === 'over', null, { timeout: 10000 });
await boot(); await tap('dailyBtn'); await page.waitForFunction(() => FW.state === 'play' && FW.mode === 'daily');
assert.deepEqual(await page.evaluate(() => [FW.PK.evoHit, FW.PK.evoGrav, FW.PK.windowBonus]), [1, 1, 0], 'daily is fair: no evolution numbers');

// 3. form V: the hangar line, starting shield, and screenshots of the look
await seed({ volt: Array.from({ length: 35 }, (_, i) => i) }); await boot();
assert.match(await page.textContent('#hgEvo'), /^FORM V — Final form reached · Stage mode: hitbox −12% · Perfect \+4px · gravity −5% · \+1 starting shield$/);
await page.waitForTimeout(400); await page.screenshot({ path: join(shots, 'evo-hangar-v.png') });
await stage1();
assert.deepEqual(await page.evaluate(() => [FW.PK.evoHit, FW.PK.evoGrav, FW.run.shields]), [0.88, 0.95, 1]);
for (let i = 0; i < 6; i++){ await page.keyboard.press('Space'); await page.waitForTimeout(160); }
await page.screenshot({ path: join(shots, 'evo-run-v.png') });

await b.close();
assert.deepEqual(errors, [], errors.join('\n'));
console.log('evo smoke: ok', shots);
