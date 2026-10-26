import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18NParts } from './helpers/i18n.js';

// Rank 5 (celestial): SERAPH, VALKYRIE, LUMEN, HALCYON — complete, hidden until the rank is released, translated, wired.
const html = readIndex();
const IDS = ['seraph', 'valkyrie', 'lumen', 'halcyon'];
const birds = html.slice(html.indexOf('const BIRDS = ['), html.indexOf('BIRDS.sort('));
const row = id => (birds.match(new RegExp(`^\\s*\\{ id:'${id}'.*$`, 'm')) || [''])[0];
const block = (start, end) => { const a = html.indexOf(start); assert.ok(a >= 0, start); return html.slice(a, html.indexOf(end, a)); };
const tm = html.match(/\/\* tiers:start[\s\S]*?\/\* tiers:end \*\//);
const T = new Function(`${tm[0]}\nreturn {TIER_IDS, skillBoost};`)();

test('the four celestial units are the first four reserved ids, rank 5, hidden until release', () => {
  assert.deepEqual(T.TIER_IDS.slice(0, 4), IDS);
  for (const id of IDS){
    const r = row(id); assert.ok(r, id + ' row');
    assert.match(r, /rarity:5,/); assert.match(r, /hidden:true/); assert.match(r, /stats:\[\d,\d,\d,\d\]/);
  }
});

test('each has a skill, an ultimate, a body, unit fx (idle + the four ultimate hooks) and an aura', () => {
  const sk = block('const SK = {', '\n};'), us = block('function useSkill(', '\n}\n'), ult = block('const ULT = {', '};'), uu = block('function useUlt(', '\n}\n');
  const art = block('const UNIT_ART = {', '\n};'), fx = block('const UNIT_FX = {', '\n};'), au = block('const AURA = {', '\n};');
  for (const id of IDS){
    assert.match(sk, new RegExp(`\\b${id}:\\{cd:\\d+[^}]*f:\\{cd:18`), `SK.${id} (fair cd 18)`);
    assert.match(us, new RegExp(`case '${id}'`), `useSkill ${id}`);
    assert.match(ult, new RegExp(`\\b${id}:\\{(dur|n):`), `ULT.${id}`);
    assert.match(uu, new RegExp(`case '${id}'`), `useUlt ${id}`);
    assert.match(art, new RegExp(`\\n  ${id}\\(c, d, w, glow, o\\)\\{`), `UNIT_ART.${id}`);
    const f = fx.slice(fx.indexOf(`\n  ${id}: {`)); assert.ok(fx.includes(`\n  ${id}: {`), `UNIT_FX.${id}`);
    const own = f.slice(0, f.indexOf('\n  },') + 4);
    for (const k of ['idle(', 'ultSky(', 'ultMarks(', 'ultCast(', 'ultSnd(']) assert.ok(own.includes(k), `UNIT_FX.${id}.${k}`);
    assert.match(au, new RegExp(`\\n  ${id}\\(c, d, R, k, lo\\)\\{`), `AURA.${id}`);
  }
});

test('every language has the six unit strings, with {n} in the skill and ultimate texts', () => {
  const P = loadI18NParts(), I = P.I18N;
  for (const [l, tb] of Object.entries(I)) for (const id of IDS){
    for (const k of ['r_', 'p_', 'sk_', 'sd_', 'ul_', 'ud_']) assert.ok(tb[k + id] && tb[k + id].trim(), `${l} ${k}${id}`);
    assert.match(tb['sd_' + id], /\{n\}/, `${l} sd_${id}`); assert.match(tb['ud_' + id], /\{n\}/, `${l} ud_${id}`);
  }
  for (const l of Object.keys(P.I18N_W)) for (const id of IDS) assert.ok(P.I18N_W[l]['ul_' + id], `world table ${l} has ul_${id} itself`);
});

test('skills and ultimates of ranks above ultra grow at evolution forms III and V; ranks up to ultra never', () => {
  assert.equal(T.skillBoost(4, 4), 1);
  assert.deepEqual([0, 1, 2, 3, 4].map(f => T.skillBoost(5, f)), [1, 1, 1.15, 1.15, 1.3]);
  const skv = block('const skv = k =>', 'const skillCd');
  assert.match(skv, /skillBoost/);
  assert.match(html, /const ultRow = id =>/);
  assert.match(block('function useUlt(', '\n}\n'), /u = ultRow\(id\)/);
});

test('form-scaled passives: SERAPH Perfect bonus +1 at forms II and IV, LUMEN keeps +5% of the combo per form (stage mode)', () => {
  const perks = html.slice(html.indexOf('function perks(){'), html.indexOf('const I18N_C = {'));
  assert.match(perks, /B\.formBonus \? \(fm \+ 1\) >> 1 : 0/);
  assert.match(perks, /B\.formKeep \? \.05\*fm : 0/);
  assert.match(row('seraph'), /formBonus:1/); assert.match(row('lumen'), /formKeep:1/);
});

test('shared machinery reads the unit\'s own row: storm chain, carry and Big Bang multiplier', () => {
  assert.doesNotMatch(html, /ULT\.tempest\.inv : skv\('inv'\)/);
  assert.doesNotMatch(html, /if \(ULT\.tempest\.arm\)/);
  assert.match(html, /bang \? ULT\[B\.id\]\.mul/);
  assert.match(html, /if \(FX\.keepT > 0\)\{/, 'LUMEN: no combo break while the lantern burns');
});
