// A simple autopilot used to prove generated courses are actually flyable.
import { DRONE, GROUND, PHYS } from '../../src/config.js';
import { droneY, gateCenter, gateGap } from '../../src/logic.js';
import { createGame, step } from '../../src/sim.js';

const R = PHYS.birdR;

// Pass a nearby drone on whichever side the next gate lies.
function avoidDrone(g, floor, cy) {
  const dr = g.drones.find(d => !d.dead && d.wx > g.dist - 30 && d.wx < g.dist + 130);
  if (!dr) return floor;
  const dy = droneY(dr, g.t);
  const reach = DRONE.r + R + 14;
  return cy < dy ? Math.min(floor, dy - reach - 20) : Math.max(floor, dy + reach + 76);
}

export function botInput(g) {
  const b = g.bird;
  const gate = g.gates.find(gt => !gt.scored);
  const half = gateGap(gate, g.t) / 2;
  const cy = gateCenter(gate, g.t);
  const near = gate.wx - g.dist < 70;
  const line = near ? cy + half - R - 12 : cy + 22;
  const floor = Math.min(near ? line : avoidDrone(g, line, cy), GROUND - R - 20);
  // Tap rhythm: one flap per bounce normally, rapid taps when far below the line.
  const flap = b.y > floor && b.vy > (b.y > floor + 60 ? -300 : -60);
  const dash = g.dashMeter >= 1 && gate.wx - g.dist < 40 && gate.wx - g.dist > 0;
  return { flap, dash };
}

/** Fly until the run ends or `seconds` of sim time elapse. */
export function flyBot(seed, seconds = 90, mode = 'classic') {
  const g = createGame({ seed, mode });
  const ticks = Math.round(seconds / PHYS.step);
  for (let i = 0; i < ticks && g.phase === 'play'; i++) step(g, PHYS.step, botInput(g));
  return g;
}
