// Clear by any means: node tests/e2e/clear-any-means.mjs  (starts its own dev server on a free port and stops it at the end)
// Owner requirement 2026-10-29: whatever the player uses (skill, ultimate, dash, giant, shields, a continue), once 100 obstacles are behind the bird the stage clears;
// on a boss stage the boss comes after gate 100 instead. Every *.supabase.co request is aborted (the backend is live production). For EVERY unit in FW.BIRDS
// (hidden and unreleased ranks too: all of them owned), an aggressive bot flies stage 1: it steers to the gap's centre, dashes whenever the meter is full and
// casts the skill and the ultimate whenever they are ready. There is no god mode: a death takes the one coin continue (it breaks the gates near the bird), a
// second death retries the unit on another course (FW.salt). Every step it checks that no gate leaves the array unscored (a soft-lock: no gates left, no clear).
// It asserts the win: gatesPassed 100, exactly 100 gates laid, FX.clearDone, the result card says STAGE 1 CLEAR!. Then heavy units fly stage 10 with the
// ultimate forced at gate 97 and the skill at gate 98: the boss must appear right after gate 100 and no gate may come after it. AURORA's skill and ultimate
// must never start a storm dash (FX.stormDash / FX.stormN / FX.carry). Prints a per-unit table.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const port = await new Promise(r => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const srv = spawn(process.execPath, ['scripts/serve.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((r, j) => { srv.stdout.on('data', d => { if (/localhost/.test(String(d))) r(); }); srv.on('exit', c => j(new Error('serve.mjs exited ' + c))); });
const base = `http://127.0.0.1:${port}/index.html#dev`;
const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.route('**/*supabase*', r => r.abort());
await page.route(/supabase/, r => r.abort());

const z50 = () => Array(50).fill(0);
let ids = [];
const seed = id => page.evaluate(([id, ids, stg]) => { localStorage.clear(); for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'en', fw27_rookie_runs: 99, fw27_dintro: 1,
  fw27_bird: id, fw27_owned: ids, fw27_stg2: stg, fw27_wallet2: { coins: 5000, gems: 0, dia: 0 } })) localStorage.setItem(k, JSON.stringify(v)); }, [id, ids, { gates: z50(), score: z50(), clr: z50(), star: z50(), open: 49 }]);
const boot = async () => { await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu'); };
const start = async (i, salt) => { await page.evaluate(v => { FW.salt = v; FW.hold = true; document.getElementById('startBtn').click(); }, salt);
  await page.evaluate(n => document.querySelectorAll('#stageScr .stc')[n].click(), i); await page.waitForFunction(() => FW.state === 'play'); };

// The bot, one call: flies until the run is won (FX.winT > 0), a boss is up, the run leaves 'play' (dying: the caller steps it on) or the cap is hit.
// stopBoss false: flies on into a fight. ride: the dash meter is refilled (FW.setRun) and the bird dashes back to back, a dev means against the stage 10
// shots and branches the bot cannot dodge; the clear logic is the game's own either way. force: {ult: gate, skill: gate} casts through FW.ult / FW.cast once gatesPassed reaches that gate (QA: an ultimate running into gate 100).
// Kept on window.__ca across calls (a continue splits a run in two): the gates seen, gates that left unscored, cast counts.
const fly = (force, cap = 120 * 300, stopBoss = true, ride = false) => page.evaluate(([force, cap, stopBoss, ride]) => {
  const key = code => { dispatchEvent(new KeyboardEvent('keydown', { code })); dispatchEvent(new KeyboardEvent('keyup', { code })); };
  const s = window.__ca || (window.__ca = { seen: new Set(), lost: 0, skill: 0, ult: 0, dash: 0, forced: {}, storm: false, after: 0 });
  const u = FW.BIRDS.find(q => q.id === JSON.parse(localStorage.getItem('fw27_bird')));
  let prev = FW.gates.slice();
  for (const g of prev) s.seen.add(g);
  for (let i = 0; i < cap && FW.state === 'play'; i++){
    const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), r = FW.run, ty = g ? FW.gY(g) : 300, tm = FW.timers;
    const ge = u.grav * (tm.lowGravT > 0 ? .5 : 1) * (tm.weightT > 0 ? 1.4 : 1), top = g ? ty - (g.gap + (g.lane ? g.laneGap || 0 : 0))/2 : 40;   // a flap's apex must stay under the gap's top (NIMBUS's low gravity: a much higher climb)
    if (FW.bird.y > ty + 6 && FW.bird.vy > -120 && FW.bird.y - u.flap*u.flap/(2*ge) > Math.min(ty - 10, top + FW.bird.r + 8)) key('Space');
    if (ride && tm.dashMeter < 1) FW.setRun({dash: 1});   // the ride: the meter is kept full, so the bird dashes back to back (every gate at 2.6x speed)
    if (i % 6 === 0 || ride){
      if (FW.timers.dashMeter >= 1){ key('ShiftLeft'); if (FW.timers.dashMeter < 1) s.dash++; }
      if (r.skillCharge >= 1){ key('KeyS'); if (FW.run.skillCharge < 1) s.skill++; }
      if (r.ultCharge >= 1 && !r.ultLive){ key('KeyA'); if (FW.run.ultLive) s.ult++; }
    }
    for (const [k, at] of Object.entries(force || {})) if (!s.forced[k] && r.gatesPassed >= at){ s.forced[k] = true; if (k === 'ult') FW.ult(); else FW.cast(); }
    FW.step(1/120);
    if (FW.FX.stormDash || FW.FX.stormN > 0 || FW.FX.carry) s.storm = true;
    const now = new Set(FW.gates);
    for (const q of prev) if (!now.has(q) && !q.scored) s.lost++;   // a gate gone from the array without being scored
    for (const q of FW.gates) if (!s.seen.has(q)){ s.seen.add(q); if (FW.boss) s.after++; }
    prev = FW.gates.slice();
    if (FW.FX.winT > 0) return 'won';
    if (FW.boss && stopBoss) return 'boss';
  }
  return FW.state === 'play' ? 'cap' : FW.state;
}, [force, cap, stopBoss, ride]);
const stats = () => page.evaluate(() => { const s = window.__ca; return { laid: s.seen.size, lost: s.lost, skill: s.skill, ult: s.ult, dash: s.dash, storm: s.storm, after: s.after,
  gates: FW.run.gatesPassed, clearDone: FW.FX.clearDone, left: FW.gates.filter(g => !g.scored).length }; });
// a death: step through the fall; the continue card takes the coin continue once (contUsed), a second death ends the run
const afterDeath = async () => { await page.evaluate(() => { for (let i = 0; i < 1200 && FW.state === 'dying'; i++) FW.step(1/60); });
  if (await page.evaluate(() => FW.state) !== 'cont') return false; await page.click('#contCoin'); return await page.evaluate(() => FW.state) === 'play'; };

// One unit, one stage: tries until the bot reaches the goal (won / boss), each try on another course
// (the last `rides` tries ride the dash: see fly)
async function mission(id, stage, force, tries = 8, rides = 0){
  for (let t = 0; t < tries; t++){
    const ride = t >= tries - rides;
    await seed(id); await boot(); await start(stage, t ? 'ca' + t : '');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fw27_bird'))), id, id + ' is the unit flown');
    await page.evaluate(() => { window.__ca = null; });
    let ev, conts = 0;
    for (;;){
      ev = await fly(force, 120 * 300, true, ride);
      if (ev !== 'dying') break;
      if (!await afterDeath()) break;
      conts++;
    }
    const s = await stats();
    assert.equal(s.lost, 0, `${id} stage ${stage + 1}: a gate left the screen unscored`);
    if (ev === 'won' || ev === 'boss') return { ev, tries: t + 1, conts, ride, ...s };
    console.log(`  ${id} stage ${stage + 1} try ${t + 1}: ${ev} at gate ${s.gates} (${await page.evaluate(() => FW.why)}, ${conts} continue${ride ? ', riding the dash' : ''})`);
  }
  assert.fail(`${id}: the bot never reached gate 100 of stage ${stage + 1}`);
}

const rows = [];
try {
  await page.goto(base); await page.waitForFunction(() => window.FW && FW.BIRDS);
  ids = await page.evaluate(() => FW.BIRDS.map(u => u.id));
  const only = process.env.UNITS ? ids.filter(u => process.env.UNITS.split(',').includes(u)) : ids;   // UNITS=nimbus,tempest: a quicker local pass (those units only)
  console.log(ids.length, 'units');

  // 1. every unit clears stage 1 at gate 100
  for (const id of only){
    const r = await mission(id, 0, null, 8, 2);
    assert.equal(r.ev, 'won', id + ': the run ends as a win');
    assert.deepEqual([r.gates, r.laid, r.left, r.clearDone], [100, 100, 0, true], id + ': gate 100 is the goal, no gate is laid past it');
    await page.evaluate(() => FW.step(1/60, 120));
    assert.equal(await page.evaluate(() => FW.state), 'over', id + ': the result card follows the beat');
    assert.match(await page.textContent('#oWhy'), /STAGE 1 CLEAR!/, id);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('fw27_stg2')).clr[0]), 1, id + ': stage 1 is saved as cleared');
    rows.push({ unit: id, stage: 1, end: 'clear', ...r });
  }

  // 2. stage 10: an ultimate cast at gate 97 and the skill at 98 still run when gate 100 passes; the boss comes on, no gate after it
  for (const id of ['solaris', 'pleiad', 'tempest', 'quasar', 'aurora', 'pulsar', 'valkyrie', 'garuda', 'aegis'].filter(u => only.includes(u))){
    const r = await mission(id, 9, { ult: 97, skill: 98 }, 8, 4);
    assert.equal(r.ev, 'boss', id + ': the boss comes on stage 10');
    assert.deepEqual([r.gates, r.laid, r.clearDone], [100, 100, false], id + ': the boss comes right after gate 100, not a clear');
    for (let k = 0; k < 6 && await page.evaluate(() => FW.state === 'play' && FW.boss && FW.boss.ph !== 'fight'); k++) await fly(null, 120, false);   // the entrance
    const f = await page.evaluate(() => ({ ph: FW.boss && FW.boss.ph, gates: FW.gates.filter(g => !g.scored).length, state: FW.state }));
    const s = await stats();
    assert.equal(s.after, 0, id + ': no gate laid once the boss is up');
    assert.equal(f.gates, 0, id + ': no unscored gate in the fight');
    assert.ok(f.ph === 'fight' || f.state !== 'play', id + ': the fight starts (' + JSON.stringify(f) + ')');
    rows.push({ unit: id, stage: 10, end: 'boss', ...r });
  }

  // 3. AURORA: its skill and its ultimate never start a storm dash (no fall-through into TEMPEST's case)
  await seed('aurora'); await boot(); await start(0, '');
  await page.evaluate(() => { window.__ca = null; });
  await fly(null, 120 * 3);
  const look = () => ({ storm: FW.FX.stormDash, n: FW.FX.stormN, carry: FW.FX.carry, lane: FW.FX.laneN, live: FW.run.ultLive, state: FW.state });
  const au = { skill: await page.evaluate(`(${look})(FW.cast())`) };
  await fly(null, 120);   // the bot flies the skill's lane out
  au.ult = await page.evaluate(`(${look})(FW.ult())`);
  await fly(null, 120 * 4);
  assert.deepEqual([au.skill.storm, au.skill.n, au.skill.carry], [false, 0, false], 'AURORA skill: no storm dash');
  assert.ok(au.skill.lane > 0, 'AURORA skill: its lane is up');
  assert.deepEqual([au.ult.storm, au.ult.n, au.ult.carry], [false, 0, false], 'AURORA ultimate: no storm dash');
  assert.ok(au.ult.live && au.ult.lane >= 90, 'AURORA ultimate: Polar Night is up ' + JSON.stringify(au));
  assert.equal((await stats()).storm, false, 'AURORA: no storm dash in the 4 s after');
  console.log('aurora:', JSON.stringify(au));

  console.log('\n| unit | stage | end | tries | continues | ride | gates | laid | skill casts | ult casts | dashes |\n|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.unit} | ${r.stage} | ${r.end} | ${r.tries} | ${r.conts} | ${r.ride ? 'yes' : 'no'} | ${r.gates} | ${r.laid} | ${r.skill} | ${r.ult} | ${r.dash} |`);
  assert.deepEqual(errors, []);
  console.log('clear any means: ok');
} finally {
  await b.close(); srv.kill();
}
