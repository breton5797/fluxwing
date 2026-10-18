# FX inventory — before the impact upgrade (baseline)

Engine: vanilla Canvas 2D, single-file `index.html` (main IIFE). No renderer library.
Measured on branch `feat/fx-impact` base `5f77af5` (post-revert main).

## Existing effect systems (line references)

| System | Where | Notes |
|---|---|---|
| hitstop | `hitstop` global :1192, applied `rdt *= .05` :1922 | literals .06 (Perfect) / .14 (death) / .18–.2 (revive/rewind) |
| camera shake | `shake` :1192, random `(Math.random()-.5)*sk` in render :2177 | scalar, non-directional; RM → 0 |
| camera zoom | `cam {z,tz}` :1196, lerp :1939 | punch via `cam.z = max(...)` at perfect/dash/death |
| white flash | `flash` :1192, draw :2306 (`flash*.35`) | white only |
| slow motion | `slowT` power-up :1201, target blend :1923; dying ×.35 :1925 | gameplay slow-mo only |
| particles | `parts` array cap 400 :1759, push+filter :1949 | per-frame array realloc; unit FX push directly |
| rings | `rings` cap 30 :1761, shadowBlur 12 draw :2266 | |
| score pops | `pops` :1760, render :2280 | linear scale pop |
| banners | `banners` :1762 | slanted band + glow text |
| ghosts/trail | `ghosts` lighter :2271, `trail` tier-coloured :2255 | |
| fever edge glow | `feverGlow` :2309–2313 | hue-cycling screen border |
| vignettes | hurt :2294, danger :2301 | red radial gradients |
| speedlines | dash/fever lines :2205 | full-screen horizontal streaks |
| SFX | WebAudio synth `SFX` :1120, `tone()` :1104 | no sample files |
| haptics | `HAPTIC` table :1142, `haptic()` :1144, toggle `#vibBtn` | |

## Per-event effects today

| Event | Layers used today |
|---|---|
| flap | squash=1, 5 wing particles, SFX.flap, haptic flap |
| gate pass (plain) | +1 score, SFX.pass |
| Perfect (near-miss) | hitstop .06, flash .18, shake 4, cam 1.035, exit ring, pop, 16 particles, SFX.perfect |
| dash gate break | shards 28, ring, shake 10, SFX.shatter, haptic shatter |
| shield hit | shards 22, ring, shake 10, flash .3, pop, 20 particles, SFX.shield — **no hitstop** |
| shields visual | hex rings per shield :2859 (same colour family, alternating spin) |
| speed states (dash/potion/rush) | speedlines, trail widens, screen vignette (dash) |
| death | shake 18, flash .6, hitstop .14, cam 1.32, 46 particles, SFX.die, haptic death |
| new record (in-run) | banner, SFX.fanfare, haptic newBest, confetti 46 |
| coin (orb) | magnet pull, 6 particles, SFX.orb |
| fever enter | banner, SFX.fever, flash .5, ring |
| combo break | pop "COMBO BREAK", banner feverEnd, SFX.pass only |

## Baseline frame cost

See `perf-report.md` (Before table) — recorded with `scripts/fx-bench.mjs` before any fx-core change.
