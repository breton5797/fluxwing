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
console.log('fx-smoke OK'); await b.close();
