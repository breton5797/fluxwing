// XP-boost visuals: colored trail behind the unit + rising "+N XP" popups.
export function pushTrail(trail, point, max = 20) {
  const out = trail.length >= max ? trail.slice(trail.length - max + 1) : trail.slice();
  out.push(point);
  return out;
}

export function xpPopup(amount) {
  return Object.freeze({ text: `+${amount} XP`, vy: -40, life: 0.8 });
}
