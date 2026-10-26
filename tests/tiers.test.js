import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readIndex } from './helpers/hitloop.js';
import { loadI18N } from './helpers/i18n.js';

// Rarity tiers above ultra (5 celestial, 6 nebula, 7 void, 8 divine, 9 genesis): the pure rules in the tiers block, the tier tables
// they sit beside, and the server whitelist / score bound that must follow them.
const html = readIndex(), sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const m = html.match(/\/\* tiers:start[\s\S]*?\/\* tiers:end \*\//);
const T = m ? new Function(`${m[0]}\nreturn {TIER_OPEN, TIER_REQ, TIER_MUL, MASTERY, TIER_IDS, tierGate, scoreMul};`)() : {};
const NAMES = ['common', 'epic', 'legendary', 'mythic', 'ultra', 'celestial', 'nebula', 'void', 'divine', 'genesis'];
const grab = re => { const x = html.match(re); assert.ok(x, String(re)); return new Function(`return ${x[1]};`)(); };

test('ten rarity ranks: keys, colours, cast fx and aura budgets for each', () => {
  assert.ok(m, 'tiers block in index.html');
  assert.deepEqual(grab(/const RARITY_KEY = (\[[^\]]*\]);/), NAMES.map(n => 'r_' + n));
  const col = grab(/const RARITY_COL = (\[\[[\s\S]*?\]\]);/);
  assert.equal(col.length, 10); for (const c of col) assert.equal(c.length, 3);
  const fx = html.slice(html.indexOf('const TIER_FX = {'), html.indexOf('};', html.indexOf('const TIER_FX = {')));
  for (const n of NAMES) assert.match(fx, new RegExp(`\\b${n}:\\s*\\{`), `TIER_FX.${n}`);
  const budget = grab(/const AURA_BUDGET = Object\.freeze\((\{[^}]*\})\);/);
  for (let r = 2; r <= 9; r++) assert.ok(budget[r] > budget[r - 1], `aura budget grows at rank ${r}`);
  // a skill cast never outshines an ultimate: every rank's cast stays at or below ULT_FX
  const U = new Function(`return ${html.match(/const ULT_FX = (\{[^;]*\});/)[1]};`)();
  const F = new Function(`return ${fx.replace('const TIER_FX = ', '')}};`)();
  for (const n of NAMES) for (const k of ['parts', 'ban', 'z', 'shake', 'flash']) assert.ok(F[n][k] <= U[k], `TIER_FX.${n}.${k} ${F[n][k]} > ULT_FX ${U[k]}`);
  for (const n of NAMES.slice(5)) assert.ok(F[n].parts > F.ultra.parts, `${n} still above ultra`);
});

test('prices climb every rank in all three currencies', () => {
  const P = grab(/const PRICE = (\[[^;]*\]);/);
  assert.equal(P.length, 10);
  for (let r = 2; r <= 9; r++) for (const k of ['coin', 'dia', 'gem']) assert.ok(P[r][k] > P[r - 1][k], `${k} at rank ${r}`);
  assert.deepEqual(P[5], { coin: 200000, dia: 55000, gem: 150 });
  assert.deepEqual(P[9], { coin: 520000, dia: 140000, gem: 420 });
});

test('tier gates: a rank above ultra needs a unit of the rank below and its stage cleared', () => {
  const cleared = n => i => i < n;   // stages 1..n cleared
  assert.equal(T.tierGate(4, [], cleared(0)), null, 'ranks up to ultra have no gate');
  assert.deepEqual(T.tierGate(5, [0, 1], cleared(29)), { below: true, stage: true, n: 30, r: 4 });
  assert.deepEqual(T.tierGate(5, [4], cleared(29)), { below: false, stage: true, n: 30, r: 4 });
  assert.equal(T.tierGate(5, [4], cleared(30)), null);
  assert.deepEqual(T.tierGate(9, [7], cleared(50)), { below: true, stage: false, n: 50, r: 8 });
  assert.equal(T.tierGate(9, [8], cleared(50)), null);
  assert.deepEqual([5, 6, 7, 8, 9].map(r => T.TIER_REQ[r].stage), [30, 35, 40, 45, 50]);
});

test('score mastery: Perfect multiplier by rank, +5%p per evolution form, stage mode only', () => {
  assert.equal(T.scoreMul(4, 4, true), 1, 'ultra and below: no mastery');
  assert.equal(T.scoreMul(5, 0, true), 1.1); assert.equal(T.scoreMul(5, 4, true), 1.3);
  assert.equal(T.scoreMul(9, 0, true), 1.5); assert.equal(T.scoreMul(9, 4, true), 1.7);
  assert.equal(T.scoreMul(9, 99, true), 1.7, 'form is clamped to V');
  assert.equal(T.scoreMul(9, 4, false), 1, 'daily / versus: none');
  for (let r = 6; r <= 9; r++) assert.ok(T.scoreMul(r, 0, true) > T.scoreMul(r - 1, 0, true));
});

test('release: a unit above TIER_OPEN is hidden until its rank opens (boards, about page and shop already skip hidden units)', () => {
  const birds = html.slice(html.indexOf('const BIRDS = ['), html.indexOf('BIRDS.sort('));
  for (const row of birds.split('\n').filter(l => /^\s*\{ id:'/.test(l))){
    const r = +(row.match(/rarity:(\d+)/) || [0, 0])[1];
    if (r > T.TIER_OPEN) assert.match(row, /hidden:true/, row.slice(0, 40));
    else if (r >= 5) assert.doesNotMatch(row, /hidden:true/, `${row.slice(0, 40)}: its rank is open`);
  }
});

test('release: only ranks up to TIER_OPEN are on sale; the 20 planned ids are reserved', () => {
  assert.equal(T.TIER_OPEN, 5, 'celestial is open (release 1 of 5, 2027-01-01)');
  assert.equal(T.TIER_IDS.length, 20);
  for (const id of T.TIER_IDS) assert.match(id, /^[a-z]{1,12}$/);
  assert.equal(new Set(T.TIER_IDS).size, 20);
});

test('wiring: perks() carries the mastery multiplier into the Perfect score; the hangar gates the purchase', () => {
  const perks = html.slice(html.indexOf('function perks(){'), html.indexOf('const I18N_C = {'));
  assert.match(perks, /scoreMul: isOwned\(B\) \? scoreMul\(B\.rarity \|\| 0, evoOf\(B\), mode === 'endless'\) : 1/, 'owned units only: a trial flies x1');
  assert.match(html, /const pts = Math\.round\(\(1 \+ combo \+ PK\.bonus\)[^;]*\* PK\.scoreMul\);/);
  assert.match(html, /tierGate\(b\.rarity \|\| 0, ownedRanks\(\), i => !!stg\.clr\[i\]\)/);
});

test('server: every unit id (current and reserved) is on the whitelist; the bound covers the mastery multiplier', () => {
  const birds = html.slice(html.indexOf('const BIRDS = ['), html.indexOf('BIRDS.sort('));
  const ids = [...birds.matchAll(/^\s*\{ id:'([a-z]+)'/gm)].map(x => x[1]);
  assert.ok(ids.length >= 23, 'read the BIRDS table');
  const fn = sql.slice(sql.indexOf('create or replace function private.fw_units()'), sql.indexOf('$$;', sql.indexOf('create or replace function private.fw_units()')));
  for (const id of [...ids, ...T.TIER_IDS]) assert.match(fn, new RegExp(`'${id}'`), `${id} on fw_units()`);
  assert.match(sql, /else ceil\(\(3 \* p_gates::bigint \* p_gates \+ 75 \* p_gates\) \* private\.fw_bound_mul\(p_bird\)\)::bigint end;/, 'sum of 6(k+12) (PULSAR Resonance x3), times the rank\'s share');
  // the rank's share of the bound: ranks up to ultra x1; each rank above its form-V mastery plus room for form growth, and never less
  const bm = sql.slice(sql.indexOf('create or replace function private.fw_bound_mul('), sql.indexOf('$$;', sql.indexOf('create or replace function private.fw_bound_mul(')));
  assert.ok(bm.length > 50, 'private.fw_bound_mul exists');
  const groups = [...bm.matchAll(/array\[([^\]]*)\]\) then ([\d.]+)/g)].map(x => ({ ids: x[1].match(/'([a-z]+)'/g).map(s => s.slice(1, -1)), mul: +x[2] }));
  assert.equal(groups.length, 5);
  groups.forEach((g, i) => {
    assert.deepEqual(g.ids, T.TIER_IDS.slice(i*4, i*4 + 4), `rank ${i + 5} ids`);
    assert.ok(g.mul >= T.TIER_MUL[i + 5] + 4*T.MASTERY, `rank ${i + 5}: x${g.mul} covers form V mastery`);
    if (i) assert.ok(g.mul > groups[i - 1].mul, 'rises with the rank');
  });
  assert.match(bm, /else 1 end/);
  assert.match(sql, /daily'\s*then p_gates::bigint \* p_gates \+ 5 \* p_gates/, 'daily (fair mode) bound unchanged');
});

test('every language names the five new tiers and says what a locked tier needs', () => {
  const I = loadI18N();
  for (const [l, tb] of Object.entries(I)){
    for (const n of NAMES.slice(5)) assert.ok(tb['r_' + n] && tb['r_' + n].trim(), `${l} r_${n}`);
    assert.match(tb.tierNeed, /\{t\}/); assert.match(tb.tierNeed, /\{n\}/);
    assert.match(tb.scoreMulL, /\{m\}/);
  }
});
