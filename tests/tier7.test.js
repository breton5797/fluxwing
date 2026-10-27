import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18NParts } from './helpers/i18n.js';

// Rank 7 (void): SINGULAR, RIFT, NYX, ENTROPY — complete, hidden until the rank is released, translated, wired, fair.
const html = readIndex();
const IDS = ['singular', 'rift', 'nyx', 'entropy'];
const birds = html.slice(html.indexOf('const BIRDS = ['), html.indexOf('BIRDS.sort('));
const row = id => (birds.match(new RegExp(`^\\s*\\{ id:'${id}'.*$`, 'm')) || [''])[0];
const block = (start, end) => { const a = html.indexOf(start); assert.ok(a >= 0, start); return html.slice(a, html.indexOf(end, a)); };
const tm = html.match(/\/\* tiers:start[\s\S]*?\/\* tiers:end \*\//);
const T = new Function(`${tm[0]}\nreturn {TIER_IDS};`)();

test('the four void units are reserved ids 9-12, rank 7, hidden until release', () => {
  assert.deepEqual(T.TIER_IDS.slice(8, 12), IDS);
  for (const id of IDS){ const r = row(id); assert.ok(r, id); assert.match(r, /rarity:7,/); assert.match(r, /hidden:true/); }
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

test('the new passives are stage mode only and wired into the gap, orb, fog and Perfect code', () => {
  const perks = html.slice(html.indexOf('function perks(){'), html.indexOf('const I18N_C = {'));
  for (const k of ['gapAdd', 'orbPts', 'nyxFog', 'entropy']) assert.match(perks, new RegExp(`${k}: d \\? 0 : \\(B\\.${k} \\|\\| 0\\)`), `${k} is 0 in fair modes`);
  assert.match(html, /const gGap = g => [^\n]*\+ \(PK\.gapAdd \? g\.gap\*PK\.gapAdd : 0\) \+ \(FX\.holeT > 0 \? g\.gap\*FX\.holeGap : 0\)( - \(g\.brK \? g\.sg\.drop \* g\.brK : 0\))?;/, 'SINGULAR widens gaps (a dropped NEON GROVE branch narrows them after)');
  assert.match(html, /if \(PK\.orbPts\) addScore\(PK\.orbPts\);/, 'SINGULAR: orbs score');
  assert.match(html, /\(PK\.nyxFog && FX\.fogT > 0 \? PK\.nyxFog : 1\)/, 'NYX: fog Perfects');
  assert.match(html, /const entRoll = \(\) =>/); assert.match(html, /\* entRoll\(\)/, 'ENTROPY: the roll is part of a Perfect');
  assert.match(html, /holeT:0, holeGap:0, entT:0, entAdd:0, entLast:1,/, 'per-run state');
  assert.match(html, /if \(u\.sure\) for \(const g of gates\)/, 'an ultimate row with sure:1 marks gates (LUMEN, SINGULAR, NYX, ENTROPY)');
  for (const id of ['lumen', 'singular', 'nyx', 'entropy']) assert.match(block('const ULT = {', '};'), new RegExp(`\\b${id}:\\{[^}]*sure:1`), id);
  for (const [id, k] of [['singular', 'gapAdd:.06'], ['rift', 'phaseEvery:15'], ['nyx', 'nyxFog:2'], ['entropy', 'entropy:1']]) assert.match(row(id), new RegExp(k), id);
});

test('review: NYX\'s fog and ENTROPY\'s chaos stop the skill recharging from Perfects (as Resonance does), so neither runs most of the time', () => {
  assert.match(html, /skillCharge = Math\.min\(1, skillCharge \+ \(FX\.resoT > 0 \|\| sure \|\| \(PK\.nyxFog && FX\.fogT > 0\) \|\| \(PK\.entropy && FX\.entT > 0\) \? 0 : PK\.perfCharge\)\)/);
  const sk = block('const SK = {', '\n};'), us = block('function useSkill(', '\n}\n');
  assert.match(sk, /nyx:\{cd:1[3-9]/, 'NYX skill cooldown lengthened'); assert.match(sk, /entropy:\{cd:1[3-9]/, 'ENTROPY skill cooldown lengthened');
  assert.match(us.slice(us.indexOf("case 'nyx'")), /boostT = TMAX\.boost = skv\('dur'\)/, 'NYX: a wider window, also in fair modes');
  assert.doesNotMatch(html, /\[\[-1, \(a, b\) => a\], \[1, \(a, b\) => b\]\]/, 'no dead lambdas in RIFT\'s body');
});

test('fair rows switch the stage-only parts off', () => {
  const sk = block('const SK = {', '\n};');
  assert.match(sk, /singular:\{[^}]*f:\{[^}]*gap:0[^}]*mul:1/);
  assert.match(sk, /rift:\{[^}]*perf:1[^}]*f:\{[^}]*perf:0[^}]*mul:1/);
  assert.match(sk, /entropy:\{[^}]*f:\{[^}]*ent:0/);
});
