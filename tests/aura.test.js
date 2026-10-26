import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// Per-unit auras: the block between the aura markers, run against a canvas stub that counts what gets drawn.
const html = readIndex();
const m = html.match(/\/\* aura:start[\s\S]*?\/\* aura:end \*\//);
const hsl = (c, a = 1, dl = 0) => `hsla(${c[0].toFixed(1)},${c[1].toFixed(1)}%,${Math.min(100, c[2] + dl).toFixed(1)}%,${a})`;   // the game's own hsl: a colour that is not a number array throws here too
const A = m ? new Function('hsl', `${m[0]}\nreturn {AURA, AURA_BUDGET};`)(hsl) : {};
const units = [...html.matchAll(/^\s*\{ id:'([a-z]+)'.*?rarity:(\d)/gm)].map(x => ({ id: x[1], rarity: +x[2] }));

function stub(){
  let depth = 0, draws = 0, maxDepth = 0;
  const grad = { addColorStop(){} };
  const c = new Proxy({}, { get(t, k){
    if (k in t) return t[k];
    if (k === 'save') return () => { depth++; maxDepth = Math.max(maxDepth, depth); };
    if (k === 'restore') return () => { depth--; assert.ok(depth >= 0, 'restore without save'); };
    if (['fill', 'stroke', 'fillRect', 'strokeRect'].includes(k)) return () => { draws++; };
    if (k === 'arc') return (x, y, r) => assert.ok(r >= 0 && Number.isFinite(r), `arc radius ${r}`);   // a real canvas throws IndexSizeError
    if (k === 'ellipse') return (x, y, rx, ry) => assert.ok(rx >= 0 && ry >= 0 && Number.isFinite(rx + ry), `ellipse radii ${rx}, ${ry}`);
    if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => grad;
    return () => {};
  }, set(t, k, v){ t[k] = v; return true; } });
  return { c, get draws(){ return draws; }, get depth(){ return depth; } };
}

test('the aura block exists and the roster has 19 premium units', () => {
  assert.ok(m, 'aura block in index.html');
  assert.equal(units.length, 19);
  assert.deepEqual(units.reduce((n, u) => (n[u.rarity - 1]++, n), [0, 0, 0, 0]), [4, 6, 4, 5]);
});

test('every epic, legendary, mythic and ultra unit has an aura of its own', () => {
  for (const u of units) assert.equal(typeof A.AURA[u.id], 'function', `${u.id} has an aura`);
  assert.equal(new Set(units.map(u => A.AURA[u.id])).size, units.length, 'no two units share one');
  assert.deepEqual(Object.keys(A.AURA).filter(id => !units.some(u => u.id === id)), [], 'no aura for a unit that is not premium');
});

test('auras draw within their tier budget, at any time, with reduced motion and on low fx quality', () => {
  for (const u of units) for (const k of [0, 0.37, 1.9, 7.25, 63.1]) for (const lo of [false, true]){
    const s = stub(), R = 13;
    s.c.globalAlpha = .55;   // the hangar dims a unit that is not owned before it draws the aura
    A.AURA[u.id](s.c, { id: u.id, rarity: u.rarity, col: [200, 100, 60] }, R, k, lo);
    assert.equal(s.depth, 0, `${u.id}: save/restore balanced`);
    assert.equal(s.c.globalAlpha, .55, `${u.id}: leaves the caller's globalAlpha as it was`);
    assert.ok(s.draws > 0, `${u.id} draws something at k=${k}`);
    assert.ok(s.draws <= A.AURA_BUDGET[u.rarity], `${u.id} at k=${k}${lo ? ' (low)' : ''}: ${s.draws} draws > ${A.AURA_BUDGET[u.rarity]}`);
  }
});

test('a tier keeps its rank: budgets grow epic < legendary < mythic < ultra', () => {
  const b = A.AURA_BUDGET;
  assert.ok(b[1] < b[2] && b[2] < b[3] && b[3] < b[4], JSON.stringify(b));
});

test('wiring: drawAura draws the unit\'s own aura and keeps the tier motif only as a fallback', () => {
  const fn = html.slice(html.indexOf('function drawAura('), html.indexOf('\n}', html.indexOf('function drawAura(')));
  assert.match(fn, /const au = AURA\[d\.id\]/);
  assert.match(fn, /if \(au\) au\(c, d, R, RM \? 0 : tt, !!\(IMP && IMP\.q === 'low'\)\)/);
});
