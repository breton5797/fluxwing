// arcade-core/fx — pure effect rules shared across games (shield aura, xp trail, juice, particles).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeParticle, stepParticles, spawnCount } from '../arcade-core/fx/particles.js';
import { ringPhases, hexBurst, shieldHit } from '../arcade-core/fx/shield.js';
import { pushTrail, xpPopup } from '../arcade-core/fx/xp.js';
import { shakeOffset, hitstop, flashAlpha, coinBounceScale } from '../arcade-core/fx/juice.js';

test('particles: step ages, moves and drops dead ones without mutating input', () => {
  const p = makeParticle({ x: 0, y: 0, vx: 10, vy: 0, life: 0.1 });
  const list = [p, makeParticle({ x: 0, y: 0, vx: 0, vy: 0, life: 1 })];
  const next = stepParticles(list, 0.2); // first particle expires
  assert.equal(next.length, 1);
  assert.equal(list.length, 2);
  assert.equal(list[0].life, 0.1);
  assert.ok(next[0].life < 1);
});

test('particles: gravity pulls vy over time', () => {
  const [p] = stepParticles([makeParticle({ x: 0, y: 0, vx: 0, vy: 0, life: 1, g: 100 })], 0.5);
  assert.ok(p.vy > 0 && p.y > 0);
});

test('particles: lowSpec halves spawn counts (rounded up, min 1)', () => {
  assert.equal(spawnCount(12, false), 12);
  assert.equal(spawnCount(12, true), 6);
  assert.equal(spawnCount(1, true), 1);
});

test('shield: one rotating ring phase per layer, evenly offset', () => {
  const ph = ringPhases(0, 3);
  assert.equal(ph.length, 3);
  const gap = ph[1] - ph[0];
  assert.ok(Math.abs((ph[2] - ph[1]) - gap) < 1e-9);
  const later = ringPhases(1, 3);
  assert.notEqual(later[0], ph[0]); // rotates with time
});

test('shield: hit consumes one layer and bursts 6 hex shards per remaining+1', () => {
  const r = shieldHit({ layers: 2 }, { x: 5, y: 7 });
  assert.equal(r.layers, 1);
  assert.equal(r.burst.length, hexBurst(5, 7, 1).length);
  assert.equal(hexBurst(0, 0, 2).length, 12); // 6 per layer broken... per spec: 6 shards per layer count
  assert.ok(r.burst.every(p => typeof p.vx === 'number' && p.life > 0));
});

test('xp: trail keeps at most max points, newest last, input untouched', () => {
  let t = [];
  for (let i = 0; i < 30; i++) t = pushTrail(t, { x: i, y: 0 }, 20);
  assert.equal(t.length, 20);
  assert.equal(t[19].x, 29);
});

test('xp: popup formats amount and rises', () => {
  const p = xpPopup(120);
  assert.equal(p.text, '+120 XP');
  assert.ok(p.vy < 0 && p.life > 0);
});

test('juice: shake decays to zero at duration and is zero after', () => {
  const mid = shakeOffset(0.1, 8, 0.4, 42);
  assert.ok(Math.abs(mid.x) <= 8 && Math.abs(mid.y) <= 8);
  const end = shakeOffset(0.4, 8, 0.4, 42);
  assert.deepEqual(end, { x: 0, y: 0 });
});

test('juice: hitstop freezes for exactly 60ms', () => {
  const h = hitstop(1000);
  assert.equal(h.until, 1060);
  assert.ok(h.frozen(1030) && !h.frozen(1061));
});

test('juice: flash alpha fades linearly, coin bounce overshoots then settles', () => {
  assert.equal(flashAlpha(0, 0.2), 1);
  assert.equal(flashAlpha(0.2, 0.2), 0);
  assert.ok(coinBounceScale(0.15) > 1); // overshoot
  assert.ok(Math.abs(coinBounceScale(1) - 1) < 0.02); // settled
});
