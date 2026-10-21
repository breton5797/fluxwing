// Play pre-registration link smoke: node tests/e2e/play-link-smoke.mjs  (dev server: node scripts/serve.mjs, 127.0.0.1:5173)
// Supabase is blocked. An Android phone sees the link (Play listing, new tab) at 390 px without overflow; an iPhone does not. No page errors.
import { chromium, devices } from 'playwright';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html`;
const b = await chromium.launch();
const errors = [];
async function open(device) {
  const ctx = await b.newContext({ ...device });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.route(/\.supabase\.co\//, r => r.abort());
  await page.goto(base);
  await page.waitForSelector('#startBtn');
  return { ctx, page };
}
const a = await open(devices['Pixel 7']);
const link = await a.page.evaluate(() => { const e = document.getElementById('playPre'); return { hidden: e.hidden, href: e.href, text: e.textContent, target: e.target }; });
assert.equal(link.hidden, false, 'Android sees the link');
assert.match(link.href, /^https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.minimalkorea\.swishby&referrer=utm_source%3Dswishby_web/);
assert.equal(link.target, '_blank');
assert.ok(link.text.length > 5, link.text);
assert.equal(await a.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal overflow');
await a.page.locator('#playPre').scrollIntoViewIfNeeded();
await a.page.screenshot({ path: process.env.SHOT || '/tmp/play-link-smoke.png' });
await a.ctx.close();
const i = await open(devices['iPhone 15']);
assert.equal(await i.page.evaluate(() => document.getElementById('playPre').hidden), true, 'iPhone does not');
await i.ctx.close();
assert.deepEqual(errors, []);
console.log('play-link smoke: ok', link.text);
await b.close();
