// Core-loop feel and SFX variety (audit 2026-10-28, owner decisions 5, 6 and 9):
// (5) a faster death-to-retry loop: the first gate of a run starts closer and the result card comes up at 0.85 s;
// (6) the first seconds answer every gate: a small '+1' on a normal pass and a one-time Perfect band on the first run;
// (9) less repetitive SFX: the flap is detuned at random by up to ±4 %, the gate pass climbs a 4-note scale.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadFx } from './helpers/fx.js';

const html = readIndex();
const block = (name, ret) => {
  const m = html.match(new RegExp(`/\\* ${name}:start[\\s\\S]*?/\\* ${name}:end \\*/`));
  assert.ok(m, `${name} block`);
  return new Function(`${m[0]}\nreturn {${ret}};`)();
};
const fnBody = name => { const i = html.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return html.slice(i, html.indexOf('\n}', i)); };
const F = block('ftue', 'firstGateX, FIRST_GATE, perfBandDue');
const A = block('audio', 'FLAP_DETUNE, flapFreq, PASS_SCALE, passFreq');
const X = loadFx();

// (5) death-to-restart tempo
test('first gate: LW + 20 on a normal run, rookie runs keep their LW + 80 + lead', () => {
  assert.equal(F.FIRST_GATE, 20);
  assert.equal(F.firstGateX(360, false, 110), 380);
  assert.equal(F.firstGateX(360, true, 110), 360 + 80 + 110, 'ROOKIE.lead is kept');
  assert.match(fnBody('reset'), /spawnGate\(firstGateX\(LW, rookieOn\(\), ROOKIE\.lead\)\);/);
  assert.doesNotMatch(fnBody('reset'), /spawnGate\(LW \+ 80/, 'the old fixed lead is gone');
});

test('first gate: only the spawn x moves; the course rng is seeded before it and spawnGate draws the same numbers', () => {
  const r = fnBody('reset');
  assert.ok(r.indexOf('rng = mode ===') < r.indexOf('spawnGate(firstGateX('), 'seeding happens first, unchanged');
  assert.doesNotMatch(fnBody('spawnGate'), /firstGateX|FIRST_GATE/, 'spawnGate itself is untouched');
});

test('result card at 0.85 s: the gray-out ends there and the dying branch opens the card on it', () => {
  assert.equal(X.FX_DEFAULTS.death.grayTo, .85);
  const json = JSON.parse(html.match(/<script type="application\/json" id="fxcfg">([^<]*)<\/script>/)[1]);
  assert.equal(json.death.grayTo, .85, 'the shipped fxcfg override matches');
  const cfg = X.fxCfgMerge(X.FX_DEFAULTS, json);
  assert.equal(X.deathPhase(.85, cfg).gray, 1);
  assert.ok(X.deathPhase(.7, cfg).gray > 0 && X.deathPhase(.7, cfg).gray < 1);
  assert.match(html, /if \(deathT > FXCFG\.death\.grayTo\)\{ if \(canContinue\(\)\) openCont\(\); else showOver\(\); \}/);
  assert.doesNotMatch(html, /deathT > 1\.1/);
});

// (6) the first ten seconds
test("normal pass: a small (non-big) '+1' pop, only in the plain-pass branch", () => {
  assert.match(html, /addScore\(1\); SFX\.pass\(gatesPassed\); pop\('\+1', bird\.x \+ 10, bird\.y - 30, \[0,0,92\]\);/);
  assert.equal((html.match(/pop\('\+1'/g) || []).length, 1, 'one place only');
});

test('Perfect band: due only on a tutorial run at the PERFECT tip, never seen before, never in versus', () => {
  assert.equal(F.perfBandDue({ mode: 'endless', step: 2, seen: 0 }), true);
  assert.equal(F.perfBandDue({ mode: 'daily', step: 2, seen: 0 }), true, 'the first run may be the daily one');
  assert.equal(F.perfBandDue({ mode: 'endless', step: 2, seen: 1 }), false, 'once');
  assert.equal(F.perfBandDue({ mode: 'endless', step: 1, seen: 0 }), false);
  assert.equal(F.perfBandDue({ mode: 'endless', step: 3, seen: 0 }), false);
  assert.equal(F.perfBandDue({ mode: 'versus', step: 2, seen: 0 }), false);
});

test('Perfect band: tutTick turns it on with tut2 and writes the seen flag there; a new run clears it; it is device-only', () => {
  const tk = fnBody('tutTick');
  assert.match(tk, /tutStep = 2; showTip\(t\('tut2'\)\); if \(perfBandDue\(\{mode, step: 2, seen: store\.get\('fw27_pband', 0\)\}\)\)\{ FX\.pband = 1; store\.set\('fw27_pband', 1\); \}/);
  { const i = html.indexOf('const newFx = () => ({'); assert.ok(i >= 0); assert.match(html.slice(i, html.indexOf('});', i)), /pband: ?0/, 'every run starts without it'); }
  const local = html.slice(html.indexOf('const FS_LOCAL'), html.indexOf(']);', html.indexOf('const FS_LOCAL')));
  assert.ok(local.includes("'fw27_pband'"), 'fw27_pband in FS_LOCAL');
});

test('Perfect band: drawn on the next gate from perfWin() while tut2 is up; gates are not widened', () => {
  const d = fnBody('drawPerfBand');
  assert.match(d, /perfWin\(\)/);
  assert.match(d, /Math\.min\(perfWin\(\), gp\/2\)/);
  assert.doesNotMatch(d, /\bg\.\w+\s*[-+*\/]?=(?!=)/, 'reads the gate, never writes to it');
  assert.match(html, /if \(state === 'play' && FX\.pband && tutStep === 2\) drawPerfBand\(\);/);
  assert.match(html, /const perfWin = \(\) => B\.window \+ PK\.windowBonus \+ \(boostT > 0 \? 10 : 0\)/, 'the Perfect window rule is unchanged');
});

// (9) SFX repetition
test('flap: random detune within ±4 % around 520 Hz', () => {
  assert.equal(A.FLAP_DETUNE, .04);
  assert.ok(Math.abs(A.flapFreq(0) - 520*.96) < 1e-9);
  assert.ok(Math.abs(A.flapFreq(.5) - 520) < 1e-9);
  assert.ok(A.flapFreq(.999999) < 520*1.04 + 1e-9 && A.flapFreq(.999999) > 540);
  for (let i = 0; i < 200; i++){ const f = A.flapFreq(Math.random()); assert.ok(f >= 520*.96 - 1e-9 && f <= 520*1.04 + 1e-9); }
  assert.match(html, /flap\(\)\{ tone\(flapFreq\(Math\.random\(\)\), \.07, 'triangle', \.18, 240\); \}/, 'same level, through tone() (mute aware)');
});

test('pass: a 4-note scale from 660 Hz, cycling by gate', () => {
  assert.equal(A.PASS_SCALE.length, 4);
  const f = [0, 1, 2, 3, 4, 5, 6, 7].map(A.passFreq);
  assert.equal(f[0], 660);
  assert.equal(new Set(f.slice(0, 4)).size, 4, 'four different notes');
  for (let i = 1; i < 4; i++) assert.ok(f[i] > f[i - 1], 'rising');
  assert.deepEqual(f.slice(4), f.slice(0, 4), 'period 4');
  assert.equal(A.passFreq(-1), A.passFreq(3));
  assert.match(html, /pass\(i\)\{ tone\(passFreq\(i\), \.09, 'square', \.11\); \}/, 'same level, through tone() (mute aware)');
});

test('SFX still respect the SFX switch: tone() returns early when muted', () => {
  assert.match(fnBody('tone'), /if \(!ac \|\| muted\) return;/);
});
