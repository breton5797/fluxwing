// Balance harness: one bot of fixed skill flies the same stage with every unit, many runs each, and reports score per unit.
//   node scripts/balance.mjs [--stage 20] [--runs 12] [--form 0] [--units volt,zero] [--aim 6] [--out file.json]
//   node scripts/balance.mjs --clear 10,25,40,50 --units volt --runs 30   (clear rate and mean gates per stage, each run stopped at the goal)
//   add --anyseed to fly a different course of the same stage each run (the table's expected clear rate, not one seeded course's)
// Needs the dev server (npm run dev, 127.0.0.1:5173). Supabase is blocked; nothing leaves the machine.
// The bot: flaps when it sinks below the next gap's centre plus an aim error (--aim px, Gaussian), dashes when the meter is full,
// casts the skill / ultimate when ready. Same bot for every unit, so the numbers compare units, not players.
// Reports per unit: mean / median / p90 score, mean gates, and the highest score/bound ratio against the server's endless bound
// (3g^2 + 75g times the unit's rank share, supabase/schema.sql fw_submit_score / fw_bound_mul): above 1 the server would refuse that run.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ANY = process.argv.includes('--anyseed'), CLEAR = arg('clear', '') ? arg('clear', '').split(',').map(n => +n - 1) : null;
const STAGE = +arg('stage', 20) - 1, RUNS = +arg('runs', 12), FORM = +arg('form', 0), AIM = +arg('aim', 6), OUT = arg('out', '');
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`;
const EVO_AT = [0, 3, 10, 20, 35];
const BOUND_MUL = { 5: 1.4, 6: 1.5, 7: 1.6, 8: 1.75, 9: 1.9 };   // = private.fw_bound_mul by rank

const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.route(/supabase\.co/, r => r.abort());
await page.goto(base); await page.waitForFunction(() => window.FW && FW.BIRDS);
const all = await page.evaluate(() => FW.BIRDS.map(u => ({ id: u.id, rarity: u.rarity || 0 })));
const only = arg('units', ''), units = only ? all.filter(u => only.split(',').includes(u.id)) : all;

const seed = id => page.evaluate(([id, ids, n]) => {
  localStorage.clear();
  const z = () => Array(50).fill(0), stg = { gates: z(), score: z(), clr: z().map(() => 1), open: 49 };
  const evo = Object.fromEntries(ids.map(u => [u, Array.from({ length: n }, (_, i) => i)]));
  for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'en', fw27_rookie_runs: 99, fw27_dintro: 1, fw27_bird: id, fw27_owned: ids, fw27_stg2: stg, fw27_evo: evo }))
    localStorage.setItem(k, JSON.stringify(v));
}, [id, all.map(u => u.id), EVO_AT[FORM]]);

async function run(stage = STAGE, stop = false){
  await page.evaluate(any => { if (any) FW.salt = Math.random().toString(36).slice(2); }, ANY && stop);
  await page.evaluate(i => { FW.hold = true; document.getElementById('startBtn').click(); document.querySelectorAll('#stageScr .stc')[i].click(); }, stage);   // hold: no real-time frames before the bot takes over
  await page.waitForFunction(() => FW.state === 'play');
  return page.evaluate(([aim, stop]) => {
    const goal = FW.STAGES[FW.stage].goal;
    const key = code => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); };   // a tap, not a hold: the bot never glides
    const g0 = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2*Math.log(u)) * Math.cos(6.283*v); };
    let err = g0() * aim, last = null;
    for (let i = 0; i < 120 * 240 && FW.state === 'play' && !(stop && FW.run.gatesPassed >= goal); i++){
      const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20);
      if (g !== last){ last = g; err = g0() * aim; }   // a new aim error for each gate
      const sg = g && g.sg && g.sg.k !== 'branch' && g.x - g.sg.span < FW.bird.x + 60 ? g.sg.k : '';   // a zone obstacle in the space before the next gate: keep below a blade and in an up-gust (a geyser needs nothing: it never reaches the middle)
      const ty = (g ? FW.gY(g) : 300) + err + (sg === 'blade' ? 24 : sg === 'gust' && g.sg.dir < 0 ? 25 : 0);   // the gap's real centre now (moving gates included)
      if (FW.bird.y > ty + 6 && FW.bird.vy > -120) key('Space');
      if (i % 30 === 0){ const r = FW.run; if (FW.timers.dashMeter >= 1) key('ShiftLeft'); if (r.skillCharge >= 1) key('KeyS'); if (r.ultCharge >= 1) key('KeyA'); }
      FW.step(1/120);
    }
    if (FW.state === 'play') FW.kill();
    const r = FW.run; return { score: r.score, gates: r.gatesPassed, clear: r.gatesPassed >= goal };
  }, [AIM, stop]);
}

// a reload that hangs (seen once in a 160-run batch) is retried rather than ending the batch
const menu = async () => { for (let i = 0; ; i++){ try { await page.reload({ timeout: 30000 }); await page.waitForFunction(() => window.FW && FW.state === 'menu'); return; } catch (e){ if (i >= 2) throw e; } } };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const rows = [];
if (CLEAR) for (const u of units){   // clear rates: the bot flies each stage RUNS times and stops at the goal
  await seed(u.id); await menu();
  for (const st of CLEAR){
    const res = [];
    for (let i = 0; i < RUNS; i++){ res.push(await run(st, true)); await page.evaluate(() => { if (FW.state === 'play') FW.kill(); }); await menu(); }
    const clr = res.filter(r => r.clear).length / res.length, g = res.reduce((a, r) => a + r.gates, 0) / res.length;
    rows.push({ id: u.id, stage: st + 1, runs: RUNS, clear: +clr.toFixed(3), gates: +g.toFixed(1) });
    console.log(`${u.id.padEnd(10)} stage ${String(st + 1).padStart(2)}  clear ${(clr*100).toFixed(0).padStart(3)}%  mean gates ${g.toFixed(1)}  (${RUNS} runs)`);
  }
}
for (const u of CLEAR ? [] : units){
  await seed(u.id); await menu();
  const res = [];
  for (let i = 0; i < RUNS; i++){ res.push(await run()); await page.waitForFunction(() => FW.state !== 'play', null, { timeout: 15000 }).catch(() => {}); await menu(); }
  const sc = res.map(r => r.score), mean = sc.reduce((a, c) => a + c, 0) / sc.length;
  const bound = Math.max(...res.map(r => r.gates ? r.score / ((3*r.gates*r.gates + 75*r.gates) * (BOUND_MUL[u.rarity] || 1)) : 0));
  rows.push({ id: u.id, rarity: u.rarity, mean: Math.round(mean), median: q(sc, .5), p90: q(sc, .9), gates: +(res.reduce((a, r) => a + r.gates, 0) / res.length).toFixed(1), bound: +bound.toFixed(3) });
  console.log(`${u.id.padEnd(10)} r${u.rarity} mean ${String(Math.round(mean)).padStart(6)} p90 ${String(q(sc, .9)).padStart(6)} gates ${rows.at(-1).gates} bound ${rows.at(-1).bound}`);
}
await b.close();
if (OUT) writeFileSync(OUT, JSON.stringify({ stage: STAGE + 1, runs: RUNS, form: FORM, aim: AIM, rows }, null, 1));
if (errors.length){ console.error('page errors:', errors); process.exitCode = 1; }
