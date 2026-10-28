import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex, loadHitLoop } from './helpers/hitloop.js';

// Surprise hazards (owner 2026-10-29, docs/design/surprise-obstacles-boss.md section 4): snap / shot / drop with a skin per zone, laid on their own
// seeded stream so the stage course (rng) and the extras (srng) roll exactly as before. The surprise block builds on the stages block.
const html = readIndex();
const st = html.match(/\/\* stages:start[\s\S]*?\/\* stages:end \*\//), sb = html.match(/\/\* surprise:start[\s\S]*?\/\* surprise:end \*\//);
const S = st && sb ? new Function(`${st[0]}\n${sb[0]}\nreturn {STAGES, ST_FIRST, ST_CNT, ST_RAMP, stLay, SUR, surKinds, surRate, surLay, snapAt, snapHit, shotAt, shotClear, dropAt};`)() : {};
const R = new Function(`${html.match(/function hashStr\(s\)\{[^\n]+/)[0]}\n${html.match(/function mulberry32\(a\)\{[^\n]+/)[0]}\nreturn {hashStr, mulberry32};`)();
const ROWS = S.STAGES || [];
const dAt = (row, k) => { const cap = Math.min(1, row.d0 + S.ST_RAMP); return k <= 45 ? row.d0 + (k / 45) * (cap - row.d0) : cap; };
// a stage's course as spawnGate lays it: stLay on rng / srng, three more course rolls, then surLay on the surprise stream
function course(i, n = 100, seed = 'stage:' + i + ':v2'){
  const row = ROWS[i], rng = R.mulberry32(R.hashStr(seed)), srng = R.mulberry32(R.hashStr(seed + ':x')), sur = R.mulberry32(R.hashStr(seed + ':s')), out = [];
  let prev = null;
  for (let k = 0; k < n; k++){
    const L = S.stLay(row, k, dAt(row, Math.max(k - 2, 0)), prev, 584, rng, srng, {gap: 0, pull: 1}); rng(); rng(); rng();
    const tw2 = !!(prev && prev.twin);
    out.push({...L, tw2, sr: S.surLay(row, i, k, L, tw2, sur)}); prev = L;
  }
  return out;
}

// Rates: the 100-gate curve tune 2026-10-29 (docs/balance/README.md, "Tune to the 100-gate curve, 2026-10-29"): base [.06, .08, .10, .12] ->
// [.02, .06, .07, .07], step .02 -> .01, x1.3 on boss rows only (was finales too), breathers x.5 -> x.7, a shot takes .2 of a kind's rate
test('a pure surprise block next to the stages block, with the agreed numbers', () => {
  assert.ok(sb, 'surprise block');
  assert.ok(Object.isFrozen(S.SUR) && Object.isFrozen(S.SUR.snap) && Object.isFrozen(S.SUR.shot) && Object.isFrozen(S.SUR.drop));
  assert.deepEqual([...S.SUR.kinds], ['snap', 'shot', 'drop']);
  assert.deepEqual([...S.SUR.base], [.02, .06, .07, .07]);
  assert.deepEqual([S.SUR.step, S.SUR.hot, S.SUR.calm, S.SUR.from], [.01, 1.3, .7, 7]);
  assert.ok(Object.isFrozen(S.SUR.w));
  assert.deepEqual({...S.SUR.w}, {snap: 1, shot: .2, drop: 1});
  assert.deepEqual([S.SUR.snap.keep, S.SUR.snap.tel, S.SUR.snap.out, S.SUR.snap.hold, S.SUR.snap.back], [112, .18, .12, .5, .3]);
  assert.deepEqual([[...S.SUR.snap.trig], [...S.SUR.snap.k]], [[100, 220], [.30, .42]]);
  assert.deepEqual([S.SUR.shot.tel, S.SUR.shot.fly, S.SUR.shot.r, S.SUR.shot.hr], [.45, .55, 14, 12]);
  assert.deepEqual([S.SUR.drop.trig, S.SUR.drop.tel, S.SUR.drop.v0, S.SUR.drop.acc, S.SUR.drop.r], [260, .4, 300, 1400, 18]);
});

// The snapshot was re-taken after the 100-gate curve tune 2026-10-29 changed the gaps (and so the heights); the surprise stream still moves nothing
test('the course is untouched by surprises: gates of stages 1, 10, 25 and 50 lay exactly as the course alone lays them (snapshot re-taken 2026-10-29)', () => {
  const before = {"0":[[231.21,275.68,"static"],[245.78,275.37,"static"],[229.24,282.07,"static"],[226.34,285.22,"static"],[213.8,274.95,"static"],[263.08,277.17,"static"],[261.82,278.14,"static"],[310.95,274.06,"static"],[270.28,274.51,"static"],[213.8,274.01,"static"],[262.72,279.96,"static"],[309.4,277.66,"static"]],"9":[[340.65,233.01,"static"],[291.09,235.3,"static"],[361.84,230.25,"static"],[294.56,226.04,"static"],[381,230.07,"static"],[297.21,227.1,"static"],[247.21,223.09,"static"],[347.21,231.39,"static"],[325.85,232.45,"move"],[253.22,232.56,"static"],[217.13,224.92,"static"],[224.07,224.44,"static"]],"24":[[377.87,192.71,"static"],[202.2,182.8,"static"],[166.07,189.61,"static"],[197.55,190.41,"static"],[280.69,190.77,"static"],[363.69,191.42,"static"],[313.69,194.27,"static"],[413.69,181.16,"pulse"],[228.89,180.58,"static"],[228.89,182.5,"static"],[270.41,192.17,"static"],[270.41,184.21,"static"]],"49":[[273.24,185.45,"static"],[314.94,181.98,"static"],[394.14,190.05,"static"],[217.88,185.73,"static"],[163.2,181.15,"static"],[242,177.58,"static"],[192,178.19,"static"],[292,185.12,"static"],[279.24,182.75,"move"],[357.51,177.99,"static"],[397.06,187.69,"static"],[301.56,181.79,"static"]]};
  for (const i of [0, 9, 24, 49]) assert.deepEqual(course(i, 12).map(g => [Math.round(g.base * 100) / 100, Math.round(g.gap * 100) / 100, g.type]), before[i], 'stage ' + (i + 1));
});

test('surLay always takes exactly three rolls of its own stream, whatever it decides', () => {
  for (const i of [0, 2, 6, 20, 49]){
    let n = 0; const base = R.mulberry32(R.hashStr('x' + i)), sur = () => { n++; return base(); };
    for (let k = 0; k < 100; k++){ const before = n; S.surLay(ROWS[i], i, k, {gap: 200, type: 'static', twin: false, sg: null, haz: null}, false, sur); assert.equal(n - before, 3, `stage ${i + 1} gate ${k + 1}`); }
  }
});

test('the runtime seeds the surprise stream on its own and spawnGate lays surprises from it only', () => {
  const reset = html.slice(html.indexOf('function reset(){'), html.indexOf('\n}\n', html.indexOf('function reset(){')));
  assert.match(reset, /sur = mulberry32\(hashStr\('stage:' \+ curStage \+ ':v2' \+ stSalt \+ ':s'\)\);/);
  const sp = html.slice(html.indexOf('function spawnGate('), html.indexOf('\n}\n', html.indexOf('function spawnGate(')));
  assert.match(sp, /surLay\(row, curStage, idx, L, tw2, sur\)/);
  assert.ok(sp.indexOf('surLay(') > sp.indexOf('stLay('), 'laid after the course');
});

test('determinism: the same stage seed gives the same surprises, stages differ', () => {
  for (const i of [2, 9, 19, 33, 49]) assert.deepEqual(course(i).map(g => g.sr), course(i).map(g => g.sr), 'stage ' + (i + 1));
  assert.notDeepEqual(course(20).map(g => g.sr && g.sr.k), course(21).map(g => g.sr && g.sr.k));
});

test('introduction: snap from stage 3, shot from stage 5, drop from stage 7; none on stages 1-2', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 49].map(i => S.surKinds(i).join(',')), ['', '', 'snap', 'snap', 'snap,shot', 'snap,shot', 'snap,shot,drop', 'snap,shot,drop']);
  for (const i of [0, 1]) assert.ok(course(i).every(g => !g.sr), 'stage ' + (i + 1));
  const first = k => ROWS.findIndex((r, i) => course(i).some(g => g.sr && g.sr.k === k)) + 1;
  assert.deepEqual(['snap', 'shot', 'drop'].map(first), [3, 5, 7]);
});

test('none before gate 8, at most one a gate, every kind in every zone', () => {
  const seen = [new Set(), new Set(), new Set(), new Set()];
  for (let i = 0; i < 50; i++) for (const [k, g] of course(i).entries()){
    if (k < 7) assert.equal(g.sr, null, `stage ${i + 1} gate ${k + 1}`);
    if (g.sr){ assert.ok(S.SUR.kinds.includes(g.sr.k)); seen[ROWS[i].zone].add(g.sr.k); }
  }
  seen.forEach((s, z) => assert.deepEqual([...s].sort(), ['drop', 'shot', 'snap'], 'zone ' + z));
});

test('exclusions: no snap on a moving, pulsing, twin or obstacle gate; no drop beside a hazard, a non-branch obstacle or after a twin', () => {
  let snaps = 0, drops = 0;
  for (let i = 0; i < 50; i++) for (const g of course(i)){
    if (!g.sr) continue;
    if (g.sr.k === 'snap'){ snaps++; assert.ok(g.type === 'static' && !g.twin && !g.tw2 && !g.sg, 'stage ' + (i + 1)); }
    if (g.sr.k === 'drop'){ drops++; assert.ok(!g.tw2 && !g.haz && !(g.sg && g.sg.k !== 'branch'), 'stage ' + (i + 1)); }
  }
  assert.ok(snaps > 50 && drops > 50, `exercised: ${snaps} snaps, ${drops} drops`);
  const sur = () => .001;   // any kind, whatever it rolls
  for (const L of [{type: 'move'}, {type: 'pulse'}, {type: 'static', twin: true}, {type: 'static', sg: {k: 'branch', drop: 40}}]) {
    const r = S.surLay(ROWS[2], 2, 20, {gap: 220, haz: null, sg: null, twin: false, ...L}, false, sur);
    assert.equal(r, null, JSON.stringify(L));
  }
  assert.equal(S.surLay(ROWS[2], 2, 20, {gap: 220, type: 'static', twin: false, sg: null, haz: null}, true, sur), null, 'the second gate of a twin');
});

test('each kind takes its weight w of the rate: snap 1, shot .2, drop 1 (tune 2026-10-29: shots ended most bot runs), in that order', () => {
  const i = 6, row = ROWS[i], p = S.surRate(row, i), L = {gap: 220, type: 'static', twin: false, sg: null, haz: null};
  const at = c => { const v = [c * p, .5, .5]; let n = 0; const r = S.surLay(row, i, 20, L, false, () => v[n++]); return r && r.k; };
  assert.deepEqual([0, .99, 1.01, 1.19, 1.21, 2.19, 2.21].map(at), ['snap', 'snap', 'shot', 'shot', 'drop', 'drop', null]);
  let shots = 0, others = 0;
  for (let k = 0; k < 50; k++) for (const g of course(k)) if (g.sr) g.sr.k === 'shot' ? shots++ : others++;
  assert.ok(shots > 0 && shots * 3 < others, `fewer shots than the other kinds: ${shots} vs ${others}`);
});

test('a snap always leaves at least keep px of the gap open, and lunges at least min px', () => {
  const P = S.SUR.snap;
  for (let i = 2; i < 50; i++) for (const g of course(i)) if (g.sr && g.sr.k === 'snap'){
    assert.ok(g.gap - g.sr.dep >= P.keep - 1e-9, `stage ${i + 1}: ${g.gap} - ${g.sr.dep}`);
    assert.ok(g.sr.dep >= P.min && g.sr.dep <= P.k[1] * g.gap + 1e-9);
    assert.ok(g.sr.trig >= P.trig[0] && g.sr.trig <= P.trig[1]);
  }
});

test('snap timing: .18 s telegraph, out in .12 s, holds .5 s, back in .3 s; its hit shape reaches no further than the lunge', () => {
  assert.deepEqual(S.snapAt(.1), {s: 'tel', k: 0});
  assert.equal(S.snapAt(.18 + .06).k.toFixed(3), '0.500');
  assert.equal(S.snapAt(.18 + .12 + .25).k, 1);
  assert.ok(Math.abs(S.snapAt(.18 + .12 + .5 + .15).k - .5) < 1e-9);
  assert.equal(S.snapAt(2).s, 'done');
  // jaws from the lower edge (dir -1) reaching 60 px up: a bird 1 px above the reach plus its radius is safe, inside is hit
  assert.ok(S.snapHit(100, 300 - 60 - 8, 9, 100, 300, -1, 60), 'touching the tip');
  assert.ok(!S.snapHit(100, 300 - 60 - 10.5, 10, 100, 300, -1, 60), 'just above the reach');
  assert.ok(!S.snapHit(160, 280, 10, 100, 300, -1, 60), 'beside the jaws');
  assert.ok(S.snapHit(100, 200 + 50, 10, 100, 200, 1, 60), 'the palace claw reaches down');
});

test('shot: .45 s of a following marker, .55 s of flight; it fires only when the bird will be clear of every gate at impact', () => {
  assert.deepEqual(S.shotAt(.2).s, 'tel');
  assert.equal(S.shotAt(.45 + .275).s, 'fly');
  assert.ok(Math.abs(S.shotAt(.45 + .275).k - .5) < 1e-9);
  assert.equal(S.shotAt(1.01).s, 'done');
  const bx = 120, br = 13, vx = 250, T1 = .45 + .55;
  // a gate whose span reaches the bird at impact holds the shot; one far enough ahead or behind lets it fire
  assert.equal(S.shotClear(bx, br, [{x: bx + vx * T1 - 30, w: 68}], vx), false);
  assert.equal(S.shotClear(bx, br, [{x: bx + vx * T1 + br + S.SUR.shot.pad + 5, w: 68}], vx), true);
  assert.equal(S.shotClear(bx, br, [{x: bx + vx * T1 - 68 - br - S.SUR.shot.pad - 5, w: 68}], vx), true);
  assert.equal(S.shotClear(bx, br, [], vx), true);
  // over a whole course at the usual spacing the guard leaves a window every gate spacing
  let open = 0; for (let x = 0; x < 250; x += 5) if (S.shotClear(bx, br, [{x: bx + x, w: 68}, {x: bx + x + 250, w: 68}], vx)) open++;
  assert.ok(open >= 10 && open < 50, 'fires in part of every spacing: ' + open);
});

test('drop: .4 s telegraph, then falls from 300 px/s at 1400 px/s²', () => {
  assert.deepEqual(S.dropAt(.3), {s: 'tel', y: 0});
  const q = S.dropAt(.4 + .5);
  assert.equal(q.s, 'fall'); assert.ok(Math.abs(q.y - (300 * .5 + 700 * .25)) < 1e-9);
});

test('rates by zone: base + .01 across the zone, x1.3 on bosses, x.7 on breathers (tune 2026-10-29)', () => {
  for (let z = 0; z < 4; z++){
    const a = S.ST_FIRST[z], b = a + S.ST_CNT[z] - 1, m = r => r.boss ? 1.3 : r.rest ? .7 : 1;
    assert.ok(Math.abs(S.surRate(ROWS[a], a) - S.SUR.base[z] * m(ROWS[a])) < 1e-9, 'zone start ' + z);
    assert.ok(Math.abs(S.surRate(ROWS[b], b) - (S.SUR.base[z] + .01) * m(ROWS[b])) < 1e-9, 'zone end ' + z);
  }
  assert.ok(Math.abs(S.surRate(ROWS[19], 19) / ((S.SUR.base[1] + .01 * 9 / 14)) - 1.3) < 1e-9, 'stage 20: a boss without the finale numbers');
  assert.ok(Math.abs(S.surRate(ROWS[24], 24) - (S.SUR.base[1] + .01)) < 1e-9, 'stage 25: a finale without a boss is not hot (its gust trap, re-measure 2026-10-29)');
  for (let z = 1; z < 4; z++) assert.ok(S.SUR.base[z] >= S.SUR.base[z - 1], 'the rate never falls zone to zone');
  const share = i => course(i).filter(g => g.sr).length;
  const z0 = [6, 7].reduce((s, i) => s + share(i), 0), z3 = [42, 43].reduce((s, i) => s + share(i), 0);
  assert.ok(z3 > z0, `the palace has more than the grove: ${z3} vs ${z0}`);
});

test('a surprise hit takes the signature-obstacle path, never scores, and each kind has its own death hint', () => {
  const tick = html.slice(html.indexOf('function surTick('), html.indexOf('\n}\n', html.indexOf('function surTick(')));
  assert.ok(tick.length > 100);
  assert.doesNotMatch(tick, /addScore|score \+=|gatesPassed/);
  for (const k of ['snap', 'shot', 'drop']) assert.match(tick, new RegExp(`sigHit\\('${k}'`), k);
  const H = loadHitLoop(html);
  assert.deepEqual(['snap', 'shot', 'drop'].map(w => H.deathHint(w, 9)), ['whySnap', 'whyShot', 'whyDrop']);
  assert.match(html, /if \(mode === 'endless'\)\{ sigTick\(dt\); if \(state !== 'play'\) return; surTick\(dt, vx\); if \(state !== 'play'\) return; \}/);
});

test('juice: a sting and a light shake that honour reduced motion and the FX quality', () => {
  assert.match(html, /surSting\(\)\{[^\n]*tone\(/);
  const tick = html.slice(html.indexOf('function surTick('), html.indexOf('\n}\n', html.indexOf('function surTick(')));
  assert.match(tick, /RM \? 0 : /, 'no shake with reduced motion');
  const draw = html.slice(html.indexOf('function drawSur('), html.indexOf('\n}\n', html.indexOf('function drawSur(')));
  assert.match(draw, /glowPx\(/);
  assert.match(html, /const SUR_SKIN = \{/, 'one skin function per kind and zone (art swaps in per entry)');
  for (const k of ['snap', 'shot', 'drop']) assert.match(html, new RegExp(`\\b${k}: \\[`), k + ' skins');
});
