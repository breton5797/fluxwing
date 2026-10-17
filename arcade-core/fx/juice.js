// Common game-feel helpers: screen shake, 60ms hitstop, collision flash, coin bounce.
function rnd(seed) { // deterministic noise for testable shake
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

export function shakeOffset(t, magnitude, duration, seed = 0) {
  if (t >= duration) return { x: 0, y: 0 };
  const k = magnitude * (1 - t / duration);
  return { x: rnd(seed + t * 61) * k, y: rnd(seed + 7 + t * 53) * k };
}

export function hitstop(now, ms = 60) {
  const until = now + ms;
  return { until, frozen: t => t <= until };
}

export function flashAlpha(t, duration) {
  return t >= duration ? 0 : 1 - t / duration;
}

// Overshoot to ~1.3x around t=0.15s, settle to 1 by t≈0.5s (damped spring-ish).
export function coinBounceScale(t) {
  return 1 + 0.35 * Math.exp(-6 * t) * Math.sin(10 * t);
}
