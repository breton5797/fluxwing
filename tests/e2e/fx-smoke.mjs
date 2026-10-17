// In-game FX smoke: node tests/e2e/fx-smoke.mjs  (dev server on 127.0.0.1:5173)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT || 5173}`;
const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`${base}/index.html#dev`);
await page.evaluate(() => localStorage.setItem('fw27_tut', '1'));   // skip the first-run tutorial auto-start
await page.reload();
await page.waitForFunction(() => window.FW && window.FW.imp, null, { timeout: 8000 });
await page.click('#startBtn'); await page.waitForTimeout(800);
await page.click('#stageList button');  await page.waitForTimeout(600);   // stage select opens once the tutorial is done
for (const q of ['low', 'mid', 'high']) {
  const r = await page.evaluate(q => { FW.setFxQuality(q); FW.fx('shieldHit'); FW.step(1 / 60, 30); FW.dbg.render(); return { q: FW.imp.q, waves: FW.imp.waves.length, feat: FW.imp.feat }; }, q);
  assert.equal(r.q, q);
  if (q === 'low') assert.deepEqual([r.feat.distort, r.feat.chroma, r.feat.bloom], [false, false, false]);
}
await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(300);
await page.evaluate(() => { FW.fx('death'); FW.dbg.render(); });
await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await page.waitForFunction(() => window.FW);
await page.click('#dailyBtn'); await page.waitForTimeout(600);
const fair = await page.evaluate(() => { FW.fx('near'); return FW.imp.slow; });
assert.equal(fair, 0, 'no slowmo in daily');
assert.deepEqual(errors, []);


// Task 3: every FX event replays, the pool caps instead of growing, real hooks spawn particles
await page.reload(); await page.waitForFunction(() => window.FW && window.FW.imp);
await page.click('#startBtn'); await page.waitForTimeout(400);
await page.click('#stageList button').catch(() => {}); await page.waitForTimeout(600);
const flapLive = await page.evaluate(() => { FW.setFxQuality('high'); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); FW.step(1 / 60, 2); return FW.imp.pool.live; });
assert.ok(flapLive > 0, 'flap spawns pooled particles');
const cp = await page.evaluate(() => { FW.fx('coin'); return FW.imp.coinPulse; });
assert.ok(cp > 0, 'coin pulse set');
for (const ev of await page.evaluate(() => FW.fxEvents)) {
  const r = await page.evaluate(ev => { FW.fx(ev); FW.step(1 / 60, 10); FW.dbg.render(); return FW.imp.pool.live; }, ev);
  assert.ok(Number.isInteger(r), ev);
}
const cap = await page.evaluate(() => { FW.setFxQuality('low'); for (let i = 0; i < 50; i++) FW.fx('death'); return [FW.imp.pool.live, FW.imp.pool.items.length]; });
assert.ok(cap[0] <= cap[1]);

// Task 4: death look + clean restart + combo levels
await page.reload(); await page.waitForFunction(() => window.FW && window.FW.imp);
await page.click('#startBtn'); await page.waitForTimeout(400);
await page.click('#stageList button').catch(() => {}); await page.waitForTimeout(600);
const d = await page.evaluate(() => { FW.kill(); const s = []; for (let i = 0; i < 95; i++){ FW.step(1 / 60, 1); s.push(FW.imp.gray); } return s; });
assert.ok(d.some(g => g > .9), 'greyscale reached');
const restarted = await page.evaluate(async () => { document.getElementById('retryBtn').click(); await new Promise(r => setTimeout(r, 500)); return [FW.imp.gray, FW.imp.slow]; });
assert.deepEqual(restarted, [0, 0], 'no leftover death look');
assert.equal(await page.evaluate(() => FW.comboLevelOf(30, 2)), 4);

// Task 5: settings UI persists and feeds the next run's features
await page.reload(); await page.waitForFunction(() => window.FW && window.FW.imp);
await page.click('#fxBtn');
await page.click('[data-fxq="low"]'); await page.click('[data-fxshake]');
const saved = await page.evaluate(() => [localStorage.getItem('fw27_fxq'), localStorage.getItem('fw27_fxshake')]);
assert.equal(JSON.parse(saved[0]), 'low'); assert.equal(JSON.parse(saved[1]), false);
await page.click('#fxClose');
await page.click('#startBtn'); await page.waitForTimeout(300);
await page.click('#stageList button').catch(() => {}); await page.waitForTimeout(500);
const feat2 = await page.evaluate(() => [FW.imp.feat.shake, FW.imp.q]);
assert.deepEqual(feat2, [0, 'low']);

// Task 6: dev panel exposes every event; absent on the release URL
const btns = await page.$$eval('#fxDev [data-fxev]', els => els.map(e => e.dataset.fxev));
assert.deepEqual(btns.sort(), (await page.evaluate(() => FW.fxEvents)).slice().sort());
for (const ev of btns) await page.click(`#fxDev [data-fxev="${ev}"]`);
assert.deepEqual(errors, []);
await page.goto(`${base}/index.html`);
await page.waitForTimeout(400);
assert.equal(await page.$('#fxDev'), null);
assert.equal(await page.evaluate(() => typeof window.FW), 'undefined');
console.log('fx-smoke OK'); await b.close();
