import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18NParts } from './helpers/i18n.js';

// Rank 9 (genesis): AEON, COSMOS, INFINITY, OMEGA — complete, hidden until the rank is released, translated, wired, fair.
const html = readIndex();
const IDS = ['aeon', 'cosmos', 'infinity', 'omega'];
const birds = html.slice(html.indexOf('const BIRDS = ['), html.indexOf('BIRDS.sort('));
const row = id => (birds.match(new RegExp(`^\\s*\\{ id:'${id}'.*$`, 'm')) || [''])[0];
const block = (start, end) => { const a = html.indexOf(start); assert.ok(a >= 0, start); return html.slice(a, html.indexOf(end, a)); };
const tm = html.match(/\/\* tiers:start[\s\S]*?\/\* tiers:end \*\//);
const T = new Function(`${tm[0]}\nreturn {TIER_IDS};`)();

test('the four genesis units are the last reserved ids, rank 9, hidden until release', () => {
  assert.deepEqual(T.TIER_IDS.slice(16, 20), IDS);
  for (const id of IDS){ const r = row(id); assert.ok(r, id); assert.match(r, /rarity:9,/); assert.match(r, /hidden:true/); }
});

test('each has a skill, an ultimate, a body, unit fx (idle + the four ultimate hooks) and an aura', () => {
  const sk = block('const SK = {', '\n};'), us = block('function useSkill(', '\n}\n'), ult = block('const ULT = {', '};'), uu = block('function useUlt(', '\n}\n');
  const art = block('const UNIT_ART = {', '\n};'), fx = block('const UNIT_FX = {', '\n};'), au = block('const AURA = {', '\n};');
  for (const id of IDS){
    assert.match(sk, new RegExp(`\\b${id}:\\{cd:\\d+[^}]*f:\\{cd:18`), `SK.${id}`);
    assert.match(us, new RegExp(`case '${id}'`), `useSkill ${id}`);
    assert.match(ult, new RegExp(`\\b${id}:\\{(dur|n):`), `ULT.${id}`);
    assert.match(uu, new RegExp(`case '${id}'`), `useUlt ${id}`);
    assert.match(art, new RegExp(`\\n  ${id}\\(c, d, w, glow, o\\)\\{`), `UNIT_ART.${id}`);
    assert.ok(fx.includes(`\n  ${id}: {`), `UNIT_FX.${id}`);
    const f = fx.slice(fx.indexOf(`\n  ${id}: {`)), own = f.slice(0, f.indexOf('\n  },') + 4);
    for (const k of ['idle(', 'ultSky(', 'ultMarks(', 'ultCast(', 'ultSnd(']) assert.ok(own.includes(k), `UNIT_FX.${id}.${k}`);
    assert.match(au, new RegExp(`\\n  ${id}\\(c, d, R, k, lo\\)\\{`), `AURA.${id}`);
  }
});

test('every language has the six unit strings ({n} in skill and ultimate texts, multiples through {m})', () => {
  const P = loadI18NParts(), I = P.I18N;
  for (const [l, tb] of Object.entries(I)) for (const id of IDS){
    for (const k of ['r_', 'p_', 'sk_', 'sd_', 'ul_', 'ud_']) assert.ok(tb[k + id] && tb[k + id].trim(), `${l} ${k}${id}`);
    assert.match(tb['sd_' + id], /\{n\}/, `${l} sd_${id}`); assert.match(tb['ud_' + id], /\{n\}/, `${l} ud_${id}`);
    for (const k of ['sd_', 'ud_']) assert.doesNotMatch(tb[k + id], /×\d/, `${l} ${k}${id}: multiples come through {m}`);
  }
  for (const l of Object.keys(P.I18N_W)) for (const id of IDS) assert.ok(P.I18N_W[l]['ud_' + id], `world table ${l} has ud_${id} itself`);
});

test('the new passives are stage mode only and wired into the gate, orb and Perfect code', () => {
  const perks = html.slice(html.indexOf('function perks(){'), html.indexOf('const I18N_C = {'));
  for (const k of ['aeonRate', 'aeonMax', 'starEvery', 'starPts', 'infStep', 'infMax']) assert.match(perks, new RegExp(`${k}: d \\? 0 : \\(B\\.${k} \\|\\| 0\\)`), `${k} is 0 in fair modes`);
  assert.match(html, /\(PK\.aeonRate \? 1 \+ Math\.min\(PK\.aeonMax, FX\.runT \* PK\.aeonRate\) : 1\)/, 'AEON: time');
  assert.match(html, /\(PK\.infStep && tier === 2 \? 1 \+ Math\.min\(PK\.infMax, Math\.floor\(Math\.max\(0, combo - PK\.feverAt\)\/10\) \* PK\.infStep\) : 1\)/, 'INFINITY: fever climbs');
  assert.match(html, /if \(PK\.starEvery && gatesPassed % PK\.starEvery === 0\) starOrb\(\);/, 'COSMOS: a star appears');
  assert.match(html, /if \(o\.star\)\{ if \(\+\+FX\.stars >= 5\)\{ FX\.stars = 0; addScore\(PK\.starPts\);/, 'COSMOS: five stars make a constellation');
  assert.match(html, /arch:0, loops:0, loopsWas:-1, runT:0, stars:0,/, 'per-run state');
  assert.match(html, /if \(FX\.runT >= 0\) FX\.runT \+= dt;/, 'AEON\'s clock runs with play');
  for (const [id, k] of [['aeon', 'aeonRate:.005'], ['cosmos', 'starEvery:8'], ['infinity', 'infStep:.1'], ['omega', 'bonus:2']]) assert.match(row(id), new RegExp(k), id);
});

test('fair rows switch the stage-only parts off', () => {
  const sk = block('const SK = {', '\n};');
  for (const id of ['aeon', 'cosmos', 'infinity', 'omega']) assert.match(sk, new RegExp(`${id}:\\{[^}]*f:\\{[^}]*mul:1`), id);
  assert.match(sk, /cosmos:\{[^}]*stars:5[^}]*f:\{[^}]*stars:0/); assert.match(sk, /infinity:\{[^}]*keep:1[^}]*f:\{[^}]*keep:0/);
});

test('review: a star rides its gate, one per gate, never on a power-up, and waits for a gate when none is free', () => {
  const src = ['function starOk(', 'function starOrb(', 'function starMark('].map(k => { const a = html.indexOf(k); assert.ok(a >= 0, k); return html.slice(a, html.indexOf('\n', a)); }).join('\n');
  const run = new Function('gates', 'orbs', 'bird', 'FX', 'gY', `${src}\nreturn {starOk, starOrb, starMark};`);
  const gate = (x, o = {}) => ({x, w:60, gy:200, ...o}), gates = [gate(50), gate(300), gate(500, {scored:true}), gate(700), gate(900)], orbs = [{k:'shield', gate:gates[3]}];
  const FX = {starLeft:0}, S = run(gates, orbs, {x:100}, FX, g => g.gy);
  S.starMark(5, 60);
  assert.deepEqual(orbs.filter(o => o.star).map(o => gates.indexOf(o.gate)), [1, 4], 'free gaps ahead only: not behind, not scored, not on a power-up');
  assert.equal(FX.starLeft, 3, 'the rest wait for gates not spawned yet');
  S.starMark(5, 60); assert.equal(orbs.filter(o => o.star).length, 2, 'never two stars on one gate');
  assert.equal(FX.starLeft, 8);
  S.starMark(9, 60, false); assert.equal(FX.starLeft, 8, 'the ultimate does not carry');
  S.starOrb(); assert.equal(FX.starLeft, 9, 'the passive star waits too when no gap is free');
});

test('review: stars are not coins, AEON\'s clock restarts after a continue, every Galaxy gate gets a star', () => {
  assert.match(html, /if \(o\.k === 'orb'\)\{ if \(!o\.star\) orbsGot \+=/);
  assert.match(html, /if \(o\.k === 'orb' && !o\.star && PK\.orbShieldEvery/);
  assert.match(html, /contUsed = true; hitReset\(\); FX\.runT = 0;/);
  assert.match(html, /if \(B\.id === 'cosmos' && FX\.ultT > 0 && starOk\(g\)\) starOrb\(g\); else if \(FX\.starLeft > 0 && starOk\(g\)\)\{ FX\.starLeft--; starOrb\(g\); \}/);
  assert.match(html, /runT:0, stars:0, starLeft:0,/);
});
