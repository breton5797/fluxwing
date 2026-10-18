// 4-player FFA smoke over BroadcastChannel (#localtest): node tests/e2e/ffa-smoke.mjs  (dev server on 127.0.0.1:5173)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#localtest`;
const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const pages = [], errors = [];
for (let i = 0; i < 4; i++) {
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(i + ': ' + e.message));
  await p.goto(base);
  await p.evaluate(() => { localStorage.setItem('fw27_tut', '1'); localStorage.setItem('fw27_vsmode', '4'); });
  await p.reload(); await p.waitForFunction(() => window.FW);
  pages.push(p);
}
for (const p of pages) { await p.evaluate(() => document.getElementById('vsBtn').click()); await p.waitForTimeout(150); }
for (const p of pages) await p.evaluate(() => document.getElementById('vsAuto').click());
for (const p of pages) await p.waitForFunction(() => FW.mode === 'versus' && FW.state === 'play', null, { timeout: 25000 });
const setup = await Promise.all(pages.map(p => p.evaluate(() => [FW.vsRank.vs.sz, FW.vsRank.vs.pl.length, FW.vsRank.vs.ai])));
for (const [sz, n, ai] of setup) { assert.equal(sz, 4); assert.equal(n, 3); assert.equal(ai, null); }
// distinct scores, let them propagate, then everyone dies
for (let i = 0; i < 4; i++) await pages[i].evaluate(n => FW.setRun({ score: n }), (i + 1) * 7);
await pages[0].waitForTimeout(1200);
for (let i = 3; i >= 0; i--) { await pages[i].evaluate(() => FW.kill()); await pages[i].waitForTimeout(350); }
for (const p of pages) await p.waitForFunction(() => FW.vsRank.vs.result !== '', null, { timeout: 15000 });
const res = await Promise.all(pages.map(p => p.evaluate(() => [FW.vsRank.vs.place, FW.vsRank.vs.result, FW.run.score])));
console.log('results:', res);
assert.deepEqual(res.map(r => r[0]), [4, 3, 2, 1], 'places by score');
assert.equal(res[3][1], 'win');
assert.deepEqual(errors, []);
console.log('ffa-smoke OK'); await b.close();
