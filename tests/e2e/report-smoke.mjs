// Report / block smoke: node tests/e2e/report-smoke.mjs  (dev server: node scripts/serve.mjs, 127.0.0.1:5173)
// Supabase is blocked (every *.supabase.co request aborted), so this is the offline path: the menu opens, a report answers
// "online only" and sends nothing, a block is kept on the device and listed on the friends screen, unblock removes it. No page errors.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html`;
const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 390, height: 844 } });
const errors = [], supa = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED/.test(m.text())) errors.push(m.text()); });
await page.route(/\.supabase\.co\//, r => { supa.push(r.request().url()); return r.abort(); });
const X = '00000000-0000-4000-8000-00000000000a';

await page.goto(base + '#dev');
await page.evaluate(() => localStorage.setItem('fw27_tut', '1'));
await page.goto(base + '#dev');
await page.waitForFunction(() => window.FW && window.FW.rpt);

// the menu: the name, three reasons, block
await page.evaluate(x => FW.rpt.open([{ id: x, nick: 'RudeGuy' }], 'board'), X);
assert.equal(await page.evaluate(() => document.getElementById('plScr').hidden), false);
assert.equal(await page.textContent('#plNick'), 'RudeGuy');
assert.equal(await page.evaluate(() => document.getElementById('plPick').hidden), true, 'one player: no picker');
assert.equal(await page.locator('#plScr [data-rp]').count(), 3);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'no horizontal overflow at 390 px');
await page.screenshot({ path: process.env.SHOT || '/tmp/report-smoke.png' });

// offline: a report says so and sends nothing
await page.click('#plScr [data-rp="name"]');
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => document.getElementById('plScr').hidden), false, 'the menu stays open when the report did not go out');

// block: kept on this device, the menu closes
await page.click('#plBlk');
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fw27_block'))), [{ id: X, n: 'RudeGuy' }]);
assert.equal(await page.evaluate(() => document.getElementById('plScr').hidden), true);

// the friends screen lists it; unblock removes it
await page.click('#frBtn');
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => document.getElementById('frBlk').hidden), false);
assert.ok((await page.textContent('#frBlkList')).includes('RudeGuy'));
await page.screenshot({ path: (process.env.SHOT || '/tmp/report-smoke.png').replace('.png', '-fr.png') });
await page.click('#frBlkList .frx');
assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('fw27_block'))), []);
assert.equal(await page.evaluate(() => document.getElementById('frBlk').hidden), true);

// a match picker when there are several people
await page.click('#frClose');
await page.evaluate(() => FW.rpt.open([{ id: '00000000-0000-4000-8000-00000000000b', nick: 'Ann' }, { id: '00000000-0000-4000-8000-00000000000c', nick: 'Bob' }], 'versus'));
assert.equal(await page.evaluate(() => document.getElementById('plPick').hidden), false);
await page.click('#plPick button:nth-child(2)');
assert.equal(await page.textContent('#plNick'), 'Bob');

assert.deepEqual(errors, []);
console.log('report smoke: ok', { supabaseRequestsAborted: supa.length });
await b.close();
