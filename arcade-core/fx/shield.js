// Shield aura: one rotating ring per equipped layer; a hit breaks one layer into hex shards.
import { makeParticle } from './particles.js';

const RING_SPEED = 1.6; // rad/s

export function ringPhases(t, layers) {
  const out = [];
  for (let i = 0; i < layers; i++) out.push(t * RING_SPEED + (i * 2 * Math.PI) / Math.max(1, layers));
  return out;
}

// 6 shards per layer broken, flying outward along hex directions.
export function hexBurst(x, y, layers = 1) {
  const out = [];
  for (let l = 0; l < layers; l++) for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 2 * Math.PI + l * 0.3;
    const sp = 120 + l * 40;
    out.push(makeParticle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.45, g: 260, size: 5, shape: 'hex' }));
  }
  return out;
}

export function shieldHit(state, at) {
  const layers = Math.max(0, (state.layers | 0) - 1);
  return { ...state, layers, burst: hexBurst(at.x, at.y, 1) };
}
