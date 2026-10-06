import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEVER, GROUND, PHYS, POWER, REVIVE } from '../src/config.js';
import { gateCenter } from '../src/logic.js';
import { dailySeed } from '../src/rng.js';
import { canRevive, createGame, currentSpeed, drainEvents, revive, step, summarize } from '../src/sim.js';
import { botInput, flyBot } from './helpers/bot.js';

const STEP = PHYS.step;
const run = (g, seconds, input = {}) => {
  for (let i = 0; i < Math.round(seconds / STEP); i++) step(g, STEP, input);
  return g;
};
const types = g => g.events.map(e => e.type);
// Park the bird in the middle of the next gate's column.
const intoGate = g => {
  const gate = g.gates.find(gt => !gt.scored);
  g.dist = gate.wx + gate.w / 2;
  g.bird.y = gateCenter(gate, g.t);
  g.bird.vy = 0;
  return gate;
};
const pastGate = (g, gate) => { g.dist = gate.wx + gate.w + PHYS.birdR + 1; };

test('a new run starts in the air with a course already laid out', () => {
  const g = createGame({ seed: 1 });
  assert.equal(g.phase, 'play');
  assert.equal(g.mode, 'classic');
  assert.ok(g.gates.length >= 5);
  assert.equal(g.score, 0);
});

test('without input the bird falls, dies on the ground and the run ends', () => {
  const g = run(createGame({ seed: 1 }), 0.9);
  assert.equal(g.phase, 'dying');
  assert.ok(types(g).includes('die'));
  assert.equal(g.bird.y, GROUND - PHYS.birdR);
  run(g, 1.3);
  assert.equal(g.phase, 'over');
  const frozen = g.dist;
  run(g, 0.5);
  assert.equal(g.dist, frozen);
});

test('flapping launches the bird upward and is clamped at the ceiling', () => {
  const g = createGame({ seed: 1 });
  step(g, STEP, { flap: true });
  assert.ok(g.bird.vy < 0);
  assert.deepEqual(types(g), ['flap']);
  for (let i = 0; i < 100; i++) step(g, STEP, { flap: true });
  assert.equal(g.bird.y, PHYS.birdR);
  assert.equal(g.phase, 'play');
});

test('step never modifies the input object and drainEvents empties the queue', () => {
  const g = createGame({ seed: 1 });
  const input = Object.freeze({ flap: true, dash: true });
  step(g, STEP, input);
  assert.equal(drainEvents(g).length, 1);
  assert.equal(g.events.length, 0);
});

test('identical seeds and inputs replay identically', () => {
  const seed = dailySeed('2026-10-06');
  const a = flyBot(seed, 45, 'daily'), b = flyBot(seed, 45, 'daily');
  assert.deepEqual(summarize(a), summarize(b));
  assert.equal(a.dist, b.dist);
  assert.equal(a.bird.y, b.bird.y);
  assert.notEqual(flyBot(seed + 1, 45).dist, a.dist);
});

test('dash needs a full meter, then phases through walls for bonus points', () => {
  const g = createGame({ seed: 4 });
  step(g, STEP, { dash: true });
  assert.equal(g.dashT, 0);
  g.dashMeter = 1;
  const gate = g.gates[0];
  g.dist = gate.wx - PHYS.birdR - 2;
  g.bird.y = 20; // straight into the upper wall
  step(g, STEP, { dash: true });
  assert.ok(g.dashT > 0);
  assert.equal(g.dashMeter, 0);
  assert.equal(currentSpeed(g), PHYS.baseSpeed * PHYS.dashMul);
  for (let i = 0; i < 400 && !gate.scored; i++) step(g, STEP, {});
  assert.equal(g.phase, 'play');
  assert.equal(g.score, 2);
  assert.equal(g.dashGates, 1);
  assert.ok(g.events.some(e => e.type === 'pass' && e.kind === 'phase'));
});

test('a dash cannot run out while the bird is still inside a wall', () => {
  const g = createGame({ seed: 4 });
  const gate = g.gates[0];
  g.dist = gate.wx + 4;
  g.bird.y = 20;
  g.dashT = STEP / 2;
  step(g, STEP, {});
  assert.ok(g.dashT > 0, 'dash is held open inside the column');
  assert.equal(g.phase, 'play');
});

test('hitting a wall kills, unless a shield absorbs it', () => {
  const dead = createGame({ seed: 2 });
  intoGate(dead);
  dead.bird.y = 20;
  step(dead, STEP, {});
  assert.equal(dead.phase, 'dying');

  const safe = createGame({ seed: 2 });
  intoGate(safe);
  safe.bird.y = 20;
  safe.shield = true;
  step(safe, STEP, {});
  assert.equal(safe.phase, 'play');
  assert.equal(safe.shield, false);
  assert.ok(safe.invuln > 0);
  assert.ok(types(safe).includes('shieldBreak'));
});

test('a shield bounces the bird off the ground once', () => {
  const g = createGame({ seed: 2 });
  g.shield = true;
  g.bird.y = GROUND - PHYS.birdR - 1;
  g.bird.vy = 600;
  step(g, STEP, {});
  assert.equal(g.phase, 'play');
  assert.equal(g.shield, false);
  assert.ok(g.bird.vy < 0);
});

test('near misses build a combo, a sloppy pass breaks it', () => {
  const g = createGame({ seed: 6 });
  for (let n = 1; n <= 2; n++) {
    const gate = intoGate(g);
    gate.minClear = 5;
    pastGate(g, gate);
    step(g, STEP, { flap: true });
    assert.equal(g.combo, n);
  }
  assert.equal(g.score, 2 + 3);
  assert.equal(g.perfects, 2);
  const gate = intoGate(g);
  gate.minClear = 60;
  pastGate(g, gate);
  step(g, STEP, { flap: true });
  assert.equal(g.combo, 0);
  assert.equal(g.maxCombo, 2);
  assert.ok(types(g).includes('comboBreak'));
});

test(`combo ${FEVER.combo} ignites fever, doubling points until it burns out`, () => {
  const g = createGame({ seed: 6 });
  g.combo = FEVER.combo - 1;
  const gate = intoGate(g);
  gate.minClear = 5;
  pastGate(g, gate);
  step(g, STEP, { flap: true });
  assert.ok(g.feverT > 0);
  assert.equal(g.score, (1 + FEVER.combo) * 2);
  assert.ok(types(g).includes('fever'));
  g.feverT = STEP / 2;
  step(g, STEP, { flap: true });
  assert.equal(g.feverT, 0);
  assert.ok(types(g).includes('feverEnd'));
});

test('orbs fill the dash meter and power-ups switch on their effects', () => {
  const g = createGame({ seed: 9 });
  const place = k => g.orbs.push({ wx: g.dist, y: g.bird.y, k, t: 0, gate: null });
  g.orbs = [];
  ['orb', 'shield', 'magnet', 'slow', 'double'].forEach(place);
  step(g, STEP, {});
  assert.equal(g.orbCount, 1);
  assert.ok(g.dashMeter > 0);
  assert.equal(g.shield, true);
  assert.ok(g.magnetT > POWER.magnet - 0.1 && g.slowT > POWER.slow - 0.1 && g.doubleT > POWER.double - 0.1);
  assert.equal(g.orbs.length, 0);
  assert.deepEqual(types(g).filter(t => t !== 'flap'), ['orb', 'power', 'power', 'power', 'power']);
  run(g, 0.3, {});
  assert.ok(g.timeScale < 0.9, 'slow-mo eases the clock down');
});

test('the magnet pulls nearby orbs toward the bird', () => {
  const g = createGame({ seed: 9 });
  g.orbs = [{ wx: g.dist + 120, y: g.bird.y, k: 'orb', t: 0, gate: null }];
  g.magnetT = 5;
  const before = g.orbs[0].wx - g.dist;
  step(g, STEP, { flap: true });
  assert.ok(g.orbs[0].wx - g.dist < before - 3);
});

test('drones kill on contact but are destroyed by a dash', () => {
  const mk = g => { g.drones = [{ wx: g.dist + 2, base: g.bird.y, amp: 0, freq: 1, ph: 0, dead: false }]; };
  const hit = createGame({ seed: 3 });
  mk(hit);
  step(hit, STEP, {});
  assert.equal(hit.phase, 'dying');

  const dash = createGame({ seed: 3 });
  mk(dash);
  dash.dashMeter = 1;
  step(dash, STEP, { dash: true });
  assert.equal(dash.phase, 'play');
  assert.equal(dash.droneKills, 1);
  assert.equal(dash.score, 3);
  assert.equal(dash.drones.length, 0);
  assert.ok(types(dash).includes('droneKill'));
});

test('a run can be revived exactly once, with a grace period', () => {
  const g = createGame({ seed: 5 });
  assert.equal(revive(g), false, 'cannot revive a live run');
  g.score = REVIVE.minScore;
  run(g, 3);
  assert.equal(g.phase, 'over');
  assert.equal(canRevive(g), true);
  assert.equal(revive(g), true);
  assert.equal(g.phase, 'play');
  assert.equal(g.invuln, REVIVE.invuln);
  run(g, 0.2, { flap: true });
  assert.equal(g.phase, 'play');
  g.bird.vy = 0;
  g.invuln = 0;
  run(g, 4);
  assert.equal(g.phase, 'over');
  assert.equal(canRevive(g), false);
  assert.equal(revive(g), false);
});

test('a worthless run is not offered a revive', () => {
  const g = run(createGame({ seed: 5 }), 3);
  assert.equal(g.score, 0);
  assert.equal(canRevive(g), false);
});

test('crossing a zone boundary announces the new zone', () => {
  const g = createGame({ seed: 12 });
  g.passed = 11;
  const gate = intoGate(g);
  gate.minClear = 80;
  pastGate(g, gate);
  step(g, STEP, { flap: true });
  const zone = g.events.find(e => e.type === 'zone');
  assert.deepEqual({ zone: zone.zone, loop: zone.loop }, { zone: 1, loop: 0 });
});

test('summarize returns a frozen snapshot of the run', () => {
  const g = flyBot(21, 20);
  const s = summarize(g);
  assert.ok(Object.isFrozen(s));
  assert.equal(s.score, g.score);
  assert.equal(s.gates, g.passed);
  assert.equal(s.mode, 'classic');
});

test('an autopilot can fly generated courses deep into the difficulty ramp', () => {
  const results = Array.from({ length: 30 }, (_, i) => flyBot(1000 + i, 120));
  const gates = results.map(g => g.passed).sort((a, b) => a - b);
  const median = gates[Math.floor(gates.length / 2)];
  assert.ok(median >= 30, `median gates ${median}, all: ${gates.join(',')}`);
  for (const g of results) {
    assert.ok(g.score >= g.passed, 'every gate is worth at least a point');
    assert.ok(g.bird.y >= PHYS.birdR && g.bird.y <= GROUND - PHYS.birdR);
    assert.ok(g.gates.length < 40 && g.orbs.length < 200, 'old entities are culled');
  }
});

test('the bot helper only reads state', () => {
  const g = createGame({ seed: 77 });
  const before = JSON.stringify({ ...g, rng: null });
  botInput(g);
  assert.equal(JSON.stringify({ ...g, rng: null }), before);
});
