import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DRONE, GATE, GROUND, PHYS, ZONES } from '../src/config.js';
import {
  clearance, difficulty, droneY, gateCenter, gateGap, judgePass, loopOf, makeDrone, makeGate, makeOrbs,
  makePower, multiplier, passPoints, rankOf, spacingAt, speedAt, zoneOf,
} from '../src/logic.js';
import { dailySeed, dateKey, hashString, mulberry32, randomSeed } from '../src/rng.js';

const course = (seed, n) => {
  const rng = mulberry32(seed);
  const gates = [];
  for (let i = 0; i < n; i++) gates.push(makeGate(rng, i, gates[i - 1] || null));
  return gates;
};

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const seqA = Array.from({ length: 500 }, a);
  assert.deepEqual(seqA, Array.from({ length: 500 }, b));
  assert.notDeepEqual(seqA.slice(0, 5), Array.from({ length: 5 }, c));
  assert.ok(seqA.every(v => v >= 0 && v < 1));
});

test('hashString and seeds are stable unsigned 32-bit values', () => {
  assert.equal(hashString(''), 0x811c9dc5);
  assert.equal(hashString('a'), 0xe40c292c);
  assert.equal(dailySeed('2026-10-06'), dailySeed('2026-10-06'));
  assert.notEqual(dailySeed('2026-10-06'), dailySeed('2026-10-07'));
  const s = randomSeed();
  assert.ok(Number.isInteger(s) && s >= 0 && s <= 0xffffffff);
});

test('dateKey formats local dates as YYYY-MM-DD', () => {
  assert.equal(dateKey(new Date(2026, 9, 6)), '2026-10-06');
  assert.equal(dateKey(new Date(2027, 0, 1)), '2027-01-01');
  assert.match(dateKey(), /^\d{4}-\d{2}-\d{2}$/);
});

test('difficulty ramps from 0 to 1 and clamps', () => {
  assert.equal(difficulty(0), 0);
  assert.equal(difficulty(GATE.rampGates), 1);
  assert.equal(difficulty(999), 1);
  assert.ok(difficulty(10) > difficulty(5));
});

test('zones cycle endlessly and loops count up', () => {
  assert.equal(zoneOf(0), 0);
  assert.equal(zoneOf(GATE.gatesPerZone), 1);
  assert.equal(zoneOf(GATE.gatesPerZone * ZONES.length), 0);
  assert.equal(loopOf(GATE.gatesPerZone * ZONES.length - 1), 0);
  assert.equal(loopOf(GATE.gatesPerZone * ZONES.length), 1);
});

test('speed rises with progress but the loop bonus is capped', () => {
  assert.equal(speedAt(0), PHYS.baseSpeed);
  assert.ok(speedAt(45) > speedAt(10));
  const cap = PHYS.baseSpeed + PHYS.speedGain + PHYS.maxLoopBonus * PHYS.loopSpeed;
  assert.equal(speedAt(100000), cap);
});

test('generated gates always fit on screen with a flyable gap', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const gates = course(seed, 150);
    gates.forEach((g, i) => {
      for (const t of [0, 0.4, 0.9, 1.7, 2.6, 3.3]) {
        const half = gateGap(g, t) / 2, cy = gateCenter(g, t);
        assert.ok(cy - half >= 40, `gate ${i} top edge too high (seed ${seed})`);
        assert.ok(cy + half <= GROUND - 40, `gate ${i} bottom edge too low (seed ${seed})`);
        assert.ok(gateGap(g, t) >= 4 * PHYS.birdR, `gate ${i} gap too tight (seed ${seed})`);
      }
      if (i > 0) assert.ok(Math.abs(g.wx - gates[i - 1].wx - spacingAt(i)) < 1e-6);
    });
  }
});

test('early gates are static, later ones mix in moving and pulsing types', () => {
  const gates = course(7, 200);
  assert.ok(gates.slice(0, 4).every(g => g.type === 'static'));
  const types = new Set(gates.map(g => g.type));
  assert.deepEqual([...types].sort(), ['move', 'pulse', 'static']);
  assert.equal(gates[0].wx, GATE.firstX);
});

test('the same seed always builds the same course', () => {
  assert.deepEqual(course(dailySeed('2026-10-06'), 60), course(dailySeed('2026-10-06'), 60));
  assert.notDeepEqual(course(1, 10), course(2, 10));
});

test('orbs lead into every gate but the first', () => {
  const rng = mulberry32(3);
  const [g0, g1] = course(3, 2);
  assert.deepEqual(makeOrbs(rng, g0), []);
  const orbs = makeOrbs(rng, g1);
  assert.ok(orbs.length >= 3 && orbs.length <= 5);
  assert.ok(orbs.every(o => o.k === 'orb' && o.wx < g1.wx && Number.isFinite(o.y)));
});

test('orb arcs never start inside the previous gate, even at the tightest spacing', () => {
  const gates = course(7919, 120);
  const rng = mulberry32(1);
  gates.forEach((g, i) => {
    const orbs = makeOrbs(rng, g);
    if (i === 0) return;
    const prevEnd = gates[i - 1].wx + gates[i - 1].w;
    assert.ok(orbs.every(o => o.wx > prevEnd + PHYS.birdR && o.wx < g.wx), `gate ${i}`);
  });
});

test('power-ups never appear in the opening gates and consume a fixed number of rolls', () => {
  const gates = course(11, 400);
  const rng = mulberry32(99), probe = mulberry32(99);
  const powers = gates.map(g => makePower(rng, g));
  gates.forEach(() => { probe(); probe(); });
  assert.equal(rng(), probe());
  assert.ok(powers.slice(0, 3).every(p => p === null));
  const found = powers.filter(Boolean);
  assert.ok(found.length > 20 && found.length < 120);
  assert.ok(found.every(p => ['shield', 'magnet', 'slow', 'double'].includes(p.k)));
});

test('drones only patrol between later gates and stay inside the playfield', () => {
  const gates = course(5, 400);
  const rng = mulberry32(8);
  const drones = gates.map((g, i) => makeDrone(rng, g, gates[i - 1] || null));
  assert.ok(drones.slice(0, DRONE.fromGate).every(d => d === null));
  const found = drones.filter(Boolean);
  assert.ok(found.length > 30);
  drones.forEach((d, i) => {
    if (!d) return;
    const line = (gates[i - 1].base + gates[i].base) / 2;
    for (const t of [0, 1, 2, 3, 4]) {
      const y = droneY(d, t);
      assert.ok(y >= 80 && y <= GROUND - 80);
      assert.ok(Math.abs(y - line) >= DRONE.lineGap - 1e-6, 'the direct line between gaps stays open');
    }
  });
});

test('judging: dash beats everything, near misses are perfect', () => {
  assert.equal(judgePass({ dashed: true, minClear: 3 }), 'phase');
  assert.equal(judgePass({ dashed: false, minClear: GATE.perfectPx - 1 }), 'perfect');
  assert.equal(judgePass({ dashed: false, minClear: GATE.perfectPx }), 'normal');
  assert.equal(judgePass({ dashed: false, minClear: -20 }), 'normal');
  assert.equal(judgePass({ dashed: false, minClear: Infinity }), 'normal');
});

test('scoring: combos grow perfect payouts, multipliers stack additively', () => {
  assert.equal(passPoints('normal', 0), 1);
  assert.equal(passPoints('phase', 3), 2);
  assert.equal(passPoints('perfect', 1), 2);
  assert.equal(passPoints('perfect', 4), 5);
  assert.equal(multiplier({ fever: false, double: false }), 1);
  assert.equal(multiplier({ fever: true, double: false }), 2);
  assert.equal(multiplier({ fever: true, double: true }), 3);
});

test('ranks and clearance', () => {
  assert.deepEqual([0, 34, 35, 80, 149, 150].map(rankOf), ['C', 'C', 'B', 'A', 'A', 'S']);
  assert.equal(clearance(100, 13, 50, 200), 37);
  assert.equal(clearance(190, 13, 50, 200), -3);
});
