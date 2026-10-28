// Boss fight smoke: node tests/e2e/boss-smoke.mjs  (dev server: PORT=5281 node scripts/serve.mjs; PORT defaults to 5173)
// Every *.supabase.co request is aborted. FW.bossGo() (QA only, #dev on localhost) skips a boss stage's course to its fight. A scripted bot then fights
// the stage 10 and stage 50 bosses: it dodges each telegraphed attack (the wall's hole, off the beam's and the charge's line, away from shots and minions)
// and dashes when the meter is full and the boss's height is within 40 px of its own. It must win: the explosion, then the clear (MISSION CLEAR beat,
// result card, stage cleared). Screenshots of the entrance, every attack, a ram hit, the enraged boss, the HP bar and the kill land in $SHOTS.
// It also casts the skill and the ultimate of units that act on gates (SOLARIS, TEMPEST, PLEIAD, QUASAR, AURORA, COSMOS) in a fight: nothing may throw.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`, shots = process.env.SHOTS || tmpdir();
const b = await chromium.launch(), page = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.route(/supabase/, r => r.abort());

const z50 = () => Array(50).fill(0);
const seed = (bird = 'volt') => page.evaluate(([stg, bird]) => { localStorage.clear(); for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'en', fw27_dintro: 1, fw27_stg2: stg, fw27_bird: bird, fw27_owned: ['volt', bird] }))
  localStorage.setItem(k, JSON.stringify(v)); }, [{ gates: z50(), score: z50(), clr: z50(), star: z50(), open: 49 }, bird]);
const boot = async () => { await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu'); };
const start = async (i, salt = '') => { await page.evaluate(v => { FW.salt = v; document.getElementById('startBtn').click(); }, salt); await page.evaluate(n => document.querySelectorAll('#stageScr .stc')[n].click(), i);
  await page.waitForFunction(() => FW.state === 'play'); await page.evaluate(() => { FW.hold = true; }); };
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const snap = async name => { await page.evaluate(() => { const d = document.getElementById('fxDev'); if (d) d.remove(); }); await frame(); await page.screenshot({ path: join(shots, `boss-${name}.png`) }); console.log('shot', name); };

// The bot, one call: steps at 1/120 s until a moment worth a screenshot (want: names not taken yet), the fight is won (FX.winT > 0) or lost, or cap steps
const fight = (want, cap = 120 * 30) => page.evaluate(([want, cap]) => {
  const flap = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })), dash = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  const W = new Set(want);
  for (let i = 0; i < cap && FW.state === 'play'; i++){
    const bo = FW.boss, bd = FW.bird; if (!bo){ FW.step(1/120); if (FW.FX.winT > 0) return {ev: 'won'}; continue; }
    const s = bo.s, a = s.atk, act = s.ph !== 'wait', G = 584, hr = 11, mins = FW.bsh.filter(e => e.k === 'min'), hunt = mins.length > 0 && FW.timers.dashMeter >= 1;
    const bands = [], far = (e) => Math.hypot(e.x - bd.x, e.y - bd.y);   // bands: [y, r], heights to keep out of over the next ~half second
    if (a === 'beam' && act) bands.push([bo.lock, 32 + hr + 12]);
    if (a === 'charge' && act) bands.push([bo.lock, 52 + hr + 14]);
    if (a === 'volley' && act) bands.push([bo.lock, 44]);
    for (const e of FW.bsh){
      if (e.k === 'min'){ if (!hunt && far(e) < 200) bands.push([e.y + e.vy*.25, e.r + hr + 60]); continue; }
      for (let t = 0; t <= .6; t += .03){ if (Math.abs(e.x + e.vx*t - bd.x) < e.r + hr + 4){ bands.push([e.y + e.vy*t, e.r + hr + 10]); break; } }
    }
    const clr = y => Math.min(60, ...bands.map(([q, r]) => Math.abs(y - q) - r));
    const want = hunt ? mins.reduce((m, e) => far(e) < far(m) ? e : m).y : (a === 'wall' && s.ph === 'tel') || FW.bsh.some(e => e.k === 'wall' && e.x > bd.x - 30) ? bo.hole : FW.timers.dashMeter > .85 ? bo.y : G * .5;   // the middle while the dash fills: the boss follows, and there is room both ways   // line up with a minion to smash, the coming hole, or the boss
    let ty = want, best = -1e9;
    for (let y = 50; y <= G - 50; y += 6){ const c = clr(y), sc = (c < 0 ? c*10 - 400 : c) - Math.abs(y - bd.y)*.25 - Math.abs(y - want)*.08; if (sc > best){ best = sc; ty = y; } }
    if (bd.y > ty + (bands.length ? 24 : 6) && bd.vy > (clr(bd.y) < 0 ? -330 : -140) && (clr(bd.y - 75) > Math.min(0, clr(bd.y)) || bd.y > G - 22)) flap();   // a flap climbs ~75 px: never into a danger
    const near = mins.find(e => e.x > bd.x - 30 && far(e) < 75);
    if (FW.timers.dashMeter >= 1 && bo.ph === 'fight' && (near || clr(bd.y) < -6 || (!mins.length && bo.hitT <= 0 && Math.abs(bo.y - bd.y) < 40))) dash();   // smash a minion, ride a hit out in the dash, or ram
    FW.step(1/120);
    const b2 = FW.boss; if (!b2) continue;
    const evs = [b2.dieT > 0 && 'kill', b2.hitT > .5 && 'hit', b2.rage && b2.hitT <= 0 && 'rage', b2.ph === 'enter' && b2.t > .5 && 'entrance', b2.ph === 'fight' && b2.t > 3 && 'hpbar',
      b2.s.ph === 'tel' && b2.at > ({volley: .3, wall: .4, charge: .45, beam: .5, minion: .3})[b2.s.atk] && b2.s.atk + '-tel',
      ({volley: b2.s.ph === 'act' || FW.bsh.some(e => e.k === 'ball' && e.x < b2.x - 110), wall: FW.bsh.some(e => e.k === 'wall' && e.x < FW.LW*.6), charge: b2.s.ph === 'act' && b2.x < FW.LW*.45,
        beam: b2.s.ph === 'act' && b2.at > 1, minion: FW.bsh.some(e => e.k === 'min' && e.t > .8)})[b2.s.atk] && b2.s.atk];
    const ev = evs.find(e => e && W.has(e)); if (ev) return {ev};
  }
  return {ev: FW.state === 'play' ? 'cap' : FW.state, why: FW.why};
}, [want, cap]);

const ATK = ['volley', 'wall', 'charge', 'beam', 'minion'];
async function bossRun(stage, tag, wantShots, maxTries = 12){
  for (let tries = 0; tries < maxTries; tries++){
    await seed(); await boot(); await start(stage, tries ? 'try' + tries : '');
    assert.equal(await page.evaluate(() => FW.bossGo()), true, 'FW.bossGo on stage ' + (stage + 1));
    const t0 = await page.evaluate(() => FW.run.T), got = new Set();
    let r, n = 0;
    while (n++ < 400){
      r = await fight(wantShots.filter(w => !got.has(w)));
      if (r.ev === 'won' || r.ev === 'dying' || r.ev === 'over' || r.ev === 'cont') break;
      if (r.ev !== 'cap'){ got.add(r.ev); await snap(`${tag}-${r.ev}`); }
    }
    if (r.ev !== 'won'){ console.log(`stage ${stage + 1} try ${tries + 1}: ${r.ev} (${r.why}), boss HP left`, await page.evaluate(() => FW.boss && FW.boss.hp)); continue; }
    const secs = await page.evaluate(t0 => FW.run.T - t0, t0);
    await page.evaluate(() => FW.step(1/60, 24)); await snap(`${tag}-clear`);
    assert.equal(await page.evaluate(() => FW.run.gatesPassed), 100, 'the boss adds no gate');
    const sc = await page.evaluate(() => FW.run.score);
    await page.evaluate(() => FW.step(1/60, 80));
    assert.equal(await page.evaluate(() => FW.state), 'over', 'the result card follows the beat');
    assert.match(await page.textContent('#oWhy'), new RegExp(`STAGE ${stage + 1} CLEAR!`));
    assert.equal(await page.evaluate(n => JSON.parse(localStorage.getItem('fw27_stg2')).clr[n], stage), 1);
    assert.equal(sc, 0, 'no score from the boss (the course was skipped by FW.bossGo)');
    return {tries: tries + 1, secs, got: [...got]};
  }
  assert.fail(`the bot never beat the stage ${stage + 1} boss`);
}

await page.goto(base);
await seed(); await boot();
assert.deepEqual((await page.evaluate(() => FW.selfTest())).filter(k => k !== 'skill'), [], 'FW.selfTest passes (skill fails on main 47bb0ce already)');
const r10 = await bossRun(9, 's10', ['entrance', 'hpbar', 'volley-tel', 'volley', 'wall-tel', 'wall', 'hit', 'rage', 'kill']);
console.log('stage 10:', JSON.stringify(r10));
const r50 = await bossRun(49, 's50', ['entrance', 'hpbar', ...ATK.flatMap(a => [a + '-tel', a]), 'hit', 'rage', 'kill'], 80);
console.log('stage 50:', JSON.stringify(r50));
for (const a of ATK) assert.ok(r50.got.includes(a), a + ' seen on stage 50');

// daily and versus never start a boss; the QA jump refuses a plain stage
await seed(); await boot(); await start(10);
assert.equal(await page.evaluate(() => FW.bossGo()), false);

// a continue: the boss keeps its HP, its shots are gone, the bird is home (the continue card opens with coins in the wallet)
await seed(); await page.evaluate(() => localStorage.setItem('fw27_wallet2', JSON.stringify({ coins: 5000 }))); await boot(); await start(49);
await page.evaluate(() => FW.bossGo()); await fight([], 120 * 5);   // the bot flies the first seconds
const hp0 = await page.evaluate(() => { FW.boss.hp -= 3; FW.setRun({score: 120}); return FW.boss.hp; });   // as if the course was flown   // as if rammed three times
await page.evaluate(() => { FW.kill(); for (let i = 0; i < 600 && FW.state === 'dying'; i++) FW.step(1/60); });
const st = await page.evaluate(() => FW.state);
assert.equal(st, 'cont', 'the continue card opens');
{
  await page.click('#contCoin');
  const after = await page.evaluate(() => ({hp: FW.boss.hp, n: FW.bsh.length, x: FW.bird.x, ph: FW.boss.s.ph, state: FW.state}));
  assert.deepEqual([after.hp, after.n, after.ph, after.state], [hp0, 0, 'wait', 'play']);
  assert.ok(Math.abs(after.x - Math.min(390 * .3, 150) * 1) < 60);
  console.log('continue: ok', JSON.stringify(after));
}

// units that act on gates: their skill and ultimate in a fight with no gates must not throw
for (const u of ['solaris', 'tempest', 'pleiad', 'quasar', 'aurora', 'cosmos', 'garuda', 'valkyrie']){
  await seed(u); await boot(); await start(9);
  await page.evaluate(() => FW.bossGo()); await fight([], 120 * 3);   // the bot flies it meanwhile
  const c = await page.evaluate(() => { const c0 = FW.run.skillCharge; FW.cast(); return {skill: FW.run.skillCharge < c0, storm: FW.FX.stormN}; });
  await fight([], 60); const cast = {...c, ...await page.evaluate(() => { FW.ult(); return {ult: FW.run.ultLive, at: FW.state}; })};
  for (let k = 0; k < 30 && await page.evaluate(() => FW.state === 'play' && (FW.FX.stormN > 0 || FW.FX.ultN > 0 || FW.run.ultLive)); k++) await fight([], 120);   // until its gate-counted part has run out (one gate every BOSS.gate s)
  const left = await page.evaluate(() => ({ultN: FW.FX.ultN, storm: FW.FX.stormN, state: FW.state}));
  assert.equal(left.storm, 0, u + ': the storm chain ends in a fight');
  assert.equal(left.ultN, 0, u + ': a gate-counted ultimate ends in a fight');
  console.log('cast', u, JSON.stringify(cast)); assert.ok(cast.skill && cast.ult, u + ': skill and ultimate cast in the fight'); console.log('unit', u, JSON.stringify({...cast, ...left}));
}

assert.deepEqual(errors, []);
await b.close();
console.log('boss smoke: ok');
