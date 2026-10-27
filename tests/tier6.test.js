import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18NParts } from './helpers/i18n.js';

// Rank 6 (nebula): QUASAR, COMET, ZODIAC, ECLIPSE — complete, hidden until the rank is released, translated, wired, fair.
const html = readIndex();
const IDS = ['quasar', 'comet', 'zodiac', 'eclipse'];
const birds = html.slice(html.indexOf('const BIRDS = ['), html.indexOf('BIRDS.sort('));
const row = id => (birds.match(new RegExp(`^\\s*\\{ id:'${id}'.*$`, 'm')) || [''])[0];
const block = (start, end) => { const a = html.indexOf(start); assert.ok(a >= 0, start); return html.slice(a, html.indexOf(end, a)); };
const tm = html.match(/\/\* tiers:start[\s\S]*?\/\* tiers:end \*\//);
const T = new Function(`${tm[0]}\nreturn {TIER_IDS};`)();

test('the four nebula units are reserved ids 5-8, rank 6, hidden until release', () => {
  assert.deepEqual(T.TIER_IDS.slice(4, 8), IDS);
  for (const id of IDS){ const r = row(id); assert.ok(r, id); assert.match(r, /rarity:6,/); assert.match(r, /hidden:true/); }
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

test('the new passives are stage mode only and wired into the gate and Perfect handlers', () => {
  const perks = html.slice(html.indexOf('function perks(){'), html.indexOf('const I18N_C = {'));
  for (const k of ['beamEvery', 'beamN', 'cometStep', 'cometMax', 'zodEvery', 'eclEvery', 'eclDark']) assert.match(perks, new RegExp(`${k}: d \\? 0 : \\(B\\.${k} \\|\\| 0\\)`), `${k} is 0 in fair modes`);
  assert.match(html, /if \(PK\.beamEvery && gatesPassed % PK\.beamEvery === 0\)/);
  assert.match(html, /if \(PK\.eclEvery && gatesPassed % PK\.eclEvery === 0\)/);
  assert.match(html, /if \(PK\.zodEvery && \+\+FX\.zodP >= PK\.zodEvery\)/);
  assert.match(html, /const unitMul = \(\) =>/);
  assert.match(html, /\* unitMul\(\) \* PK\.scoreMul\)/, 'COMET and ECLIPSE multiply a Perfect');
  assert.match(html, /resoT:0, resoMul:1, keepT:0, dark:false, darkT:0, darkMul:0, zod:0, zodP:0,/, 'per-run state');
  for (const [id, k] of [['quasar', 'beamEvery:10'], ['comet', 'cometStep:.02'], ['zodiac', 'zodEvery:10'], ['eclipse', 'eclEvery:8']]) assert.match(row(id), new RegExp(k), id);
});

test('review fixes: beams carry over to gates not spawned yet; the Corona counts after the stop; fair skills keep a window', () => {
  assert.match(html, /function beamMark\(n\)\{/, 'one helper marks gates now and keeps the rest');
  assert.match(block('function spawnGate(', '\n}\n'), /if \(FX\.beamLeft > 0\)\{ g\.sure = true; g\.beam = 1; FX\.beamLeft--; \}/);
  assert.match(html, /resoT:0, resoMul:1, keepT:0, dark:false, darkT:0, darkMul:0, zod:0, zodP:0, beamLeft:0,/);
  const uu = block('function useUlt(', '\n}\n'), us = block('function useSkill(', '\n}\n');
  assert.match(uu.slice(uu.indexOf("case 'eclipse'")), /FX\.darkT = Math\.max\(FX\.darkT, u\.dur \+ u\.stop\); FX\.darkMul = u\.mul; FX\.ultT = FX\.ultMax = u\.dur \+ u\.stop;/);
  for (const id of ['quasar', 'zodiac']) assert.match(us.slice(us.indexOf(`case '${id}'`)), /boostT = TMAX\.boost = skv\('dur'\)/, `${id}: a wider window, also in fair modes`);
  assert.match(html, /\.\.\.\(u\.god \? \{god: \+\(u\.god\*b\)\.toFixed\(2\)\} : \{\}\)/, 'COMET: invincibility grows with the ultimate');
  assert.match(block('function zodSign(', '\n}\n'), /maxCombo = Math\.max\(maxCombo, combo\)/);
  assert.match(html, /if \(id === 'quasar' && \(FX\.ultE -= dt\) <= 0\)/, 'Jet Stream beats on game time, like its clock');
});

test('fair rows switch the stage-only parts off', () => {
  const sk = block('const SK = {', '\n};');
  assert.match(sk, /quasar:\{[^}]*f:\{[^}]*n:0[^}]*mul:1/);
  assert.match(sk, /comet:\{[^}]*fever:1[^}]*f:\{[^}]*fever:0/);
  assert.match(sk, /zodiac:\{[^}]*f:\{[^}]*n:0[^}]*mul:1/);
});
