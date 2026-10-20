// Friend-invite smoke: node tests/e2e/referral-smoke.mjs  (dev server: node scripts/serve.mjs, 127.0.0.1:5173)
// Supabase is blocked (every *.supabase.co request aborted), so this is the offline path: ?r= is read and kept on the device,
// stripped from the address bar, and the invite UI stays hidden without a server session. No page errors.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html`;
const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [], supa = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
await page.route(/\.supabase\.co\//, r => { supa.push(r.request().url()); return r.abort(); });

await page.goto(base + '#dev');
await page.evaluate(() => localStorage.setItem('fw27_tut', '1'));
await page.goto(base + '?c=12&r=7k3m-9qxz#dev');
await page.waitForFunction(() => window.FW && window.FW.ref);

// the code is read, normalised and kept until a sign-in can send it
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fw27_ref'))),
  { code: '7K3M9QXZ', at: await page.evaluate(() => new Date().toISOString().slice(0, 10)), st: '', day: '', stage: 0 });
// and stripped from the address bar; the challenge parameter and the hash stay
assert.deepEqual(await page.evaluate(() => [location.search, location.hash]), ['?c=12', '#dev']);

// offline: the sign-in never happens, nothing is sent, the record waits
await page.waitForTimeout(1500);
assert.equal(await page.evaluate(() => FW.ref.rec.st), '', 'not sent without a session');

// the friends screen opens, says offline, and the invite box stays hidden
await page.click('#frBtn');
await page.waitForFunction(() => document.getElementById('frStatus').textContent.length > 0 && !/…|\.\.\./.test(document.getElementById('frStatus').textContent), null, { timeout: 20000 }).catch(() => {});
assert.equal(await page.evaluate(() => document.getElementById('frRef').hidden), true, 'invite box hidden offline');

// the nudge needs a session too
await page.evaluate(() => FW.ref.nudge('best'));
assert.equal(await page.evaluate(() => document.getElementById('oRef').hidden), true, 'no nudge offline');
assert.equal(await page.evaluate(() => localStorage.getItem('fw27_refnudge')), null, 'an unshown nudge does not use up the day');

// the box renders a server answer (layout check at phone width): progress against 3 / 10 / 25 and per-friend days and stage
await page.evaluate(() => FW.ref.show({ code: '7K3M9QXZ', paid: 4, month: 4, cap: 25, ready: 0, held: 1, open: 2,
  friends: [{ nick: 'Mina', days: 2, stage: 7, done: false }, { nick: 'Joon', days: 3, stage: 10, done: true }], payouts: [] }));
const box = await page.evaluate(() => { const el = document.getElementById('frRef'); return { hidden: el.hidden, text: el.innerText, w: el.scrollWidth, cw: el.clientWidth }; });
assert.equal(box.hidden, false);
for (const s of ['3/3', '4/10', '4/25', '2/3', '7/10', '4/25']) assert.ok(box.text.includes(s), `shows ${s}: ${box.text}`);
assert.ok(box.w <= box.cw + 1, 'no horizontal overflow at 390 px');
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
await page.screenshot({ path: process.env.SHOT || '/tmp/referral-smoke.png' });

// a finished run offline: the result card shows, the nudge does not, nothing is reported
await page.click('#frClose');
await page.click('#startBtn'); await page.waitForTimeout(600);
await page.click('#stageList button'); await page.waitForTimeout(600);
await page.evaluate(() => FW.kill());
await page.waitForFunction(() => !document.getElementById('over').hidden, null, { timeout: 15000 });
assert.equal(await page.evaluate(() => document.getElementById('oRef').hidden), true, 'no nudge on the result card offline');
assert.equal(await page.evaluate(() => FW.ref.rec.st), '', 'no report offline');
await page.evaluate(() => { document.getElementById('oRef').hidden = false; });   // layout check of the nudge row
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
await page.screenshot({ path: (process.env.SHOT || '/tmp/referral-smoke.png').replace(/\.png$/, '-over.png') });

// a reload without r keeps the pending code (the first sign-in on a later visit still sends it)
await page.goto(base + '#dev'); await page.waitForFunction(() => window.FW && window.FW.ref);
assert.equal(await page.evaluate(() => FW.ref.rec.code), '7K3M9QXZ');

assert.ok(supa.length > 0, 'the game did try Supabase (and was blocked)');
assert.deepEqual(errors, []);
console.log(`referral-smoke OK (${supa.length} Supabase requests blocked)`); await b.close();
