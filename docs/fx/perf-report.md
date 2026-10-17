# FX performance report

Method: `scripts/fx-bench.mjs` — Playwright Chromium, viewport 390×844 dpr 2,
CDP CPU throttle 4×, `FW.hold` then 200 direct `FW.dbg.render()` calls right
after a skill cast. avg is skewed by first-frame outliers (GC/decoder); p95 is
the gating number (AC4: high ≤ +2.0ms, low ≤ +0.5ms vs Before).

## Before (base 5f77af5, no fx-core)

| run | avgMs | p95Ms |
|---|---|---|
| 1 | 26.254 | 2.300 |
| 2 | 23.774 | 2.000 |
| 3 | 25.279 | 2.200 |
| **median** | 25.279 | **2.200** |

## After

(filled in Task 6)
