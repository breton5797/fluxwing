# Unit balance

How strong each unit is in stage mode, measured by `scripts/balance.mjs`. The same bot flies every unit. It aims at each gap's centre with a Gaussian error (`--aim`, default 6 px), dashes when the meter is full, and casts the skill and ultimate when ready. The numbers compare units, not players: a real player scores much more, but the order should hold.

```
npm run dev                                   # another terminal
node scripts/balance.mjs --stage 20 --runs 12 --form 0 --out docs/balance/baseline-s20-f0.json
node scripts/balance.mjs --units seraph,lumen --runs 30   # just a few units
```

`bound` is the best run's score divided by the server's endless limit, `3g² + 75g` (`fw_submit_score` in supabase/schema.sql). Above 1, the server would refuse that run. Every unit must stay well under it, at any form.

## Baseline, 2026-10-26 (stage 20, 12 runs, form I): `baseline-s20-f0.json`

| Rank | Units (mean score) | Rank mean |
|---|---|---|
| common | volt 38 · blitz 29 · nimbus 16 · titan 44 | ~32 |
| epic | mochi 42 · pixel 48 · neko 38 · buzz 43 | ~43 |
| legendary | phoenix 51 · zero 109 · raijin 37 · chrono 73 · goliath 52 · monarch 61 | ~64 |
| mythic | aegis 107 · kraken 70 · specter 90 · oracle 222 | ~122 |
| ultra | solaris 105 · pulsar 192 (open) · tempest 185 · pleiad 131 (hidden) · **aurora 1160 (hidden)** | ~149 (open units) |

Highest bound ratio: aurora 0.104. Everything else stays at or below 0.051.

Notes:
- **AURORA is an outlier.** Its lane skill turns gates into sure Perfects, which this bot exploits fully. It is hidden today. Retune it before it is released.
- **ORACLE** (mythic, 222) is already above the open ultras' mean. Its foresight saves runs, so it gets more gates and a longer combo.
- Each rank's mean rises by about x1.3 to x1.9 on the way up to ultra. Within a rank, the spread is wide (legendary 37 to 109).

## Target ladder for the ranks above ultra

Each rank's mean is about 11% above the one below, starting from the open ultras (~149). Each evolution form adds about 5%. A unit may sit ±15% around its rank's target: the four units of a rank differ in style (Perfect, dash, combo, special), not in strength.

| Rank | Score mastery (form I → V) | Target mean, form I |
|---|---|---|
| 5 celestial | ×1.10 → ×1.30 | ~165 |
| 6 nebula | ×1.20 → ×1.40 | ~184 |
| 7 void | ×1.30 → ×1.50 | ~204 |
| 8 divine | ×1.40 → ×1.60 | ~226 |
| 9 genesis | ×1.50 → ×1.70 | ~251 |

A rank's PR is ready when its four units are on target at form I and form V, and the best run's bound ratio stays below 0.25.

## Rank 5 · celestial (P1), 2026-10-26 (stage 20, 60 runs): `tier5-s20-f0.json`, `tier5-s20-f4.json`

| Unit | Form I | Form V | Best bound ratio (V) |
|---|---|---|---|
| seraph | 138 | 369 | 0.090 |
| valkyrie | 195 | 336 | 0.029 |
| lumen | 113 | 527 | 0.115 |
| halcyon | 145 | 454 | 0.178 |
| **rank mean** | **148** (target ~165) | **422** (target ~410) | |

The open ultras at form V, for reference: solaris 182, pulsar 444 (mean ~313).

- **Form V is on target.** Celestial is about 35% above the open ultras, which is about the rank step × mastery the design asks for.
- **Form I sits about 10% under target**, roughly level with the open ultras (~149). The difference shows at the higher forms, as intended for "grows with the unit's level".
- **Run-to-run noise is about ±20–25% at 60 runs.** The same settings gave seraph 161 and 122 at form I in two batches. Do not tune on one batch, and compare rank means rather than single units.
- **LUMEN scales the most** (form I ~113–138, form V ~410–550). Its combo-keep passive turns longer runs into much longer combos. Re-check it with players before rank 5 is released.
- **All runs stay at or below 0.18 of the server bound** (3g² + 75g). Re-derive the bound with the next ranks' numbers before the first rank above ultra is released.

## Rank 6 · nebula (P2), 2026-10-26 (stage 20, 60 runs): `tier6-s20-f0.json`, `tier6-s20-f4.json`

| Unit | Form I | Form V | Best bound ratio (V) |
|---|---|---|---|
| quasar | 169 | 610 | 0.159 |
| comet | 172 | 513 | 0.226 |
| zodiac | 235 | 674 | 0.072 |
| eclipse | 137 | 503 | 0.047 |
| **rank mean** | **178** (target ~165–185) | **575** (target ~470) | |

- **Form I is on target**, about 20% above celestial's measured 148.
- **Form V overshoots by about 22%**: 575 against celestial's 422, about +36%.
  - Nebula grows more with form, through mastery ×1.20 → ×1.40, `formBonus` on all four, and the skills' +10%/+10%.
  - That fits "higher ranks gain more as the unit levels", but it is steeper than the 11% rung.
  - If rank 7 repeats the pattern, re-check the server bound (`3g² + 75g`) with these numbers first. The best run so far is 0.226 of it.
- **Two review fixes moved the numbers a lot:**
  - QUASAR's beam now carries over to gates not spawned yet, so it marks its full count on a narrow screen as well.
  - QUASAR and ZODIAC keep a wider window.

  Measure again after any change to them.
- **ZODIAC is the strongest unit at both forms**; ECLIPSE is the weakest at form I.

## Rank 7 · void (P3), 2026-10-26 (stage 20, 60 runs): `tier7-s20-f0.json`, `tier7-s20-f4.json`

| Unit | Form I | Form V | Best bound ratio (V) |
|---|---|---|---|
| singular | 204 | 449 | 0.077 |
| rift | 270 | 910 | 0.132 |
| nyx | 174 | 526 | 0.145 |
| entropy | 166 | 622 | 0.161 |
| **rank mean** | **204** (target ~198) | **627** (target ~640) | |

- **Both forms are on target.** The ladder so far, rank means at form I / V:
  - celestial: 148 / 422
  - nebula: 178 / 575
  - void: 204 / 627
- **RIFT is the noisiest unit.** Its form V was 700 and 910 in two batches; it ghosts through walls, so a run either ends early or goes very long.
- **The bot underrates units that chain Perfects.** The review showed NYX could pass the server bound on a long all-Perfect run: fog up about 80% of the time, ×3, sure gates. It was fixed by:
  - no skill charge from Perfects while NYX's fog or ENTROPY's chaos runs;
  - longer cooldowns;
  - fog Perfects ×2.

  Before `TIER_OPEN` reaches 7, re-derive the bound from a hand worst case, not from these bot numbers.

## Rank 8 · divine (P4), 2026-10-26 (stage 20, 60 runs): `tier8-s20-f0.json`, `tier8-s20-f4.json`

| Unit | Form I | Form V | Best bound ratio (V, rank share) |
|---|---|---|---|
| archon | 257 | 947 | 0.202 |
| ouroboros | 240 | 939 | 0.179 |
| kirin | 198 | 469 | 0.068 |
| garuda | 274 | 487 | 0.011 |
| **rank mean** | **242** (target ~226) | **710** (target ~700) | |

**The server bound is now per rank** (owner's decision, 2026-10-26). A run flown with a unit above ultra gets `3g² + 75g` times its rank's share (`private.fw_bound_mul`): 1.4 for celestial, rising through 1.5, 1.6 and 1.75 to 1.9 for genesis. Every other unit stays at ×1, and daily is unchanged.

**Why:** under the old shared bound, rank 8 stalled at void's level (199 / 561). Its multipliers stack on mastery ×1.6 and ran into the bound.

**Result:** with ARCHON back at ×1.6 and OUROBOROS's loops at +20%, divine is about 19% above void at form I and 13% above at form V.

`scripts/balance.mjs` reports the ratio against the unit's own share. The rank 5–7 tables above were measured against the old shared bound, so their ratios read high by 1.4–1.6×.

The ladder so far, rank means at form I / V:
- celestial: 148 / 422
- nebula: 178 / 575
- void: 204 / 627
- divine: 242 / 710

## Rank 9 · genesis (P5), 2026-10-26 (stage 20, 60 runs): `tier9-s20-f0.json`, `tier9-s20-f4.json`

| Unit | Form I | Form V | Best bound ratio (V, rank share) |
|---|---|---|---|
| aeon | 240 | 777 | 0.154 |
| cosmos | 338 | 806 | 0.145 |
| infinity | 338 | 835 | 0.104 |
| omega | 321 | 956 | 0.124 |
| **rank mean** | **309** (target ~251, ladder ~270) | **844** (ladder ~790) | |

Genesis is about 28% above divine at form I and 19% above at form V. Every best run stays at or below 0.154 of rank 9's ×1.9 share.

AEON reads low at form I (0.78 of the rank mean). Its Perfects grow with the time a run lasts, so the bot's short form-I runs undersell it. At form V it sits at 0.92.

The tuning went through five rounds. Only the levers not printed in the texts were moved:
- the scroll speed of all four (0.97–1.00);
- the skill and ultimate multiples, which reach the texts through `{m}`;
- COSMOS's window and cooldown;
- OMEGA's skill charge per Perfect.

AEON's first form-V best run hit 0.27 of its share, from its time bonus stacking on a ×2.5 skill. Its skill went back to ×2.25 and its ultimate to ×2.5.

The ladder, rank means at form I / V:
- celestial: 148 / 422
- nebula: 178 / 575
- void: 204 / 627
- divine: 242 / 710
- **genesis: 309 / 844**

**COSMOS: a constellation is now four stars** (`STAR_SET`, was five). Playtests on stage 48 found the payoff almost never came: the bot caught about a third of the stars and finished 2 constellations in 8 runs, even when chasing them.

Re-measured (stage 20, 60 runs):
- form I: 300;
- form V: 1017 and 908 in two batches;
- best bound ratio: 0.142 or less.

Earlier form-V batches ranged from 691 to 895, so the shift is within the bot's noise.

## Release of the ranks above ultra

### The server bound, derived by hand (2026-10-26)
A Perfect scores `(1 + combo + bonus) × fever × resonance × unitMul × mastery`.

With every gate a Perfect, combo grows by one per gate. So a run's score grows like `M·g²/2`, where `M = fever × resonance × unitMul × mastery`. The server allows `(3g² + 75g) × share`.

**A stage run does not end at its goal**; after the clear it carries on. So the limit that matters is the long-run ratio `M / (6 × share)`. It must stay under 1.

For each unit above epic, every factor was taken at its largest: form V mastery, the bonus +2 from forms, fever from the first gate, and every unit multiple maxed (COMET ×1.5, ECLIPSE's Corona ×3.5, NYX ×2, ENTROPY's roll ×3, ARCHON ×1.6, OUROBOROS ×1.6, AEON ×1.6, INFINITY ×2). Two cases:
- **Absolute:** the highest skill or ultimate multiple is on for the whole run, which no unit can do.
  - Over 1 in the long run: AEON 1.19, ECLIPSE 1.09, PULSAR 1.00 (an open ultra, live today).
  - Everyone else is under 1: ARCHON 0.98 is next, and the rest are 0.94 or lower.
  - Up to the longest stage goal (41 gates), every unit stays under 0.87.
- **Reachable:**
  - The skill multiple counts only while it can be up: its duration out of duration plus about 12 s of Perfects to recharge, since Perfects charge nothing during resonance.
  - The ultimate counts about once per 30 s.
  - ECLIPSE is taken with its skill's dark ×2 for the whole run, plus the Corona's ×3.5 for 8 s of every 30.
  - Result: every unit is at or below 0.75 in the long run (ECLIPSE 0.75, AEON 0.65).

**Conclusion:** the per-rank shares (×1.4 to ×1.9) need no change before any release. The bot's best runs (0.02–0.27 of share) agree.

### Schedule (recommended)
One rank every two weeks from the launch, each on a Tuesday:

| Release | Rank | Date |
|---|---|---|
| 1 | celestial (TIER_OPEN = 5) | 2026-11-17, with the launch |
| 2 | nebula (6) | 2026-12-01 |
| 3 | void (7) | 2026-12-15 |
| 4 | divine (8) | 2026-12-29 |
| 5 | genesis (9) | 2027-01-12 |

Releases are code changes, never device-date switches: there is no trusted server clock in the client, and a device clock can be moved.

### Checklist for one release (rank R)
1. Raise `TIER_OPEN` to R.
2. Remove `hidden:true` from rank R's four rows in `BIRDS`.
3. Drop the four ids from the self-test's `hiddenU` list.
4. In the tests:
   - raise `tests/tiers.test.js`'s `TIER_OPEN`;
   - in `tests/tierR.test.js`, expect the units visible;
   - in `tests/about.test.js`, add 4 to the visible-unit count.
5. Run `node scripts/about-build.mjs`, then `npm test` and `FW.selfTest()`.
6. Production needs nothing: `private.fw_units()` already lists all 20 ids, and `fw_bound_mul` already holds every rank's share.
