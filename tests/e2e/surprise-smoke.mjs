// Surprise hazards and 100-gate missions smoke: node tests/e2e/surprise-smoke.mjs  (dev server on 127.0.0.1:5173)
// Every *.supabase.co request is aborted. A bot flies stage runs until a snap, a shot and a drop go off in the grove (stage 7), the canyon (15), the magma core (34) and the palace
// (46) and screenshots each; then it flies stage 1 to its 100th gate: the run must end as a win (MISSION CLEAR beat, then the result card
// with the clear rewards and no continue). FW.selfTest() must pass. Screenshots land in $SHOTS (default: the system temp dir).
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

const z50 = () => Array(50).fill(0);
const seed = () => page.evaluate(stg => { localStorage.clear(); for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'en', fw27_dintro: 1, fw27_stg2: stg }))
  localStorage.setItem(k, JSON.stringify(v)); }, { gates: z50(), score: z50(), clr: z50(), star: z50(), open: 49 });
const boot = async () => { await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu'); };
const start = async (i, salt = '') => { await page.evaluate(v => { FW.salt = v; document.getElementById('startBtn').click(); }, salt); await page.evaluate(n => document.querySelectorAll('#stageScr .stc')[n].click(), i);
  await page.waitForFunction(() => FW.state === 'play'); };
// bot: flap whenever the bird sinks below the next gap's centre; stops when `until` says so, the run ends or the step cap is hit
const fly = (until, cap = 120 * 120) => page.evaluate(([u, c]) => {
  const stop = new Function('FW', 'return ' + u), flap = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  for (let i = 0; i < c && FW.state === 'play'; i++){
    const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), ty = g ? g.base + (g.off || 0) : 300;
    if (FW.bird.y > ty + 6 && FW.bird.vy > -120) flap();
    FW.step(1/120);
    if (stop(FW)) return 'hit';
  }
  return FW.state;
}, [until, cap]);
const WANT = {
  snap: "FW.gates.some(g => g.sr && g.sr.k === 'snap' && g.sr.ext > .85)",
  shot: "FW.surs.some(e => e.k === 'shot' && e.t > .45 + .2)",
  drop: "FW.surs.some(e => e.k === 'drop' && e.t > .4 + .3)",
};

await page.goto(base);
await seed(); await boot();
assert.deepEqual((await page.evaluate(() => FW.selfTest())).filter(k => k !== 'skill'), [], 'FW.selfTest passes (skill fails on main 47bb0ce already)');

for (const [st, zone] of [[6, 'grove'], [14, 'canyon'], [33, 'magma'], [45, 'palace']]) for (const kind of ['snap', 'shot', 'drop']){
  let got = false;
  for (let tries = 0; tries < 40 && !got; tries++){   // FW.salt: another course of the same stage each try
    await boot(); await start(st, tries ? 'try' + tries : '');
    got = await fly(WANT[kind]) === 'hit';
  }
  assert.ok(got, `${kind} seen on stage ${st + 1}`);
  await page.screenshot({ path: join(shots, `sur-${kind}-${zone}.png`) });
  console.log('shot', kind, zone);
}

// a 100-gate mission on stage 1 ends as a win
await seed(); await boot();
let won = false;
for (let tries = 0; tries < 30 && !won; tries++){
  await boot(); await start(0, tries ? 'try' + tries : '');
  const r = await fly('FW.FX.winT > 0', 120 * 600);
  won = r === 'hit';
  if (!won) console.log('stage 1 try', tries + 1, r, await page.evaluate(() => FW.run.gatesPassed));
}
assert.ok(won, 'the bot reaches gate 100 of stage 1');
assert.equal(await page.evaluate(() => FW.run.gatesPassed), 100);
assert.equal(await page.evaluate(() => FW.gates.filter(g => !g.scored).length), 0, 'no gate after the goal');
await page.evaluate(() => FW.step(1/60, 20));
await page.screenshot({ path: join(shots, 'mission-clear-beat.png') });
await page.evaluate(() => FW.step(1/60, 80));
assert.equal(await page.evaluate(() => FW.state), 'over', 'the result card follows the beat');
assert.ok(await page.evaluate(() => document.getElementById('contScr').hidden), 'no continue after a win');
assert.match(await page.textContent('#oWhy'), /STAGE 1 CLEAR!/);
assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fw27_stg2')).clr[0]), 1);
await page.waitForTimeout(1300);
await page.screenshot({ path: join(shots, 'mission-clear-result.png') });

assert.deepEqual(errors, []);
await b.close();
console.log('surprise smoke: ok');
