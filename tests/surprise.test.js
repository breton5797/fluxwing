import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex, loadHitLoop } from './helpers/hitloop.js';

// Surprise hazards (owner 2026-10-29, docs/design/surprise-obstacles-boss.md section 4): snap / shot / drop with a skin per zone, laid on their own
// seeded stream so the stage course (rng) and the extras (srng) roll exactly as before. The surprise block builds on the stages block.
const html = readIndex();
const st = html.match(/\/\* stages:start[\s\S]*?\/\* stages:end \*\//), sb = html.match(/\/\* surprise:start[\s\S]*?\/\* surprise:end \*\//);
const S = st && sb ? new Function(`${st[0]}\n${sb[0]}\nreturn {STAGES, ST_FIRST, ST_CNT, stLay, SUR, surKinds, surRate, surLay, snapAt, snapHit, shotAt, shotClear, dropAt};`)() : {};
const R = new Function(`${html.match(/function hashStr\(s\)\{[^\n]+/)[0]}\n${html.match(/function mulberry32\(a\)\{[^\n]+/)[0]}\nreturn {hashStr, mulberry32};`)();
const ROWS = S.STAGES || [];
const dAt = (row, k) => { const cap = Math.min(1, row.d0 + .35); return k <= 45 ? row.d0 + (k / 45) * (cap - row.d0) : cap; };
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

test('a pure surprise block next to the stages block, with the agreed numbers', () => {
  assert.ok(sb, 'surprise block');
  assert.ok(Object.isFrozen(S.SUR) && Object.isFrozen(S.SUR.snap) && Object.isFrozen(S.SUR.shot) && Object.isFrozen(S.SUR.drop));
  assert.deepEqual([...S.SUR.kinds], ['snap', 'shot', 'drop']);
  assert.deepEqual([...S.SUR.base], [.06, .08, .10, .12]);
  assert.deepEqual([S.SUR.snap.keep, S.SUR.snap.tel, S.SUR.snap.out, S.SUR.snap.hold, S.SUR.snap.back], [112, .18, .12, .5, .3]);
  assert.deepEqual([[...S.SUR.snap.trig], [...S.SUR.snap.k]], [[100, 220], [.30, .42]]);
  assert.deepEqual([S.SUR.shot.tel, S.SUR.shot.fly, S.SUR.shot.r, S.SUR.shot.hr], [.45, .55, 14, 12]);
  assert.deepEqual([S.SUR.drop.trig, S.SUR.drop.tel, S.SUR.drop.v0, S.SUR.drop.acc, S.SUR.drop.r], [260, .4, 300, 1400, 18]);
});

test('the old course is untouched: gates of stages 1, 10, 25 and 50 lay exactly as before the surprises (snapshot taken on main 47bb0ce)', () => {
  const before = {"0":[[222.53,251.66,"static"],[239.2,251.35,"static"],[219.93,258.05,"static"],[216.32,260.98,"static"],[202.49,250.5,"static"],[251.6,252.5,"static"],[257.29,253.25,"static"],[306.14,248.95,"static"],[267.03,249.18,"static"],[202.05,248.46,"static"],[250.53,254.19,"static"],[298.87,251.68,"static"]],"9":[[344.8,214.99,"static"],[291.01,217.28,"static"],[367.73,212.24,"static"],[294.78,207.83,"static"],[381.01,211.68,"static"],[297.66,208.51,"static"],[247.66,204.32,"static"],[347.66,212.42,"static"],[330.08,213.3,"move"],[249.68,213.22,"static"],[210.45,205.39,"static"],[217.97,204.72,"static"]],"24":[[383.4,174.72,"static"],[200.2,164.81,"static"],[157.17,171.62,"static"],[190.8,172.26,"static"],[273.73,172.48,"static"],[356.43,172.97,"static"],[306.43,175.67,"static"],[406.43,162.4,"pulse"],[220.43,161.67,"static"],[220.43,163.44,"static"],[268.77,172.95,"pulse"],[268.77,164.84,"static"]],"49":[[272.01,168.46,"static"],[316.43,164.99,"static"],[395.63,173.06,"static"],[212.95,168.57,"static"],[154.71,163.84,"static"],[233.21,160.11,"static"],[183.21,160.56,"static"],[283.21,167.33,"static"],[278.03,164.81,"move"],[355.59,159.88,"static"],[404.54,169.43,"static"],[302.23,163.37,"static"]]};
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

test('rates by zone: base + .02 across the zone, x1.3 on finales and bosses, x.5 on breathers', () => {
  for (let z = 0; z < 4; z++){
    const a = S.ST_FIRST[z], b = a + S.ST_CNT[z] - 1, m = r => r.fin || r.boss ? 1.3 : r.rest ? .5 : 1;
    assert.ok(Math.abs(S.surRate(ROWS[a], a) - S.SUR.base[z] * m(ROWS[a])) < 1e-9, 'zone start ' + z);
    assert.ok(Math.abs(S.surRate(ROWS[b], b) - (S.SUR.base[z] + .02) * m(ROWS[b])) < 1e-9, 'zone end ' + z);
  }
  assert.ok(Math.abs(S.surRate(ROWS[19], 19) / ((S.SUR.base[1] + .02 * 9 / 14)) - 1.3) < 1e-9, 'stage 20: a boss without the finale numbers');
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
