import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// The stage redesign (owner's decision 2026-10-27): one frozen STAGES table of 50 rows built from band rows, one new element per stage,
// breathers and a boss at each zone end, themed zones with one signature obstacle each, a seeded course up to the goal.
const html = readIndex();
const m = html.match(/\/\* stages:start[\s\S]*?\/\* stages:end \*\//);
const S = m ? new Function(`${m[0]}\nreturn {ST_N, ST_FIRST, ST_CNT, ST_BAND, ST_PLAN, ST_SIG, STAGES, stElems, stDGoal, stGapGoal, PAT, PAT_EVERY, TWIN, SIG, branchK, geyserAt, bladeAt, stLay};`)() : {};
const R = new Function(`${html.match(/function hashStr\(s\)\{[^\n]+/)[0]}\n${html.match(/function mulberry32\(a\)\{[^\n]+/)[0]}\nreturn {hashStr, mulberry32};`)();
const ROWS = S.STAGES || [];
const reg = ROWS.map((r, i) => i).filter(i => !ROWS[i].rest);   // every stage but the breathers

test('a pure stages block holds one frozen table of 50 rows with the agreed fields', () => {
  assert.ok(m, 'stages block');
  assert.equal(ROWS.length, 50);
  assert.deepEqual([S.ST_N, S.ST_FIRST, S.ST_CNT], [50, [0, 10, 25, 40], [10, 15, 15, 10]]);
  assert.ok(Object.isFrozen(S.STAGES) && ROWS.every(Object.isFrozen) && Object.isFrozen(S.ST_BAND) && Object.isFrozen(S.SIG));
  const keys = ['d0', 'gm', 'goal', 'mv', 'pu', 'haz', 'hp', 'fogN', 'fogDur', 'stall', 'pat', 'sig', 'boss'];
  for (const r of ROWS) for (const k of keys) assert.ok(k in r, k);
  assert.equal(S.ST_PLAN.flat().length, 50, 'one plan entry per stage');
});

test('every stage adds at most one new element to the last stage that is not a breather', () => {
  let prev = new Set();
  for (const i of reg){
    const now = S.stElems(ROWS[i]), add = now.filter(e => !prev.has(e));
    assert.ok(add.length <= 1, `stage ${i + 1} adds ${add.join(', ')}`);
    prev = new Set(now);
  }
  for (let i = 1; i < 50; i++) if (ROWS[i].rest) assert.deepEqual(S.stElems(ROWS[i]), S.stElems(ROWS[i - 1]), `breather ${i + 1} brings nothing new`);
});

test('the introduction order the owner approved', () => {
  const first = e => ROWS.findIndex(r => S.stElems(r).includes(e)) + 1;
  assert.deepEqual(['swing', 'drop', 'move', 'pulse', 'stairs', 'branch'].map(first), [2, 3, 4, 6, 7, 8]);
  assert.deepEqual(['weight', 'over', 'drain', 'smoke', 'twin', 'gust'].map(first), [11, 13, 15, 17, 18, 20]);
  assert.deepEqual(['fog05', 'zigzag', 'geyser', 'fog1'].map(first), [26, 28, 30, 33]);
  assert.deepEqual(['stall', 'fog2', 'blade'].map(first), [41, 42, 44]);
  assert.deepEqual(S.stElems(ROWS[0]), ['static'], 'stage 1: static gates only');
  assert.deepEqual(ROWS.map(r => r.sig), ROWS.map((r, i) => [null, 'branch', 'gust', 'geyser', 'blade'][i >= 7 && i < 10 ? 1 : i >= 19 && i < 25 ? 2 : i >= 29 && i < 40 ? 3 : i >= 43 ? 4 : 0]), 'each zone has its own obstacle');
  assert.ok(S.stElems(ROWS[40]).every(e => !/^fog/.test(e) && e !== 'twin'), 'stage 41: the stall rule alone, no fog yet');
  assert.ok(S.stElems(ROWS[45]).includes('twin') && S.stElems(ROWS[45]).includes('fog2'), 'stage 46: twin gates in fog');
  assert.deepEqual(['fog05', 'fog1', 'fog2'].map(f => ROWS.filter(r => S.stElems(r).filter(e => /^fog/.test(e)).length > 1).length), [0, 0, 0], 'one fog at a time');
});

test('bosses close each zone, breathers sit inside them', () => {
  assert.deepEqual(ROWS.map((r, i) => r.boss ? i + 1 : 0).filter(Boolean), [10, 25, 40, 50]);
  const rests = ROWS.map((r, i) => r.rest ? i + 1 : 0).filter(Boolean);
  assert.ok(rests.length >= 8, 'a breather every few stages');
  for (const z of [0, 1, 2, 3]) assert.ok(rests.some(s => s - 1 >= S.ST_FIRST[z] && s - 1 < S.ST_FIRST[z] + S.ST_CNT[z]), 'zone ' + z);
});

test('goals: 10 + round(0.62 i), breathers -2, bosses +4, stage 50 about 45', () => {
  ROWS.forEach((r, i) => assert.equal(r.goal, 10 + Math.round(.62 * i) + (r.rest ? -2 : 0) + (r.boss ? 4 : 0), 'stage ' + (i + 1)));
  assert.equal(ROWS[0].goal, 10);
  assert.ok(ROWS[49].goal >= 43 && ROWS[49].goal <= 46);
  assert.ok(ROWS.every(r => r.goal >= 10 && r.goal <= 46 && Number.isInteger(r.goal)));
  for (let k = 1; k < reg.length; k++) if (!ROWS[reg[k]].boss && !ROWS[reg[k - 1]].boss) assert.ok(ROWS[reg[k]].goal >= ROWS[reg[k - 1]].goal);
});

test('difficulty at the goal climbs from about .05 to .70 and only breathers and bosses break the climb', () => {
  const D = ROWS.map(S.stDGoal), G = ROWS.map(S.stGapGoal);
  assert.ok(D[0] > .03 && D[0] < .1, 'stage 1 ' + D[0]);
  assert.ok(D[49] > .65 && D[49] < .75, 'stage 50 ' + D[49]);
  const plain = ROWS.map((r, i) => i).filter(i => !ROWS[i].rest && !ROWS[i].boss);
  for (let k = 1; k < plain.length; k++){
    const a = plain[k - 1], b = plain[k];
    assert.ok(D[b] >= D[a], `difficulty ${a + 1} → ${b + 1}`);
    assert.ok(G[b] <= G[a], `gap ${a + 1} → ${b + 1}`);
  }
  for (const i of ROWS.map((r, i) => i).filter(i => ROWS[i].boss)) assert.ok(D[i] > D[i - 1] && D[i] > D[i - 2], 'a boss is the peak of its stretch: ' + (i + 1));
  for (const i of ROWS.map((r, i) => i).filter(i => ROWS[i].rest)) assert.ok(D[i] < D[i - 1], 'a breather eases off: ' + (i + 1));
});

test('gaps never under 128 px at the goal; zone 2 narrows about 3 px a stage instead of one cut', () => {
  ROWS.forEach((r, i) => assert.ok(S.stGapGoal(r) >= 128, `stage ${i + 1}: ${S.stGapGoal(r)}`));
  const g0 = r => (212 - r.d0 * 62) * r.gm, z2 = [10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 23];   // zone 2 without its breathers and boss
  for (let k = 1; k < z2.length; k++){ const step = g0(ROWS[z2[k - 1]]) - g0(ROWS[z2[k]]); assert.ok(step >= 1 && step <= 7, `stage ${z2[k] + 1}: ${step}`); }
  assert.ok(g0(ROWS[9]) - g0(ROWS[10]) < 12, 'no big cut entering zone 2');
});

test('hazards: one kind at a time from stage 11, never in zone 1; fog and the stall rule by the table', () => {
  ROWS.slice(0, 10).forEach(r => assert.deepEqual([r.haz.length, r.hp, r.fogN, r.stall], [0, 0, 0, false]));
  assert.deepEqual(ROWS[10].haz, ['weight']);
  assert.deepEqual(ROWS[16].haz.slice().sort(), ['drain', 'over', 'smoke', 'weight']);
  ROWS.slice(10).forEach(r => assert.ok(r.hp > 0 && r.hp <= .16));
  ROWS.forEach((r, i) => assert.equal(r.stall, i >= 40));
  ROWS.forEach(r => assert.equal(!!r.fogN, !!r.fogDur));
  assert.deepEqual([...new Set(ROWS.map(r => r.fogDur))].sort(), [0, .5, 1, 2]);
});

const dAt = (row, k) => { const cap = Math.min(1, row.d0 + .35); return k <= 45 ? row.d0 + (k / 45) * (cap - row.d0) : Math.min(1, cap + (k - 45) * .008); };
function course(i, n, seed = 'stage:' + i + ':v2'){
  const row = ROWS[i], rng = R.mulberry32(R.hashStr(seed)), srng = R.mulberry32(R.hashStr(seed + ':x')), out = [];
  let prev = null;
  for (let k = 0; k < n; k++){ const g = S.stLay(row, k, dAt(row, Math.max(k - 2, 0)), prev, 584, rng, srng, {gap: 0, pull: 1}); rng(); rng(); rng(); out.push(g); prev = g; }   // spawnGate takes three more course rolls per gate (coin row, power-up)
  return out;
}

test('the course of a stage is the same every run up to its goal, and stages differ', () => {
  for (const i of [0, 9, 24, 39, 49]){
    const a = course(i, ROWS[i].goal), b = course(i, ROWS[i].goal);
    assert.deepEqual(a, b, 'stage ' + (i + 1));
  }
  assert.notDeepEqual(course(3, 12).map(g => g.base), course(4, 12).map(g => g.base));
});

test('course rules: gaps stay on screen, patterns and twins follow the table, signature obstacles only where the stage has one', () => {
  for (let i = 0; i < 50; i++){
    const row = ROWS[i], C = course(i, 60);
    for (const g of C){
      assert.ok(g.base - g.gap / 2 - g.amp >= 60 && g.base + g.gap / 2 + g.amp <= 584 - 60, 'on screen ' + (i + 1));
      assert.ok(g.gap >= 100);
      if (g.sg) assert.equal(g.sg.k, row.sig);
      if (g.haz) assert.ok(row.haz.includes(g.haz.k));
      if (g.twin) assert.ok(row.tw > 0);
    }
    if (!row.sig) assert.ok(C.every(g => !g.sg));
    if (row.sig) assert.ok(C.some(g => g.sg), 'stage ' + (i + 1) + ' shows its obstacle');
    if (!row.pat.length) assert.ok(C.every(g => !g.pat));
  }
  const C = course(2, 30), ep = C.filter(g => g.pat === 'drop');
  assert.ok(ep.length >= 2, 'the drop pattern shows up on stage 3');
  for (const g of course(17, 60).filter((g, k, a) => k && a[k - 1].twin)) assert.equal(g.type, 'static', 'the second gate of a twin stands still');
});

test('patterns: authored offsets from the gate before', () => {
  assert.deepEqual(Object.keys(S.PAT).sort(), ['drop', 'stairs', 'zigzag']);
  const C = course(27, 40);   // stage 28: zigzag in
  for (let k = 1; k < C.length; k++){
    const g = C[k];
    if (!g.pat || g.pj === undefined) continue;
    const off = S.PAT[g.pat][g.pj], want = Math.max(70 + g.amp + g.gap / 2, Math.min(584 - 70 - g.amp - g.gap / 2, C[k - 1].base + g.pd * off));
    assert.ok(Math.abs(g.base - want) < 1e-6, `gate ${k}`);
  }
  assert.equal(S.TWIN, .6);
});

test('falling branch: telegraphed, drops at 1.5 gate spacings, never closes the gap, retracts after the bird passed', () => {
  const B = S.SIG.branch;
  assert.equal(B.drop, 1.5);
  assert.deepEqual(S.branchK(3), {k: 0, sh: 0});
  assert.ok(S.branchK(2).sh > 0 && S.branchK(2).k === 0, 'it shakes before it drops');
  assert.equal(S.branchK(1).k, 1);
  assert.equal(S.branchK(0).k, 1, 'down while the bird goes through');
  assert.equal(S.branchK(-1).k, 0, 'back up after');
  const fastest = (190 + 120 * 1.5) * 1.0, minSpacing = 250 - 30;   // VOLT at full stage-50 speed, the tightest spacing
  assert.ok(B.drop * minSpacing / fastest >= .8, 'the drop shows at least .8 s before the bird reaches the gate');
  for (const g of course(8, 60).filter(g => g.sg)) assert.ok(g.gap - g.sg.drop >= B.keep && g.sg.drop >= B.min);
});

test('fire geyser: at least .8 s of bubbling before each eruption, lethal only while erupting, below the middle line', () => {
  const G = S.SIG.geyser;
  assert.ok(G.warn >= .8);
  let seenWarn = 0, last = 'idle';
  for (let t = 0; t < G.per * 3; t += .01){
    const s = S.geyserAt(t, .3);
    if (s.s === 'warn') seenWarn += .01;
    if (s.s === 'erupt' && last !== 'erupt'){ assert.ok(seenWarn >= .8 - 1e-9, 'warned first'); seenWarn = 0; }
    last = s.s;
  }
  for (const i of [29, 33, 39]) for (const [k, g] of course(i, 60).entries()) if (g.sg){
    const C = course(i, 60), p = C[k - 1], lo = Math.max(p.base + p.amp + p.gap / 2, g.base + g.amp + g.gap / 2), mid = (p.base + g.base) / 2;
    assert.ok(g.sg.top >= mid + 13 + Math.min(p.gap, g.gap) * .1, 'the line between the gap centres stays open');
    assert.ok(g.sg.top < lo + 1, 'it rises into the lower gap edge');
  }
});

test('pendulum blade: a fixed period, a safe window every swing, never cuts the middle line', () => {
  const B = S.SIG.blade, hr = 13 * .82;
  const hits = (ph, y, v) => { for (let t = 0; t < 1.6; t += .004){ const x = -200 + v * t, b = S.bladeAt(t, ph); if (Math.hypot(x - b.x, y - (b.y - B.len)) < B.r + hr) return true; } return false; };
  for (const v of [220, 300, 370]){   // a bird flying level through the blade's lowest point (pivot 0,-len)
    const N = 200, safe = Array.from({length: N}, (_, k) => !hits(k / N, 0, v));
    assert.ok(safe.filter(Boolean).length / N >= .4, 'safe for most of the swing at ' + v);
    let run = 0, best = 0; for (let k = 0; k < 2 * N; k++){ run = safe[k % N] ? run + 1 : 0; best = Math.max(best, Math.min(run, N)); }
    assert.ok(best / N >= .2, 'one unbroken window of at least a fifth of every swing at ' + v);
  }
  for (const i of [43, 45, 49]){ const C = course(i, 60); for (const [k, g] of C.entries()) if (g.sg){ const p = C[k - 1], mid = (p.base + g.base) / 2; assert.ok(g.sg.low + B.r <= mid - 13 - Math.min(p.gap, g.gap) * .1, 'the line between the gap centres stays open'); } }
});

test('wind gust: weaker than any gravity, drawn with its direction', () => {
  assert.ok(S.SIG.gust.acc > 0 && S.SIG.gust.acc < 980);
  for (const g of course(23, 60).filter(g => g.sg)) assert.ok(g.sg.dir === 1 || g.sg.dir === -1);
});

test('wind gust: an up-gust never sits before a gate far below the one before (light units could not get down in time)', () => {
  assert.ok(S.SIG.gust.fall > 0 && S.SIG.gust.fall <= 60);
  let ups = 0;
  for (let i = 19; i < 25; i++) for (const seed of ['stage:' + i + ':v2', 'any:' + i]){
    const C = course(i, 60, seed);
    for (const [k, g] of C.entries()) if (g.sg && g.sg.k === 'gust' && g.sg.dir < 0){ ups++; assert.ok(g.base - C[k - 1].base <= S.SIG.gust.fall, `stage ${i + 1} gate ${k + 1} (${seed})`); }
  }
  assert.ok(ups >= 10, 'up-gusts still show up');
});

test('no signature obstacle ever scores, and a hit takes the gate-hit path', () => {
  const tick = html.slice(html.indexOf('function sigTick('), html.indexOf('\n}\n', html.indexOf('function sigTick(')));
  const hit = html.slice(html.indexOf('function sigHit('), html.indexOf('\n}\n', html.indexOf('function sigHit(')));
  assert.ok(tick.length > 50 && hit.length > 30);
  assert.doesNotMatch(tick + hit, /addScore|score \+=|gatesPassed/);
  assert.match(hit, /cloneHit\(\)/);
  assert.match(hit, /breakShield\(/);
  assert.match(hit, /die\(why\)/);
  assert.match(html, /die\(bird\.y - hr < top \? \(g\.brK > 0 \? 'branch' : 'top'\) : 'bot'\)/, 'a branch hit is a gate hit, told apart for the hint');
});

test('boss stages pay x1.5 first-clear diamonds', () => {
  assert.match(html, /const diaClear = i => Math\.round\(DIA_CLEAR\[stTier\(i\)\] \* \(STAGES\[i\]\.boss \? 1\.5 : 1\)\);/);
});

test('each hazard kind has its own colour', () => {
  const c = html.match(/HAZ_COL = Object\.freeze\(\{([^}]+)\}\)/);
  assert.ok(c);
  const cols = [...c[1].matchAll(/(\w+):\s*\[(\d+),/g)].map(x => [x[1], +x[2]]);
  assert.deepEqual(cols.map(x => x[0]).sort(), ['drain', 'over', 'smoke', 'weight']);
  assert.equal(new Set(cols.map(x => x[1])).size, 4, 'four hues');
});

test('themed zones: forest, valley, lava, palace', () => {
  const Z = new Function(html.match(/const ZONES = \[[\s\S]*?\];/)[0] + ' return ZONES;')();
  assert.deepEqual(Z.map(z => z.name), ['NEON GROVE', 'CANYON RUN', 'MAGMA CORE', 'SKY PALACE']);
  for (const f of ['bgGrove', 'bgCanyon', 'bgMagma', 'bgPalace']) assert.match(html, new RegExp(`function ${f}\\(\\)`));
  assert.doesNotMatch(html, /function bg(Tide|Solar|Void)\(/);
});
