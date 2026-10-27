import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadEvo } from './helpers/evo.js';

const E = loadEvo(), html = readIndex();
const range = n => Array.from({ length: n }, (_, i) => i);

test('EVO_STN follows ST_N', () => {
  assert.equal(E.EVO_STN, Number(html.match(/const ST_N = (\d+)/)[1]));
});

test('five forms at 0 / 3 / 10 / 20 / 35 distinct clears', () => {
  assert.deepEqual([...E.EVO_AT], [0, 3, 10, 20, 35]);
  assert.deepEqual([0, 2, 3, 9, 10, 19, 20, 34, 35, 50].map(E.evoForm), [0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  assert.deepEqual([0, 2, 3, 9, 20, 34, 35, 50].map(E.evoToNext), [3, 1, 7, 1, 15, 1, 0, 0]);
  assert.deepEqual([...E.EVO_ROMAN], ['I', 'II', 'III', 'IV', 'V']);
});

test('bonuses grow a little each form; form V is the agreed cap', () => {
  const b = E.EVO_BUFF;
  assert.deepEqual({ ...b[0] }, { hit: 1, grav: 1, win: 0, shield: 0 });
  assert.deepEqual({ ...b[4] }, { hit: 0.88, grav: 0.95, win: 4, shield: 1 });
  for (let f = 1; f < b.length; f++){
    assert.ok(b[f].hit < b[f - 1].hit && b[f].grav <= b[f - 1].grav && b[f].win > b[f - 1].win && b[f].shield >= b[f - 1].shield, `form ${f} is a step up`);
  }
  assert.throws(() => { b[4].hit = 0.5; }, TypeError);   // frozen: a run cannot edit the table
});

test('evoBuff: stage mode only — daily / versus always get form I numbers', () => {
  assert.equal(E.evoBuff(4, true), E.EVO_BUFF[4]);
  assert.equal(E.evoBuff(4, false), E.EVO_BUFF[0]);
  assert.equal(E.evoBuff(2, true), E.EVO_BUFF[2]);
  assert.equal(E.evoBuff(99, true), E.EVO_BUFF[4]);
  assert.equal(E.evoBuff(-3, true), E.EVO_BUFF[0]);
});

test('evoNorm: untrusted input becomes {unit: sorted unique stage indices}', () => {
  for (const raw of [null, 7, 'x', [], undefined]) assert.deepEqual(E.evoNorm(raw), {});
  const n = E.evoNorm({ volt: [4, 1, 4, 'x', -1, 50, 2.5, 49], BAD: [1], constructor: [1], zero: [], titan: 'nope', __proto__: { pixel: [1] } });
  assert.deepEqual(n, { volt: [1, 4, 49] });
  assert.equal(Object.getPrototypeOf(E.evoNorm({ volt: [1] })) === Object.prototype, true);
});

test('evoClear: a new stage counts once per unit, and says when a form is reached', () => {
  let e = {};
  const r1 = E.evoClear(e, 'volt', 0);
  assert.deepEqual(r1.evo, { volt: [0] }); assert.equal(r1.up, false); assert.deepEqual(e, {}, 'no mutation');
  e = r1.evo;
  const again = E.evoClear(e, 'volt', 0);
  assert.equal(again.evo, e); assert.equal(again.up, false);                     // replaying a stage does not count twice
  e = E.evoClear(e, 'volt', 1).evo;
  const r3 = E.evoClear(e, 'volt', 7);
  assert.equal(r3.up, true); assert.equal(r3.form, 1); assert.equal(E.evoCount(r3.evo, 'volt'), 3);
  assert.equal(E.evoCount(r3.evo, 'zero'), 0);                                 // every unit grows on its own
  assert.equal(E.evoClear(r3.evo, 'zero', 0).up, false);
  for (const bad of [[r3.evo, 'volt', 50], [r3.evo, 'volt', -1], [r3.evo, 'volt', 1.5], [r3.evo, 'BAD', 3]]) assert.equal(E.evoClear(...bad).evo, r3.evo);
});

test('a unit flown through every stage ends at form V', () => {
  const e = range(50).reduce((acc, i) => E.evoClear(acc, 'kraken', i).evo, {});
  assert.equal(E.evoForm(E.evoCount(e, 'kraken')), 4);
  const seen = []; let cur = {};
  for (const i of range(50)){ const r = E.evoClear(cur, 'kraken', i); if (r.up) seen.push([i + 1, r.form]); cur = r.evo; }
  assert.deepEqual(seen, [[3, 1], [10, 2], [20, 3], [35, 4]]);
});

test('evoMerge: union per unit, never loses a clear', () => {
  const a = { volt: [0, 1, 2], zero: [5] }, b = { volt: [2, 9], pixel: [3] };
  assert.deepEqual(E.evoMerge(a, b), { pixel: [3], volt: [0, 1, 2, 9], zero: [5] });
  assert.deepEqual(E.evoMerge({}, {}), {});
  assert.deepEqual(a, { volt: [0, 1, 2], zero: [5] }, 'no mutation');
});

test('wiring: the game reads evolution in perks(), the clear, the hitbox and the draw', () => {
  const perks = html.slice(html.indexOf('function perks(){'), html.indexOf('const I18N_C = {'));
  assert.match(perks, /evoBuff\(isOwned\(B\) \? evoOf\(B\) : 0, mode === 'endless'\)/, 'perks() takes the form only in stage mode, and only for an owned unit (a trial flies form I)');
  assert.match(perks, /shieldMax: d \? 1 : \(B\.shieldMax \|\| 1\),/, 'form V adds a starting shield only: the cap stays the unit\'s own');
  assert.match(perks, /evoHit:/); assert.match(perks, /evoGrav:/);
  assert.match(html, /bird\.r = B\.r \* PK\.evoHit/, 'hitbox shrinks with the form');
  assert.match(html, /B\.grav \* PK\.evoGrav/, 'gravity eases with the form');
  assert.match(html, /evoClear\(evo, B\.id, curStage\)/, 'a stage clear counts for the unit that flew it');
  assert.match(html, /store\.set\('fw27_evo', evo\)/);
  assert.ok((html.match(/drawEvo\(/g) || []).length >= 5, 'run and hangar draw the evolved look (back + front)');
});

test('a stage clear still celebrates: the evo hook comments out none of the fanfare, the diamond banner or the ads event', () => {
  const at = html.indexOf("banner(t('stClear'"), block = html.slice(at, html.indexOf('\n      }', at));
  for (const code of ["banner(t('diaP'", 'SFX.fanfare()', "haptic('newBest')", 'confetti(', "ADS.ev('happy')", 'evoClear(evo, B.id, curStage)']){
    const line = block.split('\n').find(l => l.includes(code));
    assert.ok(line, `${code} is in the clear block`);
    assert.ok(!line.slice(0, line.indexOf(code)).includes('//'), `${code} sits behind a // comment`);
  }
});
