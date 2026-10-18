// Friend-alert toggle smoke: node tests/e2e/social-smoke.mjs  (dev server on 127.0.0.1:5173)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`;
const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(base);
await page.evaluate(() => localStorage.setItem('fw27_tut', '1'));
await page.reload(); await page.waitForFunction(() => window.FW && window.FW.soc);

const toastShown = () => page.evaluate(() => !document.getElementById('toast').hidden);
const inject = () => page.evaluate(() => FW.soc.show([{ id: 1, kind: 'on', nick: 'Kim', val: 0 }, { id: 2, kind: 'best', nick: 'Kim', val: 42 }]));

// default: master off -> nothing
assert.equal(await page.evaluate(() => FW.soc.on), false);
await inject(); assert.equal(await toastShown(), false, 'off must be silent');

// master on -> visible tab shows an in-app toast with the i18n text
await page.evaluate(() => document.getElementById('pushBtn').click());
assert.equal(await page.evaluate(() => FW.soc.on), true);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fw27_push'))), 1);
await inject();
assert.equal(await toastShown(), true, 'on + visible -> toast');
const txt = await page.evaluate(() => document.getElementById('toast').textContent);
assert.ok(/Kim/.test(txt) && /42/.test(txt), 'best toast text: ' + txt);

// per-kind off silences that kind
await page.evaluate(() => { document.getElementById('ntKBest').click(); });
await page.waitForTimeout(2400);   // let the old toast expire
await page.evaluate(() => FW.soc.show([{ id: 3, kind: 'best', nick: 'Lee', val: 9 }]));
assert.equal(await toastShown(), false, 'best kind off must be silent');
await page.evaluate(() => FW.soc.show([{ id: 4, kind: 'on', nick: 'Lee', val: 0 }]));
assert.equal(await toastShown(), true, 'on kind still routes');

// routing (pure): hidden tab goes to the OS only with permission and never in the artifact
const routes = await page.evaluate(() => {
  const st = o => ({ on: true, kinds: { on: true, best: true }, perm: 'granted', hidden: true, art: false, ...o });
  return [FW.soc.notifyRoute('on', st()), FW.soc.notifyRoute('on', st({ perm: 'denied' })), FW.soc.notifyRoute('on', st({ art: true }))];
});
assert.deepEqual(routes, ['os', 'none', 'none']);

// persistence across reload
await page.reload(); await page.waitForFunction(() => window.FW && window.FW.soc);
assert.deepEqual(await page.evaluate(() => [FW.soc.on, FW.soc.k.best, FW.soc.k.on]), [true, false, true]);
assert.deepEqual(errors, []);
console.log('social-smoke OK'); await b.close();
