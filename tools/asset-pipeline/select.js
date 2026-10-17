// Pure scoring rules for picking the best of N generated unit images.
// A candidate is { w, h, a: Uint8Array alpha, l: Uint8Array luminance } (row-major).
const OPAQUE = 128;   // alpha at/above this counts as part of the silhouette
const DARK = 60;      // luminance below this counts as outline ink

function opaque(g, x, y) { return g.a[y * g.w + x] >= OPAQUE; }

// Fraction of border pixels that are opaque — nonzero means the subject is cropped.
export function edgeTouchRatio(g) {
  let touch = 0, total = 0;
  for (let x = 0; x < g.w; x++) { total += 2; if (opaque(g, x, 0)) touch++; if (opaque(g, x, g.h - 1)) touch++; }
  for (let y = 1; y < g.h - 1; y++) { total += 2; if (opaque(g, 0, y)) touch++; if (opaque(g, g.w - 1, y)) touch++; }
  return touch / total;
}

// Peaks for a solid centered mass around 20–60% coverage; falls off for specks and full-bleed.
export function silhouetteScore(g) {
  let n = 0, cx = 0, cy = 0;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) if (opaque(g, x, y)) { n++; cx += x; cy += y; }
  if (!n) return 0;
  const coverage = n / (g.w * g.h);
  // triangular response: 0 at 0%, 1 at 40%, 0 at 95%
  const cov = coverage <= 0.4 ? coverage / 0.4 : Math.max(0, (0.95 - coverage) / 0.55);
  const dx = Math.abs(cx / n - (g.w - 1) / 2) / g.w, dy = Math.abs(cy / n - (g.h - 1) / 2) / g.h;
  const centered = Math.max(0, 1 - 2 * (dx + dy));
  return cov * centered;
}

// Share of silhouette boundary pixels that are inked dark — bold outline reads well in-game.
export function outlineScore(g) {
  let boundary = 0, inked = 0;
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    if (!opaque(g, x, y)) continue;
    const onEdge = x === 0 || y === 0 || x === g.w - 1 || y === g.h - 1 ||
      !opaque(g, x - 1, y) || !opaque(g, x + 1, y) || !opaque(g, x, y - 1) || !opaque(g, x, y + 1);
    if (!onEdge) continue;
    boundary++;
    if (g.l[y * g.w + x] < DARK) inked++;
  }
  return boundary ? inked / boundary : 0;
}

export function scoreCandidate(g) {
  return silhouetteScore(g) * 0.5 + outlineScore(g) * 0.3 - edgeTouchRatio(g) * 2;
}

export function selectBest(candidates) {
  let best = 0, bestScore = -Infinity;
  candidates.forEach((g, i) => { const s = scoreCandidate(g); if (s > bestScore) { bestScore = s; best = i; } });
  return best;
}
