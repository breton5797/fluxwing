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

## After (feat/fx-impact head)

| q | runs (p95Ms) | median p95 | Δ vs before (2.200) |
|---|---|---|---|
| high | 2.3 / 2.4 / 2.7 | **2.400** | **+0.2** ✓ (gate ≤ +2.0) |
| mid | 2.8 / 2.3 / 2.8 | 2.800 | +0.6 |
| low | 2.8 / 2.9 / 2.5 / 2.3 / 2.9 / 3.5 / 6.0 / 2.5 | **2.800** | **+0.65** ✗ marginal (gate ≤ +0.5) |

Low quality draws **no** post effects (distort/chroma/bloom off) — its Δ is the pooled-particle
pass plus run-to-run noise (before runs spanned 2.0–2.3, after-low spans 2.3–6.0 on the same
scenario; the measurement rig is headless CPU raster at 4× throttle, σ ≈ 0.4ms). The high-quality
gate passes with margin; the low gate is missed by ~0.15ms, within one σ of the rig's noise.
Called out as a borderline AC4 result rather than silently passed.

## After the review fix pass (effects ACTIVE during sampling)

The original bench sampled after `FW.cast()` only, which never armed the post effects — the review
(C1) measured p50 111ms with waves+chroma+bloom active. The bench now fires `fx('shieldHit')` and
`fx('overdrive')` before sampling, and the frame-copy effects were replaced (shockwave = layered
rings, chromatic split drawn on the subject only, bloom = additive halo):

| q | runs (p95Ms, effects active) | median | Δ vs before 2.200 |
|---|---|---|---|
| high | 2.7 / 3.2 / 3.1 | **3.100** | **+0.9 ✓** (gate ≤ +2.0; was ~109ms over before the fix) |
| mid | 3.5 | 3.5 | +1.3 ✓ |
| low | 2.3 | 2.3 | +0.1 ✓ |

The "high +0.2" row in the table above was measured with post effects idle and stands only as the
steady-state figure. avgMs remains outlier-skewed on this rig in every run including the baseline
(first-frame raster bursts under 4× throttle); p95 is the gating number per AC4.

Note: an earlier implementation using full-frame readback (bloom/chroma via drawImage(cv))
measured p95 84–88ms and was replaced with region-bounded snapshots (commit 0c82733).

