import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadFx } from './helpers/fx.js';
const F = loadFx();
const cfg = F.fxCfgMerge(F.FX_DEFAULTS, {});

test('hitstopFor stays in 40..120ms and grows with level', () => {
  const [l, m, h] = ['light', 'mid', 'heavy'].map(k => F.hitstopFor(k, cfg));
  assert.ok(l >= .04 && h <= .12 && l < m && m < h);
  assert.equal(F.hitstopFor('mid', cfg), .08);
});

test('fxCfgMerge clamps out-of-range values and does not mutate inputs', () => {
  const over = { hitstop: { heavy: 9 } };
  const out = F.fxCfgMerge(F.FX_DEFAULTS, over);
  assert.equal(out.hitstop.heavy, .12);
  assert.equal(over.hitstop.heavy, 9);
  assert.notEqual(out, F.FX_DEFAULTS);
});

test('punchFor is within 1.05..1.15', () => {
  for (const k of ['light', 'mid', 'heavy']) { const z = F.punchFor(k, cfg); assert.ok(z >= 1.05 && z <= 1.15, k); }
});

test('shake is directional, deterministic and decays', () => {
  let s = F.shakeKick({ ox: 0, oy: 0, vx: 0, vy: 0 }, 1, 0, 10);
  s = F.shakeStep(s, 1 / 60, cfg);
  assert.ok(s.ox > 0 && Math.abs(s.oy) < 1e-9);
  for (let i = 0; i < 60; i++) s = F.shakeStep(s, 1 / 60, cfg);
  assert.ok(Math.hypot(s.ox, s.oy) < .5);
});

test('fxFeatures: low turns off distort/chroma/bloom and scales particles to 40%', () => {
  const f = F.fxFeatures('low', { shake: true, flash: true }, false, false);
  assert.deepEqual([f.distort, f.chroma, f.bloom, f.partMul], [false, false, false, .4]);
});

test('fxFeatures: reduced motion and a11y switches kill shake, flash and slowmo', () => {
  const rm = F.fxFeatures('high', { shake: true, flash: true }, true, false);
  assert.deepEqual([rm.shake, rm.flash, rm.slowmo, rm.distort], [0, false, false, false]);
  const a = F.fxFeatures('high', { shake: false, flash: false }, false, false);
  assert.deepEqual([a.shake, a.flash], [0, false]);
});

test('fxFeatures: fair modes never slow the simulation', () => {
  assert.equal(F.fxFeatures('high', { shake: true, flash: true }, false, true).slowmo, false);
});

test('pool spawns without growing and reports full with -1', () => {
  const p = F.fxPool(3);
  for (let i = 0; i < 3; i++) assert.ok(F.poolSpawn(p, { x: 0, y: 0, vx: 0, vy: 0, life: 1 }) >= 0);
  assert.equal(F.poolSpawn(p, { x: 0, y: 0, vx: 0, vy: 0, life: 1 }), -1);
  assert.equal(p.items.length, 3);
  F.poolStep(p, 2, 1000);
  assert.equal(p.live, 0);
  assert.ok(F.poolSpawn(p, { x: 0, y: 0, vx: 0, vy: 0, life: 1 }) >= 0);
});

test('debris bounces on the ground instead of passing through', () => {
  const p = F.fxPool(1);
  F.poolSpawn(p, { x: 0, y: 99, vx: 0, vy: 400, life: 1, layer: 'debris' });
  F.poolStep(p, .05, 100);
  const it = p.items.find(o => o.alive);
  assert.ok(it.y <= 100 && it.vy < 0);
});

test('burstSpec is deterministic for a seed and respects ranges', () => {
  const a = F.burstSpec('spark', 20, F.fxRng(7), cfg), b = F.burstSpec('spark', 20, F.fxRng(7), cfg);
  assert.deepEqual(a, b);
  const r = cfg.layers.spark;
  assert.ok(a.every(o => o.life >= r.life[0] && o.life <= r.life[1]));
});

test('gradCol goes white -> event colour -> dark', () => {
  const ev = [300, 100, 60];
  assert.ok(F.gradCol(0, ev)[2] >= 95);
  assert.deepEqual(F.gradCol(.5, ev).slice(0, 2), [300, 100]);
  assert.ok(F.gradCol(1, ev)[2] <= 20);
});

test('popScale runs 1.6 -> 1.0 with a bounce', () => {
  assert.equal(F.popScale(0), 1.6);
  assert.ok(Math.abs(F.popScale(1) - 1) < 1e-6);
  assert.ok([.4, .5, .6, .7].some(t => F.popScale(t) < 1));
});

test('comboLevel follows the existing tier and adds 20/30 only inside FEVER', () => {
  assert.equal(F.comboLevel(3, 0, cfg), 0);
  assert.equal(F.comboLevel(5, 1, cfg), 1);
  assert.equal(F.comboLevel(10, 2, cfg), 2);
  assert.equal(F.comboLevel(8, 2, cfg), 2);      // PULSAR feverAt 8
  assert.equal(F.comboLevel(20, 2, cfg), 3);
  assert.equal(F.comboLevel(30, 2, cfg), 4);
  assert.equal(F.comboLevel(24, 1, cfg), 1);     // comboKeep left a big combo below FEVER
});

test('deathPhase: slow for 0.4s, one flash+explosion, then greyscale ramps to 1 by 1.1s', () => {
  assert.equal(F.deathPhase(.1, cfg).scale, .3);
  assert.equal(F.deathPhase(.5, cfg).scale, .35);
  assert.equal(F.deathPhase(.39, cfg).explode, false);
  assert.equal(F.deathPhase(.41, cfg).explode, true);
  assert.equal(F.deathPhase(.2, cfg).gray, 0);
  assert.equal(F.deathPhase(1.1, cfg).gray, 1);
});

test('shieldRings: one entry per shield, distinct spin and hue; arcs from 3', () => {
  const r = F.shieldRings(3, cfg);
  assert.equal(r.length, 3);
  assert.equal(new Set(r.map(o => o.spin)).size, 3);
  assert.equal(new Set(r.map(o => o.hue)).size, 3);
  assert.deepEqual([1, 2, 3, 4].map(n => F.arcsOn(n, cfg)), [false, false, true, true]);
});

test('sfxRoute prefers a loaded file, falls back to the synth', () => {
  const synth = { flap() {} };
  assert.equal(F.sfxRoute('flap', { flap: {} }, synth), 'file');
  assert.equal(F.sfxRoute('flap', {}, synth), 'synth');
  assert.equal(F.sfxRoute('nope', {}, synth), null);
});

test('quality pick and step', () => {
  assert.equal(F.fxQualityPick({ cores: 4, mem: 2, dpr: 3 }, 'auto'), 'low');
  assert.equal(F.fxQualityPick({ cores: 8, mem: 8, dpr: 2 }, 'auto'), 'high');
  assert.equal(F.fxQualityPick({ cores: 8, mem: 8, dpr: 2 }, 'mid'), 'mid');
  assert.equal(F.fxQualityStep('high', 25), 'mid');
  assert.equal(F.fxQualityStep('low', 40), 'low');
  assert.equal(F.fxQualityStep('mid', 12), 'mid');
});

test('every FX event has a haptic or explicit null and a sound route', () => {
  for (const ev of F.FX_EVENTS) assert.ok(ev in F.FX_DEFAULTS.events, ev);
});

test('hapticFor reads the event table and returns null for silent events', () => {
  const table = { shieldHit: [40, 20, 70], flap: 6 };
  assert.deepEqual(F.hapticFor('shieldHit', table), [40, 20, 70]);
  assert.equal(F.hapticFor('gate', table), null);
});

test('low quality drops canvas glow and caps the backing store at 1.5x', () => {
  const a = { shake: true, flash: true };
  assert.equal(F.fxFeatures('low', a, false, false).glow, false);
  assert.equal(F.fxFeatures('mid', a, false, false).glow, true);
  assert.equal(F.fxFeatures('high', a, false, false).glow, true);
  assert.equal(F.fxFeatures('low', a, false, false).dprCap, 1.5);
  assert.equal(F.fxFeatures('high', a, false, false).dprCap, 2);
});
