// Balance harness: one bot of fixed skill flies the same stage with every unit, many runs each, and reports score per unit.
//   node scripts/balance.mjs [--stage 20] [--runs 12] [--form 0] [--units volt,zero] [--aim 6] [--out file.json]
//   node scripts/balance.mjs --clear 10,25,40,50 --units volt [--runs 60] [--jobs 8]   (clear rate with its 95% Wilson interval and mean gates per stage;
//   the profile is re-seeded before every run, so the unit stays at --form and clears in the batch never evolve it)
//   add --anyseed to fly a different course of the same stage each run (the table's expected clear rate, not one seeded course's)
//   in --clear mode a run ends as the game ends it: a win (FX.won: the 100th gate, or the boss beaten on stages 10/20/30/40/50), a death, or --cap s of
//   game time. Each row gives the clear rate (a stage win), mean gates, mean score, the deaths (cause, the game's deathWhy -> gates passed), and on a boss
//   stage: runs that reached the boss, boss wins among them, the fight's length (s of game time) and the boss HP left when the bird died in the fight.
//   --bossgo (with --clear on boss stages) skips each run to its fight (FW.bossGo): the boss alone.
//   --daily --days 2026-11-17..2026-12-16 (or a comma list) [--units zero,volt] [--runs 40] [--batch 40] [--jobs 8]: the daily course of each UTC day
//   (FW.day, a #dev-only hook: the seed is hashStr('fluxwing27:' + day)), fair mode, no goal, so a run ends at death or --cap s. Per unit and day: mean /
//   median / p90 gates and score; per unit across days: the CV (stdev / mean) of the per-day mean gates and p90 score, the easiest and hardest day.
//   --batch B: a day flown in more than one batch of B runs also gives the CV of its batch means (the bot's own noise, the floor for the CVs above).
//   --jobs N flies N browser pages at once (one context each, so their profiles never mix); the rows and every run are written to --out.
// Needs the dev server (npm run dev, 127.0.0.1:5173; PORT=… for another port). Supabase is blocked; nothing leaves the machine.
// The bot: flaps when it sinks below the next gap's centre plus an aim error (--aim px, Gaussian), dashes when the meter is full,
// casts the skill / ultimate when ready. In a boss fight it flies the boss-smoke bot (tests/e2e/boss-smoke.mjs) with the same aim error on its target
// height. Same bot for every unit, so the numbers compare units, not players.
// Reports per unit: mean / median / p90 score, mean gates, and the highest score/bound ratio against the server's endless bound
// (3g^2 + 75g times the unit's rank share, supabase/schema.sql fw_submit_score / fw_bound_mul): above 1 the server would refuse that run.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ANY = process.argv.includes('--anyseed'), CLEAR = arg('clear', '') ? arg('clear', '').split(',').map(n => +n - 1) : null;
const STAGE = +arg('stage', 20) - 1, RUNS = +arg('runs', CLEAR ? 60 : 12), FORM = +arg('form', 0), AIM = +arg('aim', 6), OUT = arg('out', '');
const JOBS = Math.max(1, +arg('jobs', 1)), CAP = +arg('cap', 600);   // CAP: s of game time before a run counts as 'time'
const DAILY = process.argv.includes('--daily'), BATCH = +arg('batch', 40);
const DAYS = (d => { const m = d.match(/^(\d{4}-\d\d-\d\d)\.\.(\d{4}-\d\d-\d\d)$/); if (!m) return d ? d.split(',') : [];
  const out = []; for (let t = Date.parse(m[1] + 'T00:00:00Z'); t <= Date.parse(m[2] + 'T00:00:00Z'); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10)); return out; })(arg('days', ''));
const BOSSGO = process.argv.includes('--bossgo'), NAIVE = process.argv.includes('--naive'), REACT = +arg('react', .2), SEE = arg('see', 'branch,snap,shot,drop').split(',');   // --naive: the course bot ignores branches and surprises; react: its reflex in s
const base = `http://127.0.0.1:${process.env.PORT || 5173}/${arg('page', 'index.html')}#dev`;   // --page: a copy of the game next to index.html (a tuning probe)
const EVO_AT = [0, 3, 10, 20, 35];
const BOUND_MUL = { 5: 1.4, 6: 1.5, 7: 1.6, 8: 1.75, 9: 1.9 };   // = private.fw_bound_mul by rank

const b = await chromium.launch(), errors = [];
const newPage = async () => {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.route(/supabase/, r => r.abort());   // every Supabase request: the backend is live production
  await p.goto(base); await p.waitForFunction(() => window.FW && FW.BIRDS);
  return p;
};
const page = await newPage();
const all = await page.evaluate(() => FW.BIRDS.map(u => ({ id: u.id, rarity: u.rarity || 0 })));
const only = arg('units', ''), units = only ? all.filter(u => only.split(',').includes(u.id)) : all;

const seed = (id, pg = page) => pg.evaluate(([id, ids, n]) => {
  localStorage.clear();
  const z = () => Array(50).fill(0), stg = { gates: z(), score: z(), clr: z().map(() => 1), open: 49 };
  const evo = Object.fromEntries(ids.map(u => [u, Array.from({ length: n }, (_, i) => i)]));
  for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'en', fw27_rookie_runs: 99, fw27_dintro: 1, fw27_bird: id, fw27_owned: ids, fw27_stg2: stg, fw27_evo: evo }))
    localStorage.setItem(k, JSON.stringify(v));
}, [id, all.map(u => u.id), EVO_AT[FORM]]);

async function run(stage = STAGE, stop = false, pg = page, day = ''){
  await pg.evaluate(any => { if (any) FW.salt = Math.random().toString(36).slice(2); }, ANY && stop);
  if (day) await pg.evaluate(d => { FW.day = d; FW.hold = true; document.getElementById('dailyBtn').click(); }, day);   // the daily course of that day (fw27_dintro is set: no intro)
  else await pg.evaluate(i => { FW.hold = true; document.getElementById('startBtn').click(); document.querySelectorAll('#stageScr .stc')[i].click(); }, stage);   // hold: no real-time frames before the bot takes over
  await pg.waitForFunction(() => FW.state === 'play');
  if (BOSSGO) await pg.evaluate(() => FW.bossGo());   // --bossgo: the fight alone (QA jump: the course counts as flown, no score)
  if (day && await pg.evaluate(() => FW.mode) !== 'daily') throw new Error('not a daily run');
  return pg.evaluate(([aim, cap, naive, react, seeK]) => {
    const goal = FW.STAGES[FW.stage].goal;
    const key = code => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); };   // a tap, not a hold: the bot never glides
    const g0 = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2*Math.log(u)) * Math.cos(6.283*v); };
    let err = g0() * aim, last = null, bT0 = null, bErr = g0() * aim, bPh = '', hp0 = 0;
    // The boss fight (FW.boss set): the bot of tests/e2e/boss-smoke.mjs with the course bot's aim error on its target height (a new error at every
    // telegraph and after every dash). It keeps out of the danger bands (a locked beam or charge line, the volley's aim, shots and minions on their way),
    // flies to the wall's hole, smashes a minion when the meter is full, and rams when the meter is full and the boss is within 40 px of its height.
    const fight = () => {
      const bo = FW.boss, bd = FW.bird, s = bo.s, a = s.atk, act = s.ph !== 'wait', G = 584, hr = 11, mins = FW.bsh.filter(e => e.k === 'min'), hunt = mins.length > 0 && FW.timers.dashMeter >= 1;
      if (s.ph !== bPh){ if (s.ph === 'tel') bErr = g0() * aim; bPh = s.ph; }
      const bands = [], far = e => Math.hypot(e.x - bd.x, e.y - bd.y);   // bands: [y, r], heights to keep out of over the next ~half second
      if (a === 'beam' && act) bands.push([bo.lock, 32 + hr + 12]);
      if (a === 'charge' && act) bands.push([bo.lock, 52 + hr + 14]);
      if (a === 'volley' && act) bands.push([bo.lock, 44]);
      for (const e of FW.bsh){
        if (e.k === 'min'){ if (!hunt && far(e) < 200) bands.push([e.y + e.vy*.25, e.r + hr + 60]); continue; }
        for (let t = 0; t <= .6; t += .03){ if (Math.abs(e.x + e.vx*t - bd.x) < e.r + hr + 4){ bands.push([e.y + e.vy*t, e.r + hr + 10]); break; } }
      }
      const clr = y => Math.min(60, ...bands.map(([q, r]) => Math.abs(y - q) - r));
      const want = hunt ? mins.reduce((m, e) => far(e) < far(m) ? e : m).y : (a === 'wall' && s.ph === 'tel') || FW.bsh.some(e => e.k === 'wall' && e.x > bd.x - 30) ? bo.hole : FW.timers.dashMeter > .85 ? bo.y : G * .5;
      let ty = want, best = -1e9;
      for (let y = 50; y <= G - 50; y += 6){ const c = clr(y), sc = (c < 0 ? c*10 - 400 : c) - Math.abs(y - bd.y)*.25 - Math.abs(y - want)*.08; if (sc > best){ best = sc; ty = y; } }
      ty += bErr;   // the aim error: it flies to a height off by a Gaussian error, as it aims at a gap
      if (bd.y > ty + (bands.length ? 24 : 6) && bd.vy > (clr(bd.y) < 0 ? -330 : -140) && (clr(bd.y - 75) > Math.min(0, clr(bd.y)) || bd.y > G - 22)) key('Space');   // a flap climbs ~75 px: never into a danger
      const near = mins.find(e => e.x > bd.x - 30 && far(e) < 75);
      if (FW.timers.dashMeter >= 1 && bo.ph === 'fight' && (near || clr(bd.y) < -6 || (!mins.length && bo.hitT <= 0 && Math.abs(bo.y - bd.y) < 40))){ key('ShiftLeft'); bErr = g0() * aim; }   // smash a minion, ride a hit out in the dash, or ram
    };
    // What a player sees coming on the course (off with --naive, the bot before 2026-10-29): a shaking branch (NEON GROVE) will close the top of its
    // gap, so it aims at the gap left under it; a snap's jaws, once they twitch, take `dep` of the gap from below (SKY PALACE: above), so it aims at the
    // rest; a locked shot and a falling drop are heights to keep out of when they reach the bird. Each reaction comes `react` s after the warning
    // (the shot: after its aim locks), so it is a player's reflex, not foresight. Numbers from the surprise block (SUR): shot tel .45 fly .55 hit 12,
    // drop tel .4 v0 300 acc 1400 r 18.
    const see = (g, ty) => {
      const bd = FW.bird, hr = 11, up = FW.STAGES[FW.stage].zone === 3, sp = FW.run.speed || 1, bands = [];
      if (seeK.includes('branch') && g && g.sg && g.sg.k === 'branch' && (g.brSh > 0 || g.brK > 0)){   // the top of its flap cycle (~68 px above ty) stays 8 px under the fallen branch
        const top = FW.gY(g) - (FW.gGap ? FW.gGap(g) : g.gap - g.sg.drop * g.brK) / 2 + g.sg.drop * (1 - g.brK);   // gY and the gap already hold brK of the drop
        ty = Math.max(ty, top + hr + 68 + 8);
      }
      if (seeK.includes('snap') && g && g.sr && g.sr.k === 'snap' && g.sr.t >= react){   // only as far as needed: the low (high) end of its flap cycle stays clear of the jaws
        const e = FW.gY(g) + (up ? -1 : 1) * (FW.gGap ? FW.gGap(g) : g.gap) / 2 - (up ? -1 : 1) * g.sr.dep;
        ty = up ? Math.max(ty, e + hr + 74) : Math.min(ty, e - hr - 12);
      }
      for (const e of FW.surs){   // bands: [y, h], h = the hit distance
        if (e.k === 'shot'){ if (seeK.includes('shot') && e.t >= .45 + react) bands.push([e.y, 12 + hr]); continue; }
        const tx = (e.x - bd.x) / sp; if (!seeK.includes('drop') || e.t < react || tx < -.15) continue;
        const u = e.t + Math.max(0, tx) - .4, y = u < 0 ? -18 : 300*u + 700*u*u - 18; bands.push([y, 18 + hr]);
      }
      // The bird flies a cycle from ~68 px above ty (a flap's top) to ~6 px below it (the next flap), so ty keeps out of [y - h - 12, y + h + 72]:
      // above a band it flaps under it, below a band it does not flap into it. The side: where the bird is when it is clear already (never
      // through the band), else ty's side.
      for (const [y, h] of bands){
        const lo = y - h - 12, hi = y + h + 72, below = bd.y > y + h ? true : bd.y < y - h ? false : ty >= y;
        if (below ? ty < hi : ty > lo) ty = below && hi < 570 || lo < 30 ? hi : lo;
      }
      return ty;
    };
    for (let i = 0; i < cap && FW.state === 'play' && !FW.FX.won; i++){
      if (FW.boss){
        if (bT0 === null){ bT0 = FW.run.T; hp0 = FW.boss.max; }
        fight();
        if (i % 30 === 0){ const r = FW.run; if (r.skillCharge >= 1) key('KeyS'); if (r.ultCharge >= 1) key('KeyA'); }   // no dash here: in a fight a dash is a ram
        FW.step(1/120); continue;
      }
      const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20);
      if (g !== last){ last = g; err = g0() * aim; }   // a new aim error for each gate
      const sg = g && g.sg && g.sg.k !== 'branch' && g.x - g.sg.span < FW.bird.x + 60 ? g.sg.k : '';   // a zone obstacle in the space before the next gate: keep below a blade and in an up-gust (a geyser needs nothing: it never reaches the middle)
      let ty = (g ? FW.gY(g) : 300) + err + (sg === 'blade' ? 24 : sg === 'gust' && g.sg.dir < 0 ? 25 : 0);   // the gap's real centre now (moving gates included)
      if (!naive) ty = see(g, ty);
      if (FW.bird.y > ty + 6 && FW.bird.vy > -120) key('Space');
      if (i % 30 === 0){ const r = FW.run; if (FW.timers.dashMeter >= 1) key('ShiftLeft'); if (r.skillCharge >= 1) key('KeyS'); if (r.ultCharge >= 1) key('KeyA'); }
      FW.step(1/120);
    }
    const won = !!FW.FX.won, why = won ? '' : FW.state === 'play' ? 'time' : FW.why;   // what ended the run (FW.why: the game's deathWhy); 'time' at the step cap
    const hp = FW.boss ? FW.boss.hp : won && bT0 !== null ? 0 : null, fightT = bT0 === null ? null : +(FW.run.T - bT0).toFixed(2);
    if (FW.state === 'play' && !won) FW.kill();
    const r = FW.run; return { score: r.score, gates: r.gatesPassed, goal, clear: won, why, boss: bT0 !== null, fightT, hp, hp0, T: +r.T.toFixed(1) };
  }, [AIM, CAP * 120, NAIVE, REACT, SEE]);
}

// a reload that hangs (seen once in a 160-run batch) is retried rather than ending the batch
const menu = async (pg = page) => { for (let i = 0; ; i++){ try { await pg.reload({ timeout: 30000 }); await pg.waitForFunction(() => window.FW && FW.state === 'menu'); return; } catch (e){ if (i >= 2) throw e; } } };
const wilson = (k, n, z = 1.96) => { if (!n) return [0, 1]; const p = k / n, d = 1 + z*z/n, c = (p + z*z/(2*n)) / d, h = z * Math.sqrt(p*(1 - p)/n + z*z/(4*n*n)) / d; return [Math.max(0, c - h), Math.min(1, c + h)]; };   // 95% interval of a clear rate
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, r1 = v => v === null ? null : +v.toFixed(1);
const rows = [], t0 = Date.now();

// One row of --clear: a unit on a stage, from its runs
function clearRow(id, st, res){
  const k = res.filter(r => r.clear).length, [lo, hi] = wilson(k, res.length), deaths = {};
  for (const r of res) if (!r.clear) (deaths[r.why || 'time'] ||= []).push(r.gates);
  const row = { id, stage: st + 1, runs: res.length, form: FORM, clear: +(k / res.length).toFixed(3), lo: +lo.toFixed(3), hi: +hi.toFixed(3),
    gates: r1(avg(res.map(r => r.gates))), score: Math.round(avg(res.map(r => r.score))), deaths };
  const fb = res.filter(r => r.boss);
  if ((st + 1) % 10 === 0){   // a boss stage (stages 10/20/30/40/50)
    const won = fb.filter(r => r.clear), lost = fb.filter(r => !r.clear);
    row.boss = { reached: fb.length, won: won.length, winGivenReach: fb.length ? +(won.length / fb.length).toFixed(3) : null,
      fightWin: r1(avg(won.map(r => r.fightT))), fightWinMed: won.length ? q(won.map(r => r.fightT), .5) : null, fightLoss: r1(avg(lost.map(r => r.fightT))),
      hpLeft: r1(avg(lost.map(r => r.hp))), hp: fb[0] ? fb[0].hp0 : null, lossWhy: Object.fromEntries([...new Set(lost.map(r => r.why))].map(w => [w, lost.filter(r => r.why === w).length])) };
  }
  row.list = res.map(r => [r.gates, r.clear ? 1 : 0, r.why, r.fightT, r.hp]);   // every run: gates, won, cause, fight s, boss HP left
  return row;
}
const fmtRow = r => `${r.id.padEnd(10)} stage ${String(r.stage).padStart(2)}  clear ${(r.clear*100).toFixed(0).padStart(3)}%  [95% ${(r.lo*100).toFixed(0)}-${(r.hi*100).toFixed(0)}]  mean gates ${r.gates}  mean score ${r.score}  (${r.runs} runs, form ${r.form})  deaths ${Object.entries(r.deaths).map(([k, v]) => k + ' ' + v.length).join(', ')}`
  + (r.boss ? `  boss ${r.boss.won}/${r.boss.reached} won, fight ${r.boss.fightWin ?? '-'} s (won) ${r.boss.fightLoss ?? '-'} s (lost), HP left ${r.boss.hpLeft ?? '-'}/${r.boss.hp}` : '');
const save = () => { if (OUT) writeFileSync(OUT, JSON.stringify(DAILY ? { mode: 'daily', days: DAYS, runs: RUNS, batch: BATCH, aim: AIM, cap: CAP, naive: NAIVE, react: REACT, summary: dailySummary(), rows } : { stage: CLEAR ? CLEAR.map(s => s + 1) : STAGE + 1, runs: RUNS, form: FORM, aim: AIM, cap: CAP, anyseed: ANY, bossgo: BOSSGO, naive: NAIVE, react: REACT, rows }, null, 1)); };

// --daily: one row per unit and day, then the spread across days per unit
const sd = a => { const m = avg(a); return Math.sqrt(a.reduce((t, x) => t + (x - m)**2, 0) / (a.length - 1)); }, cv = a => a.length > 1 ? +(sd(a) / avg(a)).toFixed(3) : null;
function dailyRow(id, day, res){
  const g = res.map(r => r.gates), sc = res.map(r => r.score), why = {};
  for (const r of res) why[r.why || 'time'] = (why[r.why || 'time'] || 0) + 1;
  const bm = []; for (let i = 0; i + BATCH <= res.length; i += BATCH) bm.push(avg(g.slice(i, i + BATCH)));
  return { id, day, runs: res.length, gates: r1(avg(g)), gatesMed: q(g, .5), gatesP90: q(g, .9), score: Math.round(avg(sc)), scoreMed: q(sc, .5), scoreP90: q(sc, .9),
    T: r1(avg(res.map(r => r.T))), why, batchMeans: bm.length > 1 ? bm.map(r1) : undefined, batchCv: bm.length > 1 ? cv(bm) : undefined, list: res.map(r => [r.gates, r.score, r.why, r.T]) };
}
function dailySummary(){
  return Object.fromEntries(units.map(u => {
    const rs = rows.filter(r => r.id === u.id); if (rs.length < 2) return [u.id, null];
    const by = rs.slice().sort((a, c) => a.gates - c.gates), easy = by.at(-1), hard = by[0];
    return [u.id, { days: rs.length, cvGates: cv(rs.map(r => r.gates)), cvScoreP90: cv(rs.map(r => r.scoreP90)), cvScore: cv(rs.map(r => r.score)), cvGatesP90: cv(rs.map(r => r.gatesP90)),
      meanGates: r1(avg(rs.map(r => r.gates))), easiest: { day: easy.day, gates: easy.gates, scoreP90: easy.scoreP90 }, hardest: { day: hard.day, gates: hard.gates, scoreP90: hard.scoreP90 },
      ratio: +(easy.gates / hard.gates).toFixed(2), ratioScoreP90: +(Math.max(...rs.map(r => r.scoreP90)) / Math.min(...rs.map(r => r.scoreP90))).toFixed(2) }];
  }));
}
if (DAILY){   // JOBS pages fly the (unit, day, run) tasks; each run re-seeds the profile (form I, fair mode anyway) and reloads
  if (!DAYS.length) throw new Error('--daily needs --days');
  const tasks = units.flatMap(u => DAYS.flatMap(day => Array.from({ length: RUNS }, () => ({ u: u.id, day })))), out = new Map(), left = new Map();
  for (const u of units) for (const day of DAYS) left.set(u.id + '|' + day, RUNS);
  let next = 0, done = 0;
  const pages = [page, ...await Promise.all(Array.from({ length: Math.min(JOBS, tasks.length) - 1 }, newPage))];
  await Promise.all(pages.map(async pg => {
    while (next < tasks.length){
      const { u, day } = tasks[next++], key = u + '|' + day;
      await seed(u, pg); await menu(pg);
      const r = await run(STAGE, false, pg, day); (out.get(key) || out.set(key, []).get(key)).push(r);
      if (++done % 50 === 0) console.error(`… ${done}/${tasks.length} runs, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
      left.set(key, left.get(key) - 1);
      if (!left.get(key)){ const row = dailyRow(u, day, out.get(key)); rows.push(row);
        console.log(`${u.padEnd(8)} ${day}  gates mean ${row.gates} med ${row.gatesMed} p90 ${row.gatesP90}  score mean ${row.score} p90 ${row.scoreP90}  (${row.runs} runs)` + (row.batchCv != null ? `  batch means ${row.batchMeans.join(' / ')} cv ${row.batchCv}` : '')); save(); }
    }
  }));
  rows.sort((a, c) => units.findIndex(u => u.id === a.id) - units.findIndex(u => u.id === c.id) || a.day.localeCompare(c.day));
  for (const [id, s] of Object.entries(dailySummary())) if (s) console.log(`${id}: cv mean gates ${s.cvGates}  cv p90 score ${s.cvScoreP90}  easiest ${s.easiest.day} (${s.easiest.gates})  hardest ${s.hardest.day} (${s.hardest.gates})  ratio ${s.ratio}`);
}
if (CLEAR){   // clear rates: JOBS pages fly the (unit, stage, run) tasks; each run re-seeds the profile and reloads, so a clear never evolves the unit
  const tasks = units.flatMap(u => CLEAR.flatMap(st => Array.from({ length: RUNS }, () => ({ u: u.id, st })))), out = new Map(), left = new Map();
  for (const u of units) for (const st of CLEAR) left.set(u.id + '|' + st, RUNS);
  let next = 0, done = 0;
  const pages = [page, ...await Promise.all(Array.from({ length: Math.min(JOBS, tasks.length) - 1 }, newPage))];
  await Promise.all(pages.map(async pg => {
    while (next < tasks.length){
      const { u, st } = tasks[next++], key = u + '|' + st;
      await seed(u, pg); await menu(pg);
      const r = await run(st, true, pg); (out.get(key) || out.set(key, []).get(key)).push(r);
      if (++done % 20 === 0) console.error(`… ${done}/${tasks.length} runs, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
      left.set(key, left.get(key) - 1);
      if (!left.get(key)){ const row = clearRow(u, st, out.get(key)); rows.push(row); console.log(fmtRow(row)); save(); }
    }
  }));
  rows.sort((a, c) => units.findIndex(u => u.id === a.id) - units.findIndex(u => u.id === c.id) || a.stage - c.stage);
}
for (const u of CLEAR || DAILY ? [] : units){
  await seed(u.id); await menu();
  const res = [];
  for (let i = 0; i < RUNS; i++){ res.push(await run()); await page.waitForFunction(() => FW.state !== 'play', null, { timeout: 15000 }).catch(() => {}); await menu(); }
  const sc = res.map(r => r.score), mean = sc.reduce((a, c) => a + c, 0) / sc.length;
  const bound = Math.max(...res.map(r => r.gates ? r.score / ((3*r.gates*r.gates + 75*r.gates) * (BOUND_MUL[u.rarity] || 1)) : 0));
  rows.push({ id: u.id, rarity: u.rarity, mean: Math.round(mean), median: q(sc, .5), p90: q(sc, .9), gates: +(res.reduce((a, r) => a + r.gates, 0) / res.length).toFixed(1), bound: +bound.toFixed(3) });
  console.log(`${u.id.padEnd(10)} r${u.rarity} mean ${String(Math.round(mean)).padStart(6)} p90 ${String(q(sc, .9)).padStart(6)} gates ${rows.at(-1).gates} bound ${rows.at(-1).bound}`);
}
await b.close();
save();
console.error(`wall time ${((Date.now() - t0) / 60000).toFixed(1)} min`);
if (errors.length){ console.error('page errors:', [...new Set(errors)]); process.exitCode = 1; }
