import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18NParts } from './helpers/i18n.js';

// The glide gauge (owner's choice A, 2026-10-26): holding the screen (or Space / Up / W) while falling halves gravity and the fall cap while the gauge lasts.
// 1.5 s full, +0.5 s per gate passed, stage mode only. A hold is never a flap: the expert "tap within 2 s" stall timer keeps running.
const html = readIndex();
const m = html.match(/\/\* glide:start \*\/[\s\S]*?\/\* glide:end \*\//);
const G = m ? new Function(`${m[0]}\nreturn {GLIDE, glideStep};`)() : {};

test('the numbers: 1.5 s full, half the fall, half a second back per gate', () => {
  assert.ok(m, 'a pure glide block');
  assert.deepEqual({...G.GLIDE}, {max: 1.5, fall: .5, refill: .5});
  assert.ok(Object.isFrozen(G.GLIDE));
});

test('glideStep: only held, only falling, only while the gauge lasts; it drains in real seconds and never goes negative', () => {
  const s = (pressed, vy, gauge, dt = .1) => G.glideStep(pressed, vy, gauge, dt);
  assert.deepEqual(s(true, 200, 1.5), {on: true, gauge: 1.4});
  assert.deepEqual(s(false, 200, 1.5), {on: false, gauge: 1.5}, 'not held');
  assert.deepEqual(s(true, -300, 1.5), {on: false, gauge: 1.5}, 'rising after a flap: no glide, no drain');
  assert.deepEqual(s(true, 200, 0), {on: false, gauge: 0}, 'empty');
  assert.deepEqual(s(true, 200, .05), {on: true, gauge: 0}, 'the last drop');
});

test('stage mode only, refilled by gates, reset with the run', () => {
  const perks = html.slice(html.indexOf('function perks(){'), html.indexOf('const I18N_C = {'));
  assert.match(perks, /glide: d \? 0 : GLIDE\.max,/, 'daily and versus: no glide');
  assert.match(html, /FX = newFx\(\); FX\.glide = PK\.glide;/);
  assert.match(html, /g\.scored = true; gatesPassed\+\+; if \(PK\.glide\) FX\.glide = Math\.min\(PK\.glide, FX\.glide \+ GLIDE\.refill\);/);
});

test('the physics: gravity and the fall cap both halve while gliding, every other branch leaves it off', () => {
  assert.match(html, /FX\.gliding = false;\n {2}if \(freezeT > 0\)/);
  assert.match(html, /else \{ const gl = glideStep\(pressed, bird\.vy, FX\.glide, dt\); FX\.glide = gl\.gauge; FX\.gliding = gl\.on;/);
  assert.match(html, /\* \(FX\.gliding \? GLIDE\.fall : 1\) \* dt; \}/);
  assert.match(html, /bird\.vy = Math\.min\(bird\.vy, B\.maxFall \* \(lowGravT > 0 \? \.6 : 1\) \* \(FX\.gliding \? GLIDE\.fall : 1\)\);/);
});

test('the hold: set on press, cleared on every way a press can end; a hold is never a flap', () => {
  assert.match(html, /cv\.addEventListener\('pointerdown', e => \{ e\.preventDefault\(\); pressed = true; holdId = e\.pointerId; flap\(\); \}\);/);
  assert.match(html, /const holdEnd = e => \{ if \(e\.pointerId === holdId\)\{ pressed = false; holdId = null; \} \};/, 'only the finger that pressed the screen ends the hold');
  for (const ev of ['pointerup', 'pointercancel']) assert.ok(html.includes(`addEventListener('${ev}', holdEnd)`), ev);
  assert.ok(html.includes("addEventListener('blur', () => { pressed = false; holdId = null; })"), 'blur');
  assert.match(html, /addEventListener\('keyup', e => \{ if \(e\.code === 'Space' \|\| e\.code === 'ArrowUp' \|\| e\.code === 'KeyW'\) pressed = false; \}\);/);
  assert.match(html, /if \(e\.code === 'Space' \|\| e\.code === 'ArrowUp' \|\| e\.code === 'KeyW'\)\{ e\.preventDefault\(\); pressed = true;/);
  assert.match(html, /-webkit-touch-callout:none/, 'no iOS long-press menu under a held finger');
  const flapFn = html.slice(html.indexOf('function flap(){'), html.indexOf('\n}', html.indexOf('function flap(){')));
  assert.doesNotMatch(flapFn, /pressed/, 'flap() knows nothing of the hold');
});

test('every language explains the hold once', () => {
  const P = loadI18NParts();
  for (const [l, tb] of Object.entries(P.I18N)) assert.ok(tb.glideHint && tb.glideHint.trim(), `${l} glideHint`);
  assert.match(html, /if \(mode === 'endless' && PK\.glide && !store\.get\('fw27_glide', 0\)\)\{ store\.set\('fw27_glide', 1\); banner\(t\('glideHint'\)/);
});
