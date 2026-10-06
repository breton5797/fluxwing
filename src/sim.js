// Headless game simulation. Deterministic for a given seed + input sequence at a fixed step,
// which is what makes the daily course identical for everyone and lets tests fly a bot through it.
// The run state is mutated in place by step(): it is a hot loop running 120 times a second.
import { DRONE, FEVER, GATE, GROUND, METER, PHYS, POWER, REVIVE } from './config.js';
import {
  clearance, droneY, gateCenter, gateGap, judgePass, makeDrone, makeGate, makeOrbs, makePower,
  multiplier, passPoints, speedAt, zoneOf, loopOf,
} from './logic.js';
import { mulberry32 } from './rng.js';

const R = PHYS.birdR;

/**
 * @param {{ seed: number, mode?: 'classic' | 'daily' }} opts
 */
export function createGame({ seed, mode = 'classic' }) {
  const g = {
    mode, seed, rng: mulberry32(seed), phase: 'play', t: 0, dist: 0, deadT: 0, timeScale: 1,
    bird: { y: PHYS.startY, vy: 0, rot: 0, wing: 0 },
    gates: [], orbs: [], drones: [], events: [], lastGate: null, spawned: 0,
    score: 0, passed: 0, combo: 0, maxCombo: 0, perfects: 0, orbCount: 0, dashGates: 0, droneKills: 0,
    dashMeter: 0, dashT: 0, invuln: 0, shield: false, magnetT: 0, slowT: 0, doubleT: 0, feverT: 0,
    revived: false,
  };
  ensureSpawn(g);
  return g;
}

const emit = (g, type, data) => g.events.push({ type, ...data });
const mult = g => multiplier({ fever: g.feverT > 0, double: g.doubleT > 0 });
const overlapsX = (g, o) => g.dist + R > o.wx && g.dist - R < o.wx + o.w;
const inGateColumn = g => g.gates.some(gt => overlapsX(g, gt));

function ensureSpawn(g) {
  while (!g.lastGate || g.lastGate.wx < g.dist + GATE.spawnAhead) {
    const prev = g.lastGate;
    const gate = makeGate(g.rng, g.spawned, prev);
    g.gates.push(gate);
    g.orbs.push(...makeOrbs(g.rng, gate));
    const power = makePower(g.rng, gate);
    if (power) g.orbs.push(power);
    const drone = makeDrone(g.rng, gate, prev);
    if (drone) g.drones.push(drone);
    g.lastGate = gate;
    g.spawned++;
  }
}

function cull(g) {
  const edge = g.dist - GATE.cullBehind;
  if (g.gates.length && g.gates[0].wx < edge) g.gates = g.gates.filter(o => o.wx >= edge);
  if (g.orbs.some(o => o.got || o.wx < edge)) g.orbs = g.orbs.filter(o => !o.got && o.wx >= edge);
  if (g.drones.some(o => o.dead || o.wx < edge)) g.drones = g.drones.filter(o => !o.dead && o.wx >= edge);
}

function applyInput(g, input) {
  if (input.dash && g.dashMeter >= 1 && g.dashT <= 0) {
    g.dashMeter = 0;
    g.dashT = PHYS.dashTime;
    g.bird.vy = 0;
    emit(g, 'dash');
  }
  if (input.flap && g.dashT <= 0) {
    g.bird.vy = PHYS.flapVy;
    g.bird.wing = 1;
    emit(g, 'flap');
  }
}

// Dash and invulnerability never run out while the bird is inside a gate column,
// so neither can strand the player inside a wall.
function holdInColumn(g, value) {
  return value <= 0 && inGateColumn(g) ? 0.001 : Math.max(0, value);
}

function tickTimers(g, dt, rdt) {
  if (g.dashT > 0) {
    g.dashT = holdInColumn(g, g.dashT - dt);
    if (g.dashT === 0) g.invuln = Math.max(g.invuln, 0.15);
  }
  if (g.invuln > 0) g.invuln = holdInColumn(g, g.invuln - dt);
  g.magnetT = Math.max(0, g.magnetT - dt);
  g.doubleT = Math.max(0, g.doubleT - dt);
  g.slowT = Math.max(0, g.slowT - rdt);
  if (g.feverT > 0) {
    g.feverT = Math.max(0, g.feverT - dt);
    if (g.feverT === 0) emit(g, 'feverEnd');
  }
}

function breakShield(g) {
  g.shield = false;
  g.invuln = 1.1;
  emit(g, 'shieldBreak');
}

function kill(g) {
  g.phase = 'dying';
  g.deadT = 0;
  emit(g, 'die');
}

// Returns false when the hit was fatal.
function takeHit(g) {
  if (g.invuln > 0) return true;
  if (g.shield) { breakShield(g); return true; }
  kill(g);
  return false;
}

function moveBird(g, dt) {
  const b = g.bird;
  const dashing = g.dashT > 0;
  if (dashing) b.vy *= 0.85; else b.vy = Math.min(b.vy + PHYS.gravity * dt, PHYS.maxVy);
  b.y += b.vy * dt;
  const lean = dashing ? 0 : Math.max(-0.55, Math.min(1.3, b.vy / 560));
  b.rot += (lean - b.rot) * Math.min(1, dt * 10);
  b.wing = Math.max(0, b.wing - dt * 5);
  if (b.y < R) { b.y = R; b.vy = Math.max(0, b.vy); }
  if (b.y <= GROUND - R) return true;
  b.y = GROUND - R;
  if (g.invuln > 0 || g.shield) {
    if (g.invuln <= 0) breakShield(g);
    b.vy = -520;
    return true;
  }
  kill(g);
  return false;
}

function scoreGate(g, gate) {
  gate.scored = true;
  g.passed++;
  const kind = judgePass(gate);
  if (kind === 'perfect') {
    g.combo++;
    g.perfects++;
    g.maxCombo = Math.max(g.maxCombo, g.combo);
    g.dashMeter = Math.min(1, g.dashMeter + METER.perfect);
    if (g.combo % FEVER.combo === 0) { g.feverT = FEVER.time; emit(g, 'fever'); }
  } else if (kind === 'phase') {
    g.dashGates++;
  } else {
    if (g.combo > 1) emit(g, 'comboBreak');
    g.combo = 0;
    g.dashMeter = Math.min(1, g.dashMeter + METER.pass);
  }
  const pts = passPoints(kind, g.combo) * mult(g);
  g.score += pts;
  emit(g, 'pass', { kind, pts, combo: g.combo, wx: gate.wx + gate.w });
  const zone = zoneOf(g.passed);
  if (zone !== zoneOf(g.passed - 1)) emit(g, 'zone', { zone, loop: loopOf(g.passed) });
}

function stepGates(g) {
  const y = g.bird.y;
  for (const gate of g.gates) {
    if (gate.scored) continue;
    if (overlapsX(g, gate)) {
      if (g.dashT > 0) {
        gate.dashed = true;
      } else {
        const half = gateGap(gate, g.t) / 2;
        const cy = gateCenter(gate, g.t);
        const clear = clearance(y, R, cy - half, cy + half);
        gate.minClear = Math.min(gate.minClear, clear);
        if (clear < 0 && !takeHit(g)) return false;
      }
    }
    if (g.dist - R > gate.wx + gate.w) scoreGate(g, gate);
  }
  return true;
}

function stepDrones(g) {
  for (const dr of g.drones) {
    if (dr.dead) continue;
    const dy = droneY(dr, g.t);
    if (Math.hypot(g.dist - dr.wx, g.bird.y - dy) >= R + DRONE.r) continue;
    if (g.dashT > 0) {
      dr.dead = true;
      g.droneKills++;
      const pts = DRONE.points * mult(g);
      g.score += pts;
      g.dashMeter = Math.min(1, g.dashMeter + METER.drone);
      emit(g, 'droneKill', { pts, wx: dr.wx, y: dy });
    } else if (!takeHit(g)) {
      return false;
    }
  }
  return true;
}

function collect(g, o) {
  o.got = true;
  if (o.k === 'orb') {
    g.orbCount++;
    g.dashMeter = Math.min(1, g.dashMeter + METER.orb);
  } else if (o.k === 'shield') {
    g.shield = true;
  } else if (o.k === 'magnet') {
    g.magnetT = POWER.magnet;
  } else if (o.k === 'slow') {
    g.slowT = POWER.slow;
  } else if (o.k === 'double') {
    g.doubleT = POWER.double;
  }
  emit(g, o.k === 'orb' ? 'orb' : 'power', { kind: o.k, wx: o.wx, y: o.y });
}

function stepOrbs(g, dt) {
  for (const o of g.orbs) {
    if (o.got) continue;
    o.t += dt;
    if (o.gate) { o.wx = o.gate.wx + o.gate.w / 2; o.y = gateCenter(o.gate, g.t); }
    const dx = g.dist - o.wx;
    const dy = g.bird.y - o.y;
    const d = Math.hypot(dx, dy) || 1;
    if (g.magnetT > 0 && o.k === 'orb' && d < 190) {
      const pull = Math.min(d, 520 * dt);
      o.wx += (dx / d) * pull;
      o.y += (dy / d) * pull;
    }
    if (d < R + (o.k === 'orb' ? 10 : 16)) collect(g, o);
  }
}

function stepDying(g, rdt) {
  const dt = rdt * 0.35;
  const b = g.bird;
  g.deadT += rdt;
  b.vy += 1600 * dt;
  b.y = Math.min(GROUND - R, b.y + b.vy * dt);
  b.rot += 8 * dt;
  g.dist += 30 * dt;
  if (g.deadT > 1.1) g.phase = 'over';
}

/**
 * Advance the run by one tick. `input` is read, never modified.
 * @param {ReturnType<typeof createGame>} g
 * @param {number} rdt real seconds for this tick (use PHYS.step)
 * @param {{ flap?: boolean, dash?: boolean }} input
 */
export function step(g, rdt, input = {}) {
  if (g.phase === 'over') return;
  if (g.phase === 'dying') { stepDying(g, rdt); return; }
  g.timeScale += ((g.slowT > 0 ? 0.6 : 1) - g.timeScale) * Math.min(1, rdt * 6);
  const dt = rdt * g.timeScale;
  g.t += dt;
  applyInput(g, input);
  tickTimers(g, dt, rdt);
  g.dist += currentSpeed(g) * dt;
  if (!moveBird(g, dt)) return;
  ensureSpawn(g);
  if (!stepGates(g)) return;
  if (!stepDrones(g)) return;
  stepOrbs(g, dt);
  cull(g);
}

export const currentSpeed = g => speedAt(g.passed) * (g.dashT > 0 ? PHYS.dashMul : 1);

export const canRevive = g => g.phase === 'over' && !g.revived && g.score >= REVIVE.minScore;

/** Put a finished run back in the air, once. Returns false if the run is not revivable. */
export function revive(g) {
  if (!canRevive(g)) return false;
  const next = g.gates.find(gt => !gt.scored);
  g.revived = true;
  g.phase = 'play';
  g.deadT = 0;
  g.bird = { y: next ? gateCenter(next, g.t) : PHYS.startY, vy: PHYS.flapVy * 0.6, rot: 0, wing: 1 };
  g.combo = 0;
  g.dashT = 0;
  g.invuln = REVIVE.invuln;
  g.drones = g.drones.filter(dr => dr.wx < g.dist - 40 || dr.wx > g.dist + 420);
  emit(g, 'revive');
  return true;
}

/** Immutable snapshot of the numbers the meta layer cares about. */
export function summarize(g) {
  return Object.freeze({
    mode: g.mode, seed: g.seed, score: g.score, gates: g.passed, perfects: g.perfects, maxCombo: g.maxCombo,
    orbs: g.orbCount, dashGates: g.dashGates, droneKills: g.droneKills, zone: zoneOf(g.passed), revived: g.revived,
  });
}

export function drainEvents(g) {
  const out = g.events;
  g.events = [];
  return out;
}
