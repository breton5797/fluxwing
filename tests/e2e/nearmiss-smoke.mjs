// Near-miss line smoke (다4, experiment 1 of 사5-lite): node tests/e2e/nearmiss-smoke.mjs  (dev server: PORT=5281 node scripts/serve.mjs; PORT defaults to 5173)
// Every *.supabase.co request is aborted. Two installs, one in each arm of 'nm' (their ids picked with the page's own abArm), lose the stage 10 boss fight
// (FW.bossGo, then FW.kill): arm b's result card shows the boss HP really left, arm a's card is as before. Both runs carry props.v. Screenshot in $SHOTS.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadAb } from '../helpers/ab.js';

const A = loadAb();
const pick = arm => { for (let i = 0; ; i++){ const id = i.toString(36).padStart(16, '0'); if (A.abArm(A.AB_DEF, id, 'nm') === arm) return id; } };
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`, shots = process.env.SHOTS || tmpdir();
const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.route(/supabase/, r => r.abort());
await page.goto(base);

const z50 = () => Array(50).fill(0);
async function lose(id){
  await page.evaluate(([stg, id]) => { localStorage.clear(); for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'en', fw27_dintro: 1, fw27_stg2: stg, fw27_bird: 'volt', fw27_owned: ['volt'], fw27_abid: id }))
    localStorage.setItem(k, JSON.stringify(v)); }, [{ gates: z50(), score: z50(), clr: z50(), star: z50(), open: 49 }, id]);
  await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu');
  await page.evaluate(() => document.getElementById('startBtn').click()); await page.evaluate(() => document.querySelectorAll('#stageScr .stc')[9].click());
  await page.waitForFunction(() => FW.state === 'play'); await page.evaluate(() => { FW.hold = true; });
  assert.equal(await page.evaluate(() => FW.bossGo()), true);
  await page.evaluate(() => { FW.step(1/60, 30); FW.kill(); FW.step(1/60, 240); });
  if (await page.evaluate(() => FW.state) === 'cont') await page.click('#contNo');
  await page.waitForFunction(() => FW.state === 'over');
  const v = await page.evaluate(() => FW.ev.st.q.filter(e => e.k === 'run_end').map(e => e.p.v));
  return { near: await page.evaluate(() => { const n = document.getElementById('oNear'); return n.hidden ? null : n.textContent; }), v };
}

const rb = await lose(pick('b'));
assert.match(rb.near || '', /^Boss HP 100% left$/, 'arm b: the boss HP really left (no hit landed)');
assert.deepEqual(rb.v, ['nm:b']);
await page.evaluate(() => { const d = document.getElementById('fxDev'); if (d) d.remove(); });
await page.screenshot({ path: join(shots, 'nearmiss-b-boss.png') }); console.log('shot nearmiss-b-boss');

const ra = await lose(pick('a'));
assert.equal(ra.near, null, 'arm a: the card is as before');
assert.deepEqual(ra.v, ['nm:a']);

assert.deepEqual(errors, []);
await b.close();
console.log('nearmiss smoke ok');
