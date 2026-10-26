import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18NParts } from './helpers/i18n.js';

// Rank 8 (divine): ARCHON, OUROBOROS, KIRIN, GARUDA — complete, hidden until the rank is released, translated, wired, fair.
const html = readIndex();
const IDS = ['archon', 'ouroboros', 'kirin', 'garuda'];
const birds = html.slice(html.indexOf('const BIRDS = ['), html.indexOf('BIRDS.sort('));
const row = id => (birds.match(new RegExp(`^\\s*\\{ id:'${id}'.*$`, 'm')) || [''])[0];
const block = (start, end) => { const a = html.indexOf(start); assert.ok(a >= 0, start); return html.slice(a, html.indexOf(end, a)); };
const tm = html.match(/\/\* tiers:start[\s\S]*?\/\* tiers:end \*\//);
const T = new Function(`${tm[0]}\nreturn {TIER_IDS};`)();

test('the four divine units are reserved ids 13-16, rank 8, hidden until release', () => {
  assert.deepEqual(T.TIER_IDS.slice(12, 16), IDS);
  for (const id of IDS){ const r = row(id); assert.ok(r, id); assert.match(r, /rarity:8,/); assert.match(r, /hidden:true/); }
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

test('the new passives are stage mode only and wired into the gate, Perfect and hit code', () => {
  const perks = html.slice(html.indexOf('function perks(){'), html.indexOf('const I18N_C = {'));
  for (const k of ['archStep', 'archMax', 'ouroAt', 'coinEvery', 'stormEvery', 'stormN']) assert.match(perks, new RegExp(`${k}: d \\? 0 : \\(B\\.${k} \\|\\| 0\\)`), `${k} is 0 in fair modes`);
  assert.match(html, /\(PK\.archStep \? 1 \+ Math\.min\(PK\.archMax, FX\.arch\) : 1\)/, 'ARCHON multiplies a Perfect');
  assert.match(html, /\(PK\.ouroAt \? 1 \+ \.15\*FX\.loops : 1\)/, 'OUROBOROS multiplies a Perfect');
  assert.match(html, /if \(PK\.archStep\) FX\.arch = Math\.min\(PK\.archMax, FX\.arch \+ PK\.archStep\);/, 'ARCHON stacks per gate');
  assert.match(html, /const hitReset = \(\) => \{ FX\.arch = 0; FX\.loops = 0; \};/, 'one rule: a hit clears ARCHON\'s stack and OUROBOROS\'s loops');
  assert.match(html, /function breakShield\(dirY\)\{ hitReset\(\);/); assert.match(html, /bounceLeft--; hitReset\(\);/); assert.match(html, /reviveLeft--; hitReset\(\);/);
  assert.match(html, /contUsed = true; hitReset\(\);/, 'a continue after a death clears them too');
  assert.match(html, /if \(PK\.ouroAt && combo >= PK\.ouroAt\)\{ combo = PK\.feverAt; FX\.loops = Math\.min\(3, FX\.loops \+ 1\);/, 'OUROBOROS loops');
  assert.match(html, /if \(PK\.stormEvery && gatesPassed % PK\.stormEvery === 0\)\{ FX\.strikeN \+= PK\.stormN;/, 'GARUDA storms');
  assert.match(html, /if \(PK\.coinEvery && combo % PK\.coinEvery === 0\) coinRain\(/, 'KIRIN coin shower');
  assert.match(html, /keepT:0, dark:false, darkT:0, darkMul:0, zod:0, zodP:0, beamLeft:0, holeT:0, holeGap:0, entT:0, entAdd:0, entLast:1, arch:0, loops:0,/, 'per-run state');
  for (const [id, k] of [['archon', 'archStep:.05'], ['ouroboros', 'ouroAt:30'], ['kirin', 'coinEvery:5'], ['garuda', 'stormEvery:15']]) assert.match(row(id), new RegExp(k), id);
});

test('review: OUROBOROS\'s ultimate lends the loops and gives them back; KIRIN\'s coins are stage mode only; ARCHON capped', () => {
  const uu = block('function useUlt(', '\n}\n'), ue = block('function ultEnd(', '\n}\n'), us = block('function useSkill(', '\n}\n'), sk = block('const SK = {', '\n};');
  assert.match(uu.slice(uu.indexOf("case 'ouroboros'")), /FX\.loopsWas = FX\.loops; FX\.loops = 3;/);
  assert.match(ue, /if \(FX\.loopsWas >= 0\)\{ FX\.loops = FX\.loopsWas; FX\.loopsWas = -1; \}/);
  assert.match(sk, /kirin:\{[^}]*rain:8[^}]*f:\{[^}]*rain:0/);
  assert.match(us, /if \(id === 'kirin' && skv\('rain'\)\)\{ if \(magnetT < skv\('dur'\)\) magnetT = TMAX\.magnet = skv\('dur'\); coinRain\(skv\('rain'\)\); \}/);
  assert.match(us, /if \(id === 'ouroboros' && skv\('coil'\)\)\{ combo \+= skv\('coil'\); maxCombo = Math\.max\(maxCombo, combo\); \}/);
  assert.match(row('archon'), /archMax:\.3/); assert.match(row('kirin'), /shieldStart:1/);
});

test('fair rows switch the stage-only parts off', () => {
  const sk = block('const SK = {', '\n};');
  for (const id of ['archon', 'ouroboros', 'kirin']) assert.match(sk, new RegExp(`${id}:\\{[^}]*f:\\{[^}]*mul:1`), id);
  assert.match(sk, /garuda:\{[^}]*f:\{[^}]*n:0/);
});
