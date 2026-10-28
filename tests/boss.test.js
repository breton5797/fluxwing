import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// Boss fights (owner 2026-10-29, docs/design/surprise-obstacles-boss.md section 3): a boss after the 100th gate of stages 10/20/30/40/50, beaten by
// dash-ramming. The boss block is pure (no DOM, no game state): the table, the attack scheduler, the wall hole, charge / beam geometry and the meter.
const html = readIndex();
const st = html.match(/\/\* stages:start[\s\S]*?\/\* stages:end \*\//), bb = html.match(/\/\* boss:start[\s\S]*?\/\* boss:end \*\//);
const S = st && bb ? new Function(`${st[0]}\n${bb[0]}\nreturn {STAGES, BOSS, bossOf, bossPause, bossRage, bossPick, bossStep, bossSeed, actLen, wallHole, wallYs, volleyVel, chargeAt, beamAt, meterGain, ramBack};`)() : {};
const R = new Function(`${html.match(/function hashStr\(s\)\{[^\n]+/)[0]}\n${html.match(/function mulberry32\(a\)\{[^\n]+/)[0]}\nreturn {hashStr, mulberry32};`)();
const body = name => { const at = html.indexOf(name); assert.ok(at >= 0, name); return html.slice(at, html.indexOf('\n}\n', at)); };
const GROUND = 584, X0 = 390 - 95;
const seeded = (i, salt = '') => R.mulberry32(R.hashStr(S.bossSeed(i, salt)));

test('a pure boss block with the agreed table: stages 10/20/30/40/50, HP 5/7/9/12/15, pools growing per boss', () => {
  assert.ok(bb, 'boss block');
  assert.ok(Object.isFrozen(S.BOSS) && Object.isFrozen(S.BOSS.list) && Object.isFrozen(S.BOSS.atk) && Object.isFrozen(S.BOSS.pause));
  assert.deepEqual(S.BOSS.list.map(b => [b.st, b.name, b.hp]), [[9, 'MAWBLOOM', 5], [19, 'DUNEHULK', 7], [29, 'CINDERWYRM', 9], [39, 'MOLTEN KING', 12], [49, 'STORMCROWN', 15]]);
  assert.deepEqual(S.BOSS.list.map(b => [...b.pool]), [['volley', 'wall'], ['volley', 'wall', 'charge'], ['volley', 'wall', 'charge', 'beam'],
    ['volley', 'wall', 'charge', 'beam', 'minion'], ['volley', 'wall', 'charge', 'beam', 'minion']]);
  assert.deepEqual(S.BOSS.list.map(b => b.zone), [0, 1, 2, 2, 3], 'each boss is themed to its stage\'s zone');
  assert.deepEqual(S.BOSS.list.map(b => b.id), ['mawbloom', 'dunehulk', 'cinderwyrm', 'moltenking', 'stormcrown'], 'ids match the art files (art/boss-<id>.webp)');
  assert.deepEqual(S.STAGES.map((r, i) => r.boss ? i : -1).filter(i => i >= 0), S.BOSS.list.map(b => b.st), 'a boss for every boss row, none elsewhere');
  for (let i = 0; i < 50; i++) assert.equal(S.bossOf(i), S.BOSS.list.find(b => b.st === i) || null, 'bossOf ' + i);
  assert.deepEqual([S.BOSS.r, S.BOSS.off, S.BOSS.lunge, S.BOSS.miss, S.BOSS.back, S.BOSS.inv, S.BOSS.charge], [58, 95, 1500, 150, .35, .6, 2.6]);
});

test('the pause between attacks goes from 2.2 s down to 1.5 s across the bosses, and x0.75 when enraged (HP at half or below)', () => {
  const p = [0, 1, 2, 3, 4].map(k => S.bossPause(k, false));
  assert.equal(p[0], 2.2); assert.ok(Math.abs(p[4] - 1.5) < 1e-9);
  for (let k = 1; k < 5; k++) assert.ok(p[k] < p[k - 1], 'boss ' + k + ' attacks sooner');
  for (let k = 0; k < 5; k++) assert.ok(Math.abs(S.bossPause(k, true) - p[k] * .75) < 1e-9);
  assert.equal(S.BOSS.rage, .75);
  assert.deepEqual([[5, 5], [3, 5], [2, 5], [8, 15], [7, 15], [1, 1]].map(([h, m]) => S.bossRage(h, m)), [false, false, true, false, true, false]);
});

test('every attack has its telegraph (volley .5, wall .6, charge .7, beam .8, minion .4) and an act time', () => {
  const tel = Object.fromEntries(Object.entries(S.BOSS.atk).map(([k, a]) => [k, a.tel]));
  assert.deepEqual(tel, {volley: .5, wall: .6, charge: .7, beam: .8, minion: .4});
  for (const b of S.BOSS.list) for (const a of b.pool){ assert.ok(S.BOSS.atk[a], a); assert.ok(S.BOSS.atk[a].tel > 0); assert.ok(S.actLen(a, X0) > 0, a + ' acts'); }
  assert.deepEqual([S.BOSS.atk.volley.v, S.BOSS.atk.volley.dv, S.BOSS.atk.wall.v, S.BOSS.atk.wall.hole, S.BOSS.atk.wall.step, S.BOSS.atk.charge.v, S.BOSS.atk.charge.to,
    S.BOSS.atk.beam.h, S.BOSS.atk.beam.on, S.BOSS.atk.minion.v, S.BOSS.atk.minion.life, S.BOSS.atk.minion.meter], [330, 20, 260, 150, 220, 900, 40, 64, .5, 120, 6, .25]);
});

test('the scheduler: entrance, then pause → telegraph → attack, one at a time, only from the boss\'s pool, with the pause the boss and its rage call for', () => {
  for (const [k, b] of S.BOSS.list.entries()){
    const rnd = seeded(b.st), seen = new Set(), dt = 1/60;
    let s = {ph: 'wait', t: S.bossPause(k, false), atk: '', last: ''}, waitT = 0, telT = 0, prevPh = 'wait', fired = 0;
    for (let i = 0; i < 60 * 120; i++){
      const rage = i > 60 * 60, r = S.bossStep(s, dt, k, rage, b.pool, rnd, X0); s = r.s;
      assert.ok(['wait', 'tel', 'act'].includes(s.ph));
      if (r.ev === 'tel'){ assert.ok(b.pool.includes(s.atk), s.atk); seen.add(s.atk);
        if (fired > 1) assert.ok(Math.abs(waitT - S.bossPause(k, i - Math.round(waitT * 60) > 60 * 60)) < 2 * dt, `boss ${k} waited ${waitT}`); }
      if (r.ev === 'fire'){ fired++; assert.ok(Math.abs(telT - S.BOSS.atk[s.atk].tel) < 2 * dt, 'telegraph runs its full length'); }
      if (s.ph !== prevPh){ if (s.ph === 'wait') waitT = 0; if (s.ph === 'tel') telT = 0; }
      if (s.ph === 'wait') waitT += dt; if (s.ph === 'tel') telT += dt; prevPh = s.ph;
    }
    assert.deepEqual([...seen].sort(), [...b.pool].sort(), b.name + ' uses its whole pool');
    assert.ok(fired > 20, b.name + ' fires');
  }
});

test('deterministic: the boss rng is seeded from the stage seed with a :b suffix, and the same seed plays the same fight', () => {
  assert.equal(S.bossSeed(9, ''), 'stage:9:v2:b');
  assert.equal(S.bossSeed(49, 'try3'), 'stage:49:v2try3:b');
  const run = (i, salt) => { const b = S.bossOf(i), k = S.BOSS.list.indexOf(b), rnd = seeded(i, salt), out = []; let s = {ph: 'wait', t: 1, atk: '', last: ''}, prev = 300;
    for (let n = 0; n < 60 * 90; n++){ const r = S.bossStep(s, 1/60, k, false, b.pool, rnd, X0); s = r.s;
      if (r.ev === 'fire'){ out.push(s.atk); if (s.atk === 'wall'){ prev = S.wallHole(prev, rnd(), GROUND); out.push(Math.round(prev)); } } }
    return out.join(','); };
  assert.equal(run(49, ''), run(49, ''));
  assert.notEqual(run(49, ''), run(49, 'x'));
  assert.notEqual(run(39, ''), run(49, ''));
});

test('the wall: a hole at least 150 px tall, fully on screen, never more than 220 px from the previous hole; the rest of the wall is closed', () => {
  const W = S.BOSS.atk.wall, rnd = R.mulberry32(R.hashStr('wall-test'));
  let prev = 40;   // the first hole may follow the bird from anywhere
  for (let i = 0; i < 4000; i++){
    const y = S.wallHole(prev, rnd(), GROUND);
    assert.ok(y - W.hole/2 >= 0 && y + W.hole/2 <= GROUND, 'on screen: ' + y);
    assert.ok(y - W.hole/2 >= W.pad && y + W.hole/2 <= GROUND - W.pad, 'clear of the ceiling and the ground: ' + y);
    if (i) assert.ok(Math.abs(y - prev) <= W.step + 1e-9, 'within 220 of ' + prev + ': ' + y);
    const ys = S.wallYs(y, GROUND), above = ys.filter(q => q < y), below = ys.filter(q => q > y);
    const clear = Math.min(...below, GROUND + W.r) - W.r - (Math.max(...above, -W.r) + W.r);
    assert.ok(clear >= W.hole - 1e-9, 'the hole is clear: ' + clear);
    for (let j = 1; j < ys.length; j++) if (!(ys[j - 1] < y && ys[j] > y)) assert.ok(ys[j] - ys[j - 1] - 2 * W.r < 2 * 13 * .82, 'no other gap a bird fits through');
    prev = y;
  }
  assert.ok(Math.abs(S.wallHole(350, 0, GROUND) - 130) < 1e-9 && Math.abs(S.wallHole(250, 1, GROUND) - 470) < 1e-9, 'the full reach: prev ± 220');
  assert.equal(S.wallHole(-500, 0, GROUND), W.hole/2 + W.pad, 'a far-off previous hole (the bird\'s y) is clamped onto the screen first');
});

test('the volley: 3 to 5 shots aimed at the bird, spread ±12°, at 330 px/s + 20 per boss', () => {
  for (const n of [3, 4, 5]) for (const k of [0, 4]){
    const vs = S.volleyVel(300, 200, 120, 260, n, 330 + 20 * k), aim = Math.atan2(60, -180);
    assert.equal(vs.length, n);
    const a = vs.map(v => Math.atan2(v.vy, v.vx)).sort((p, q) => p - q);
    assert.ok(Math.abs(a[0] - (aim - 12 * Math.PI / 180)) < 1e-9 && Math.abs(a[n - 1] - (aim + 12 * Math.PI / 180)) < 1e-9);
    for (const v of vs) assert.ok(Math.abs(Math.hypot(v.vx, v.vy) - (330 + 20 * k)) < 1e-9);
  }
});

test('charge and beam geometry: the rush to x = 40 at 900 px/s and back; the beam band lethal for .5 s after its .8 s warning', () => {
  const C = S.BOSS.atk.charge, rush = (X0 - C.to) / C.v;
  assert.deepEqual(S.chargeAt(0, X0), {s: 'tel', x: X0});
  assert.equal(S.chargeAt(C.tel - .01, X0).x, X0, 'it does not move while telegraphing');
  assert.ok(Math.abs(S.chargeAt(C.tel + rush / 2, X0).x - (X0 + C.to) / 2) < 1e-6);
  assert.ok(Math.abs(S.chargeAt(C.tel + rush, X0).x - C.to) < 1e-6);
  assert.equal(S.chargeAt(C.tel + S.actLen('charge', X0) + .01, X0).s, 'done');
  assert.equal(S.chargeAt(C.tel + S.actLen('charge', X0) + .01, X0).x, X0);
  for (let t = 0; t < 3; t += .01){ const q = S.chargeAt(t, X0); assert.ok(q.x >= C.to - 1e-9 && q.x <= X0 + 1e-9); }
  assert.equal(S.beamAt(.79).s, 'tel'); assert.equal(S.beamAt(.81).s, 'on'); assert.equal(S.beamAt(1.29).s, 'on'); assert.equal(S.beamAt(1.31).s, 'done');
  assert.equal(S.actLen('beam', X0), .5);
});

test('the dash meter refills by itself in the fight: full in 2.6 s / B.dash; the lunge comes back to its home in .35 s', () => {
  for (const d of [1, 1.2, .8]){ let m = 0, t = 0; while (m < 1){ m += S.meterGain(1/120, d); t += 1/120; } assert.ok(Math.abs(t - 2.6 / d) < 1/60, d + ': ' + t); }
  assert.equal(S.ramBack(260, 120, 0), 260);
  assert.equal(S.ramBack(260, 120, .35), 120);
  assert.equal(S.ramBack(260, 120, 1), 120);
  const mid = S.ramBack(260, 120, .175); assert.ok(mid < 260 && mid > 120);
});

test('the engine: bossStart starts a fight (no stageWin at once), its defeat calls stageWin; stage mode only', () => {
  const b = body('function bossStart(');
  assert.doesNotMatch(b, /stageWin\(/, 'no instant win: the boss has to be beaten');
  assert.doesNotMatch(b, /TODO phase 2/);
  assert.match(b, /if \(mode !== 'endless'/, 'daily and versus never start a boss');
  assert.match(b, /FX\.bossOn = true;/);
  assert.match(body('function bossKill('), /stageWin\(\);/, 'the clear follows the explosion');
  // the only caller is the stage-mode goal check
  assert.equal(html.match(/(?<!function )bossStart\(\)/g).length, 2, 'the goal check and the QA jump');
  assert.match(html, /if \(mode === 'endless' && !FX\.clearDone && !FX\.bossOn && gatesPassed >= stGoal\(curStage\)\)\{ if \(STAGES\[curStage\]\.boss\) bossStart\(\); else stageWin\(\); \}/);
});

test('the boss gives no score: no addScore, no score += and no gatesPassed in the boss block or the fight code', () => {
  const src = bb[0] + ['function bossStart(', 'function bossUpdate(', 'function bossRam(', 'function bossShots(', 'function bossKill(', 'function bossResume(', 'function bossHurt('].map(body).join('\n');
  assert.doesNotMatch(src, /addScore|score\s*\+=|score\s*=|gatesPassed/);
});

test('every boss hazard goes through sigHit (dash, invuln, god, clone and shield respected); a death is "boss" with its own hint', () => {
  const src = ['function bossUpdate(', 'function bossShots('].map(body).join('\n');
  assert.match(src, /sigHit\('boss'/);
  assert.doesNotMatch(src, /\bdie\(/, 'never die() directly');
  const dh = html.match(/const deathHint = [^\n]+\n[^\n]+/)[0];
  assert.match(dh, /'boss'/);
  const deathHint = new Function(dh + '\nreturn deathHint;')();
  assert.equal(deathHint('boss', 100), 'whyBoss');
});

test('a continue resumes the fight: the boss keeps its HP, attacks and shots in flight are cleared, the bird is home', () => {
  assert.match(body('function closeCont('), /bossResume\(\)/);
  const r = body('function bossResume(');
  assert.match(r, /bsh = \[\]/);
  assert.doesNotMatch(r, /\.hp\s*=/, 'the HP is kept');
  assert.match(r, /bird\.x = /);
});

test('a new run starts with no boss; dash in a fight lunges; gate-counted effects count fight time instead of gates', () => {
  assert.match(body('function reset('), /boss = null; bsh = \[\]; ram = null;/);
  assert.match(body('function dash('), /if \(boss\) bossRam\(\);/);
  assert.match(body('function bossUpdate('), /FX\.stormN|FX\.ultN/);
});
