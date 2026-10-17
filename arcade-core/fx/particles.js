// Shared particle rules: pure stepping, no renderer coupling. Reused across arcade games.
export function makeParticle({ x, y, vx = 0, vy = 0, life = 1, g = 0, size = 3, color = '#fff', shape = 'dot' }) {
  return Object.freeze({ x, y, vx, vy, life, g, size, color, shape });
}

export function stepParticles(list, dt) {
  const out = [];
  for (const p of list) {
    const life = p.life - dt;
    if (life <= 0) continue;
    const vy = p.vy + p.g * dt;
    out.push({ ...p, x: p.x + p.vx * dt, y: p.y + vy * dt, vy, life });
  }
  return out;
}

// Low-spec mode halves particle counts (never below 1).
export function spawnCount(n, lowSpec) {
  return lowSpec ? Math.max(1, Math.ceil(n / 2)) : n;
}
