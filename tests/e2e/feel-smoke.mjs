// Core-loop feel smoke: PORT=5262 node tests/e2e/feel-smoke.mjs  (dev server on 127.0.0.1:$PORT; Supabase is blocked)
// First gate spawn x, the one-time Perfect band on the first (tutorial) run, the '+1' pop, the 0.85 s result card. SHOTS=<dir> saves screenshots.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = `http://127.0.0.1:${process.env.PORT || 5173}`, shots = process.env.SHOTS || '';
const b = await chromium.launch(), page = await b.newPage({ viewport: { width: 390, height: 844 } });
await page.route(/supabase\.co/, r => r.abort());
const errors = []; page.on('pageerror', e => errors.push(e.message));
const shot = async n => { if (shots) await page.screenshot({ path: `${shots}/${n}.png` }); };
await page.goto(`${base}/index.html#dev`);
await page.evaluate(() => localStorage.clear()); await page.reload();
await page.waitForFunction(() => window.FW && window.FW.imp, null, { timeout: 8000 });

// first run: the tutorial (rookie lead kept)
const r0 = await page.evaluate(() => { document.getElementById('startBtn').click(); return { x: FW.gates[0].x, LW: FW.LW, state: FW.state }; });   // read in the same task as the start, before a frame moves the gate
assert.equal(r0.state, 'play');
assert.ok(Math.abs(r0.x - (r0.LW + 80 + 110)) < 8, `rookie first gate at LW+190 (${r0.x} vs ${r0.LW})`);

// an autopilot through the gap centres until gate 2 (the PERFECT tip): the band switches on and the flag is written
const fly = n => page.evaluate(n => {
  FW.hold = true;
  for (let i = 0; i < n && FW.state === 'play'; i++){
    const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x), cy = g ? FW.gY(g) : 300;
    if (FW.bird.y > cy + 8 && FW.bird.vy > -40) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    FW.step(1/60, 1); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  }
  FW.hold = false; return { g: FW.run.gatesPassed, state: FW.state, pband: FW.FX.pband, seen: localStorage.getItem('fw27_pband') };
}, n);
let s = await fly(60*7);
assert.ok(s.g >= 2, `passed ${s.g} gates`);
await page.evaluate(() => { FW.hold = true; }); await page.waitForTimeout(80);   // tutTick runs in the frame loop: let a few frames see gate 2 with the world held
s = await page.evaluate(() => ({ ...FW.run, pband: FW.FX.pband, seen: localStorage.getItem('fw27_pband'), state: FW.state }));
assert.equal(s.pband, 1, 'band on'); assert.equal(s.seen, '1', 'seen flag written');
await page.evaluate(() => FW.dbg.render()); await shot('perfect-band');
await fly(40); await page.evaluate(() => { FW.hold = true; FW.dbg.render(); }); await shot('plus-one-pop');

// the result card comes up 0.85 s (run time) after the crash
const tCard = await page.evaluate(() => {
  FW.hold = true; FW.kill(); let t = 0;
  while (FW.state === 'dying' && t < 3){ FW.step(1/60, 1); t += 1/60; }
  FW.hold = false; return { t, state: FW.state };
});
assert.ok(tCard.state === 'over' || tCard.state === 'cont', tCard.state);
await shot('result-card');

// a second run never shows the band again, and a non-rookie run's first gate sits at LW + 20
await page.evaluate(() => { localStorage.setItem('fw27_tut', '1'); localStorage.setItem('fw27_tutruns', '9'); localStorage.setItem('fw27_rookie_runs', '9'); });
await page.reload(); await page.waitForFunction(() => window.FW && window.FW.imp);
await page.click('#startBtn'); await page.waitForTimeout(400);
const r1 = await page.evaluate(() => { document.querySelector('#stageList button').click(); return { x: FW.gates[0].x, LW: FW.LW, state: FW.state, pband: FW.FX.pband }; });
assert.equal(r1.state, 'play'); assert.equal(r1.pband, 0);
assert.ok(Math.abs(r1.x - (r1.LW + 20)) < 1, `first gate at LW+20 (${r1.x} vs ${r1.LW})`);
process.stdout.write(`first gate on a later run: ${r1.x.toFixed(1)} (LW ${r1.LW.toFixed(1)}), card after ${tCard.t.toFixed(2)} s of run time\n`);
assert.deepEqual(errors, []);
await b.close();
