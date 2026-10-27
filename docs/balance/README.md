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
- **AURORA was an outlier.** Its lane skill turns gates into sure Perfects, which this bot exploits fully. It is still hidden.
  - **Retuned on 2026-10-26** (stage 20, 30 runs):
    - the skill went from 8 gates every 12 s to 3 gates every 16 s;
    - the ultimate went from 6 s to 4 s.
  - **Before:** 1283 at form I.
  - **After:** form I 243 (TEMPEST 189, PULSAR 333) and form V 492 (TEMPEST 257, PULSAR 404). Best bound ratio 0.044.
  - It now sits at the top of the ultras instead of at 4–7 times them.
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

## Re-measure after the stage redesign (#105), 2026-10-27 (stage 20, 60 runs): `remeasure-s20-f0.json`, `remeasure-s20-f4.json`

The redesign moved stage 20 to CANYON RUN's gust stage, so every number above was taken on a different course. All units were measured again on the new stage 20, at form I and form V.

**A course trap came first.** The first batch had NIMBUS at 4.9 gates, BUZZ at 14 and VALKYRIE at 13.6, while the same units cleared stages 19 and 21. On stage 20's seeded course, gates 5 and 18 sit 85 and 82 px below the gate before, behind an **up**-gust. The gust takes 450 px/s² off gravity, so a light unit (NIMBUS 980, BUZZ 1250) cannot get down in time and hits the top of the gap. The bot had already stopped flapping. On random courses of the same stage the units cleared normally (BUZZ 83%, VALKYRIE 78%).
- **Fix:** an up-gust before a gate more than `SIG.gust.fall` (40 px) lower now blows down instead (`stLay`). The rolls and the heights do not change, only those gusts' direction. Test: `tests/stages.test.js`, "an up-gust never sits before a gate far below".
- **Seeded clear rates, stage 20, before → after (40 runs):** BUZZ 8% → 95%, VALKYRIE 30% → 55%, VOLT 63% → 83%, NIMBUS 0% → 18%.

The table below is with the fix. The new stage 20 scores higher across the board (common ~32 → ~54), so compare the ladder, not the old absolute targets.

| Rank | Form I mean | Form V mean | Units, form I / V |
|---|---|---|---|
| common | 54 | 73 | volt 70/76 · blitz 58/94 · **nimbus 17/26** · titan 69/96 |
| epic | 76 | 86 | mochi 63/84 · pixel 105/106 · neko 57/78 · buzz 77/78 |
| legendary | 110 | 125 | phoenix 98/125 · zero 170/186 · raijin 73/72 · chrono 115/127 · goliath 110/127 · monarch 95/113 |
| mythic | 264 | 346 | aegis 226/229 · kraken 106/121 · specter 335/569 · oracle 391/463 |
| ultra | 330 | 403 | solaris 128/218 · **pulsar 527/708** · tempest 222/334 · pleiad 199/186 · **aurora 572/569** (hidden) |
| celestial | 200 | 531 | seraph 161/602 · valkyrie 297/444 · lumen 113/613 · halcyon 228/466 |
| nebula | 280 | 703 | quasar 290/698 · comet 212/559 · zodiac 318/874 · eclipse 301/682 |
| void | 358 | 1012 | singular 395/825 · **rift 492/1751** · nyx 228/644 · entropy 317/829 |
| divine | 406 | 754 | archon 430/909 · ouroboros 343/820 · kirin 279/495 · garuda 572/793 |
| genesis | 361 | 1014 | aeon 378/969 · cosmos 290/963 · infinity 336/985 · omega 441/1138 |

Highest bound ratio: 0.13 (archon, form V). Every run stays under the 0.25 the release checklist asks for.

Notes (noise is still about ±20–25% per unit at 60 runs, so these are flags, not tuning):
- **NIMBUS is far below the other commons** (17 vs 58–70) and is a starter unit. It also clears only 33% of stage 19, which has no gust. Up-gusts push it into the ceiling (stage 21: 0%). This is the unit, not the course.
- **The ladder is not monotonic any more:**
  - mythic (264) is above celestial (200) at form I;
  - void (1012) is above divine (754) at form V, mostly from RIFT's 1751;
  - genesis (361) is below divine (406) at form I.
- **PULSAR** (open ultra) at 527/708 is 4× SOLARIS. The open ultras' mean (~330 form I) is now above celestial's form I.
- Re-check the hidden ranks against this table, not the stage-20 numbers above, before each release PR.
