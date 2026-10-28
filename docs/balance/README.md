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

## Open ultras: PULSAR / SOLARIS gap closed, 2026-10-28 (stage 20)

Only levers the texts do not print were moved:
- **PULSAR:** skill cd 11 → 16 s, skill 6 → 4 s, ultimate 9 → 7 s (both durations reach the texts through `{n}`). The ×3 stays.
- **SOLARIS:** skill cd 15 → 12 s, scroll speed 1.08 → 0.98, window 18 → 20.

| Unit | Before, form I / V | After, 60 runs | After, 120 runs |
|---|---|---|---|
| solaris | 128 / 218 | 262 / 365 | 218 / 368 |
| pulsar | 527 / 708 | 300 / 408 | 250 / 332 |

- The gap went from 4.1× (form I) and 3.2× (form V) to about 1.15×.
- The open ultras now sit above mythic at both forms (60 runs: 311 / 372 against 264 / 346).

**The hidden ranks 5–9 are left for their release PRs** (owner's decision 2026-10-28). A tuning pass on branch `feat/ladder-tune` (commit f603764, not merged) shows why:
- Speed, window, cooldowns and TIER_MUL lift form I and form V by about the same factor. The ranks above ultra grow about 2.2–2.5× from form I to V (formBonus, skillBoost, EVO_BUFF), so fixing form I overshoots form V.
- TIER_MUL is already near its cap: it must stay at least 0.2 under the server's `fw_bound_mul`.
- The pass reached a partly rising ladder only with extreme values: OMEGA window 7, INFINITY scroll 0.68 and window 9. SERAPH's "wide Perfect window" text no longer held.
- Each release PR should re-design that rank's form growth (formBonus and its texts in 23 languages, or the server bound) instead. Start from the tables in that commit.

## Stage retune and SOLARIS on bosses (owner's decisions 1 and 4), 2026-10-28: `retune-2026-10-28.json`

**Target (owner):** ZERO at form I, on the seeded courses, 60 runs a stage, clears the bosses 10 / 25 / 40 / 50 at about 80 / 60 / 45 / 30% (±8 points). Measured with the dash-exit fix on main:

```
node scripts/balance.mjs --clear 5,10,15,20,25,30,35,40,45,50 --runs 60 --units zero,volt,solaris
```

`--clear` now also prints each stage's mean score (runs stop at the goal) and its deaths: what ended each failed run (the game's `deathWhy`, read through the QA getter `FW.why`) and how many gates it had passed. `--page` flies a copy of the game next to index.html, for tuning probes.

**Clear rate, form I, seeded, 60 runs, before → after:**

| Stage | ZERO | VOLT | SOLARIS |
|---|---|---|---|
| 5 ~ | 100 → 100 | 100 → 100 | 100 → 100 |
| **10 !** | 87 → **82** | 92 → 37 | 100 → 82 |
| 15 | 100 → 100 | 100 → 100 | 100 → 100 |
| 20 | 97 → 90 | 98 → 75 | 100 → 100 |
| **25 !** | 98 → **67** | 100 → 5 | 100 → 10 |
| 30 | 97 → 90 | 97 → 60 | 100 → 93 |
| 35 | 100 → 95 | 100 → 90 | 100 → 98 |
| **40 !** | 88 → **40** | 78 → 2 | 97 → 38 |
| 45 | 93 → 85 | 70 → 25 | 100 → 65 |
| **50 !** | 95 → **33** | 45 → 0 | 100 → 10 |

The batch noise is about ±12 points at 60 runs (the 95% intervals are in the JSON). Every batch flown with the final values, pooled, ZERO clears the bosses at:
- stage 10: **78%** (540 runs);
- stage 25: **62%** (300 runs);
- stage 40: **47%** (360 runs);
- stage 50: **29%** (540 runs).

**Only one lever moved: the gap.** Probes on stage 50 showed the others barely move the bot:
- a fall limit 20 or 40 px larger: 87% / 92%;
- moving and pulse shares doubled: 90%;
- hazard and obstacle chances doubled: 92%;
- the gap 40 px narrower: 60%.

The bot's flap lifts the bird about 74 px (flap² / 2·gravity). Once half the gap less the bird's radius comes near that height, every gate becomes a real risk. Before the retune, gaps were 196–250 px at the goal and zone 3 was flat (226 → 225).

**The levers changed** (`ST_BAND`, inside `stages:start`):

| Zone | gap, first → last stage (px) | boss cut `bg` (new, px) | boss gap |
|---|---|---|---|
| NEON GROVE | 256 → 250 ⇒ **256 → 240** | **28** | 250 ⇒ 212 |
| CANYON RUN | 248 → 226 ⇒ **236 → 198** | **27** | 226 ⇒ 171 |
| MAGMA CORE | 226 → 225 ⇒ **196 → 192** | **16** | 225 ⇒ 176 |
| SKY PALACE | 224 → 221 ⇒ **190 → 186** | **18** | 221 ⇒ 168 |

A boss now takes its zone's last gap less `bg`. Before, it had the same gap as the stage before it and was harder only through d0 +.02, shares ×1.2, hazards ×1.1 and obstacles ×1.3. Those multipliers are unchanged. So are d0, the move / pulse / hazard / obstacle / twin / fog numbers, the fall and climb limits in `stLay`, and the goals.

**What still holds (tests/stages.test.js):**
- one new element per stage;
- breathers easier than their neighbours (+8 px of gap);
- plain stages narrow monotonically across all 50;
- zone 2 narrows 2.7 px a stage;
- no gap under 128 px at the goal (stage 50: 149);
- the up-gust rule;
- the in-game `selfTest` curve.

New test: a boss is the narrowest gap of its stretch, `bg` per zone.

**Every seeded course from stage 2 on is different now.** The course rng's rolls are the same, but the heights are clamped by the gap, so the gates land elsewhere. Stage 1 keeps its course. This is acceptable before launch. Best scores and gates already stored for a stage were flown on the old course.

**ZERO's deaths at stage 50 (40 of 60 runs, seeded):** 39 top, 1 bottom. By gates passed: 0–9: 12, 10–19: 13, 20–29: 10, 30–39: 4, 40+: 1. They spread over the run, with no single trap gate (before the retune: 3 deaths, at gates 24, 26 and 42).

**Flag: the commons fall off a cliff on the bosses.** VOLT at form I clears 37 / 5 / 2 / 0% (5% on random courses of stage 50, 0–15% at form V). VOLT has ZERO's flap height but no skill that saves a hit. 14 of its 60 stage-50 runs end at gate 4 hitting the bottom: VOLT's own trap on that course, not ZERO's. The owner's target is set on ZERO, so this was left as it is. Before launch, a phone playtest of stages 25 / 40 / 50 with a common unit should decide whether the starters need a softer boss cut.

### SOLARIS on the boss stages (decision 4)

Form I, seeded, 60 runs, mean score (runs stop at the goal) / clear rate:

| Stage | ZERO | SOLARIS, Genesis 3.5 s | SOLARIS, 2 s on bosses (final) |
|---|---|---|---|
| 10 | 41 / 82% | 125 / 83% (3.0×) | 107 / 82% (2.6×) |
| 25 | 71 / 67% | 167 / 42% (2.1×) | 96 / 10% (1.4×) |
| 40 | 89 / 40% | 369 / 57% (3.7×) | 320 / 38% (3.6×) |
| 50 | 70 / 33% | 149 / 28% (2.2×) | 117 / 10% (1.7×) |

The 3.5 s column was flown just after the retune, with CANYON RUN's `bg` at 26 (final: 27).

After the retune SOLARIS's mean score was more than 2× ZERO's on every boss, so the owner's rule applied: **Genesis gives 2 s of invincibility on a boss stage** (`ULT.solaris.bossGod`, `ultGod`, `STAGES[curStage].boss`). Every other stage keeps 3.5 s, and COMET's Tail of Fire keeps its 5 s. The browser check reads godT 2 on stage 50 and 3.5 on stage 49. Test: `tests/solaris-boss.test.js`.

**The text:** `ud_solaris` printed "3.5" literally (only the coin rain reads `{n}`). All 23 languages now say both durations: "3.5s invincible (2s on ♛ boss stages)". ♛ is the boss mark on the stage map. The about page is rebuilt.

**Result:**
- The score ratio is still above 2× on stages 10 and 40. Genesis's score comes from the gates it burns, not from the invincibility, so the shorter god time mostly costs clear rate: SOLARIS now clears 10% of stages 25 and 50, where ZERO clears 67% and 33%.
- If the owner wants the score gap closed too, the lever is the burned gates' score (or `dur`), a separate decision. Another `bossGod` cut would only make SOLARIS lose more boss runs.

## Economy: replay cap, failed-run floor, invites, ads (owner's decisions 2026-10-28)

Prices are unchanged. Numbers live in `REPLAY` and `REF_CFG` (index.html) and `private.fw_ref_cfg` (supabase/schema.sql).

- **Daily replay bonus:** `REPLAY.dayN` 5 → 10 stages a day.
- **Failed-run floor:** a failed run on a stage not cleared yet is topped up to `failK` 0.35 × the stage's first-clear coins × (gates flown / goal). It shows as a "Distance bonus" pill.
  - It never pays on a stage cleared before. Past the replay cap, a clear there pays only its score coins, so a fail must not beat it.
  - Coin x2 doubles the run's field and score coins, not the floor.
- **Invite reward:** 30 gems → 15 gems + 10,000 coins per counted friend (25% of an epic unit's 40,000 coins). The 3/10/25 milestones still pay 50/150/500 gems.
- **Ads:** coin x2 is capped at `REPLAY.ad2xDay` = 5 a day. Daily x2 (ad) doubles the daily reward's coins and diamonds, never gems. Gems come only from clears (stars, evolution), invites and purchases.

Measured with a fresh-player bot (stages 1-2 cleared, VOLT, empty wallet, flying the highest open stage until STAGE 10 is cleared; 3 courses per aim):

| Bot aim | Runs (failed) | Coins / game-min before → after | Coins per failed run before → after |
|---|---|---|---|
| 16 px | 31 (7) | 1,305 → 1,337 (+2%) | 105 → 241 |
| 24 px | 54 (30) | 1,392 → 1,558 (+12%) | 94 → 232 |
| 32 px | 80 (56) | 1,391 → 1,651 (+19%) | 53 → 157 |
| 40 px | 164 (140) | 1,144 → 1,544 (+35%) | 41 → 119 |

The before and after numbers come from the same runs: each run read its "Distance bonus" pill. A clear on stages 3-10 paid 900–2,300 coins in the same runs. The largest failed run paid 543 coins (STAGE 8, 13 of 14 gates).


## Re-measure after 100-gate missions and boss fights, 2026-10-29 (main dd0a65e)

**Headline: the course is now the wall, not the boss.** ZERO at form I clears stage 1 at 93%, but stage 10 at 44% and stages 40/50 at 0%. It wins 96–100% of the boss fights it reaches on stages 10–30. Gates 46–100 fly at the stage's top difficulty (the `runD` plateau). At the narrow gaps from the 10-28 retune, 100 gates there are far more than this bot survives. VOLT clears nothing from stage 7 on except 14% of stage 15 and 5% of stage 20.

Files (form I, 100 runs a cell, 7 units × 11 stages):
- `remeasure-100-seeded.json`: the seeded courses, the headline;
- `remeasure-100-anyseed.json`: a new course each run;
- `remeasure-100-naive.json`: the course bot before this change (no reaction to branches or surprises);
- `remeasure-100-bossgo.json`: the boss fights alone (`--bossgo`), 100 fights a unit and boss;
- `remeasure-100-probe-g24.json` and `remeasure-100-probe-final.json`: lever probes (below).

```
PORT=5391 node scripts/serve.mjs     # another terminal
PORT=5391 node scripts/balance.mjs --clear 1,3,5,7,10,15,20,25,30,40,50 --units volt,nimbus,zero,mochi,aegis,solaris,pulsar --runs 100 --jobs 12 --out docs/balance/remeasure-100-seeded.json
PORT=5391 node scripts/balance.mjs --clear 10,20,30,40,50 --units … --runs 100 --jobs 12 --bossgo --out docs/balance/remeasure-100-bossgo.json
```

Each grid of 7,700 runs took 5.5 min with 12 pages.

**What changed in `scripts/balance.mjs`:**
- **The boss fight.** While `FW.boss` is set, the bot flies the scripted fight bot of `tests/e2e/boss-smoke.mjs`:
  - it keeps out of the beam band, the charge line, the volley's aim, and the paths of shots and minions;
  - it flies to the wall's hole;
  - it smashes a minion when the meter is full;
  - it rams when the meter is full and the boss is within 40 px of its height.

  The same Gaussian aim error (`--aim`, 6 px) sits on its target height, with a new error at every telegraph and after every dash. It does not use the course bot's every-0.25 s dash, since in a fight a dash is a ram.
- **A run ends as the game ends it.** That is the win (`FX.won`: the 100th gate, or the boss beaten), a death, or `--cap` 600 s. The clear rate is therefore a stage win.
- **Per run** (`list` in the JSON): gates, won, cause (`deathWhy`), fight seconds, boss HP left. **Per row:** boss reached / won / win rate given reached, fight length (won: mean and median; lost: mean), HP left when lost, and the causes of the losses.
- **The course bot reacts to what a player sees.** It does so after a 0.2 s reflex (`--react`), and `--naive` turns it off.
  - **A shaking branch:** the top of its flap cycle stays under the fallen branch.
  - **Twitching jaws:** the bottom of its cycle stays above them.
  - **A locked shot or a falling drop** becomes a height band it does not fly through, on the side it is already on.

  Without this the bot flew into most shots: ZERO died to shots in 76 of 100 stage-7 runs without it and 14 with it. A real player dodges these, so the naive numbers undersell every unit.
- **`--jobs N`** runs N pages in parallel, one browser context each. **`--bossgo`** skips to the fight. **`--see`** picks which reactions are on.

Bot caveat: the flap trigger is unchanged. The bot flaps when the bird sinks 6 px below its target, and a flap lifts it ~68–74 px, so its cycle sits ~30 px above the target. That is why "top" is the main cause of death. It is the same bot every earlier table used, so comparisons with history hold; a player who centres the cycle does better.

### Clear rate, form I, seeded, n = 100 per cell (♛ = boss fight after gate 100)

| Unit | 1 | 3 | 5 | 7 | 10 ♛ | 15 | 20 ♛ | 25 | 30 ♛ | 40 ♛ | 50 ♛ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| volt | 98 | 92 | 63 | 2 | 0 | 14 | 5 | 0 | 0 | 0 | 0 |
| nimbus | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| mochi | 98 | 90 | 76 | 9 | 2 | 14 | 0 | 0 | 0 | 0 | 0 |
| **zero** | **93** | 93 | 94 | 60 | **44** | 43 | **31** | 1 | **6** | **0** | **0** |
| aegis | 100 | 100 | 100 | 79 | 70 | 96 | 83 | 0 | 17 | 0 | 0 |
| solaris | 100 | 98 | 97 | 88 | 28 | 54 | 30 | 0 | 2 | 0 | 0 |
| pulsar | 100 | 86 | 90 | 30 | 6 | 32 | 16 | 0 | 5 | 0 | 0 |

The 95% interval is about ±10 points at 50% and ±5 points near 5% or 95% (the Wilson bounds are in the JSON). A new course each run (`anyseed`) gives ZERO 96 / 83 / 72 / 64 / **20** / 37 / **25** / 2 / **14** / 0 / 0. That is the same picture; stage 10's seeded course is kinder than the average course. The naive bot gives ZERO 94 / 87 / 93 / 17 / 14 / 34 / 26 / 0 / 8 / 2 / 0.

### Mean gates reached, seeded

| Unit | 1 | 3 | 5 | 7 | 10 ♛ | 15 | 20 ♛ | 25 | 30 ♛ | 40 ♛ | 50 ♛ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| volt | 99 | 98 | 74 | 25 | 25 | 55 | 41 | 6 | 21 | 15 | 7 |
| nimbus | 14 | 9 | 10 | 7 | 10 | 10 | 9 | 6 | 9 | 7 | 5 |
| mochi | 99 | 96 | 90 | 47 | 43 | 41 | 30 | 7 | 17 | 21 | 12 |
| zero | 99 | 96 | 99 | 81 | 78 | 69 | 59 | 32 | 44 | 35 | 28 |
| aegis | 100 | 100 | 100 | 83 | 82 | 98 | 92 | 11 | 52 | 26 | 15 |
| solaris | 100 | 100 | 99 | 96 | 78 | 74 | 71 | 19 | 48 | 43 | 27 |
| pulsar | 100 | 93 | 94 | 64 | 45 | 66 | 57 | 19 | 46 | 33 | 14 |

ZERO's course survival (share of runs past N gates), seeded:

| Stage | ≥ 40 | ≥ 60 | ≥ 80 | 100 |
|---|---|---|---|---|
| 10 | 84 | 77 | 57 | 46 |
| 20 | 56 | 49 | 44 | 32 |
| 30 | 43 | 20 | 7 | 6 |
| 40 | 32 | 13 | 6 | 0 |
| 50 | 33 | 4 | 0 | 0 |

### Bosses

**In the run** (seeded): win rate among runs that reached the boss, and the mean fight length of the wins.

| Unit | 10 | 20 | 30 | 40 | 50 |
|---|---|---|---|---|---|
| zero | 44/46 (96%), 22 s | 31/32 (97%), 35 s | 6/6, 41 s | never reached | never reached |
| aegis | 70/70, 24 s | 83/86 (97%), 35 s | 17/17, 47 s | never reached | never reached |
| solaris | 28/32 (88%), 21 s | 30/38 (79%), 31 s | 2/4 | 0/3 | never reached |
| pulsar | 6/6 | 16/30 (53%), 29 s | 5/8 | never reached | never reached |
| volt | never reached | 5/7 | never reached | never reached | never reached |

**Alone** (`--bossgo`, n = 100 fights each): win %, then the mean fight length of the wins.

| Unit | 10 (HP 5) | 20 (HP 7) | 30 (HP 9) | 40 (HP 12) | 50 (HP 15) |
|---|---|---|---|---|---|
| volt | 60, 22 s | 46, 35 s | 47, 45 s | **0** | **0** |
| nimbus | 52, 24 s | 38, 34 s | 14, 49 s | 1 | 0 |
| mochi | 53, 22 s | 43, 34 s | 36, 48 s | **0** | **0** |
| zero | 96, 22 s | 96, 31 s | 89, 41 s | **50, 77 s** | **60, 88 s** |
| aegis | 100, 24 s | 97, 37 s | 93, 50 s | 52, 91 s | 46, 108 s |
| solaris | 95, 24 s | 87, 30 s | 94, 44 s | 40, 83 s | 30, 100 s |
| pulsar | 61, 20 s | 44, 32 s | 43, 40 s | 1 | 0 |

Losses on bosses 40/50 come mid-fight: ZERO had 5.9 of 12 and 7.7 of 15 HP left when it died. The fights there run 77–108 s, about 6 s a hit. Units without a save (a shield, AEGIS) or a strong skill fall off a cliff at the two bosses with minions and all five attacks: VOLT, MOCHI and PULSAR win 0–1%.

### Where the bot dies (seeded, all 7 units, 5,165 deaths)

| Cause | Deaths | Share |
|---|---|---|
| gate (top 3,753, bot 327, ground 0) | 4,080 | 79% |
| shot (surprise) | 442 | 9% |
| wind (a crash right after a gust) | 283 | 5% |
| branch (NEON GROVE) | 248 | 5% |
| snap (surprise) | 53 | 1% |
| boss | 44 | 1% |
| drop (surprise), geyser, blade | 15 | <1% |

- **Stage 25 (CANYON RUN finale, no boss) is a trap.** All seven units clear 0–2% of it, with 226 "wind" deaths (gusts). ZERO is past gate 40 in 32% of runs and past gate 50 in 10%; the deaths cluster there.
- **Stage 50 has 199 "bot" deaths:** stall and fog2 at the narrowest gaps.
- **Shots are the most common surprise death:** 125 of 700 runs on stage 7 even with the dodge. The naive bot died to 75–99% of them there.

### Against the old targets

| | Stage 10 | Stage 25 | Stage 40 | Stage 50 |
|---|---|---|---|---|
| ZERO, target 10-28 (bosses 10/25/40/50) | ~80 | ~60 | ~45 | ~30 |
| ZERO, measured 10-28 (pooled) | 78 | 62 | 47 | 29 |
| ZERO, now (seeded / anyseed) | **44 / 20** | **1 / 2** | **0 / 0** | **0 / 0** |
| VOLT, measured 10-28 | 37 | 5 | 2 | 0 |
| VOLT, now (seeded / anyseed) | **0 / 0** | **0 / 0** | **0 / 0** | **0 / 0** |

The old targets were measured with goals of 16–46 gates. The 100-gate missions put 2–6 times as many gates, mostly at the plateau, behind the same gaps, so every boss stage dropped from its target to near zero.

Flags:
- **NIMBUS** clears nothing, not even stage 1 (14 gates on average, all "top"), yet it wins 52% of the stage 10 fight alone. The bot cannot fly its light gravity through gates; that is the known NIMBUS issue (see the 10-27 notes), now fatal over 100 gates.
- **PULSAR** dies to shots more than the other units (120 shot deaths), and it wins only about half of its boss fights.

### Lever probes (copies of index.html via `--page`, not applied; ZERO and VOLT, n = 60, or n = 100 for the final probe)

Clear rate on stages 1 / 10 / 20 / 30 / 40 / 50:

| Probe | ZERO | VOLT |
|---|---|---|
| main (seeded) | 93 / 44 / 31 / 6 / 0 / 0 | 98 / 0 / 5 / 0 / 0 / 0 |
| plateau `runD` +.35 → +.20 | 100 / 37 / 48 / 7 / 2 / 0 | 98 / 2 / 7 / 0 / 0 / 0 |
| SUR base and step ×0.5 | 90 / 68 / 35 / 27 / 2 / 0 | 100 / 0 / 0 / 0 / 0 / 0 |
| every gap +12 px | 95 / 48 / 43 / 7 / 10 / 0 | 100 / 0 / 5 / 0 / 0 / 0 |
| every gap +36 px | 100 / 68 / 52 / 3 / 12 / 2 | 100 / 2 / 13 / 0 / 0 / 0 |
| plateau .20 + SUR ×0.5 + gap +24 (g24) | 100 / 65 / 67 / 57 / 27 / 0 | 100 / 8 / 12 / 17 / 2 / 0 |
| g24 + stage 10's cut `bg` 28 → 12 + boss HP 40/50 12 → 9 and 15 → 11 + SKY PALACE goal 70 (final) | **100 / 70 / 51 / 44 / 27 / 12** | 100 / **23** / 6 / 11 / 1 / 0 |

No single lever reaches the curve: each one moves only one or two stages. Together they bring ZERO within about 10 points of the proposed curve on stages 1–40. Stage 50 and VOLT on stage 10 still fall short.

### Recommendations (not applied; the owner decides)

Proposed curve: ZERO 95 / 75 / 60 / 45 / 35 / 25 on stages 1 / 10 / 20 / 30 / 40 / 50, and VOLT ≥ 40 on stage 10.

1. **Give gates 46–100 back some room: gap +24 px and a lower plateau.**
   - Raise every `ST_BAND` gap by about 24 px (first and last of each zone).
   - Lower the stage-mode plateau in `runD` from `d0 + .35` to `d0 + .20`, and the same in `stDGoal`.
   - Expected, from the g24 probe: ZERO 100 / 65 / 67 / 57 / 27 / 0. Stages 10–30 come near the curve; stage 30 overshoots, so zone 2 could take +16 instead of +24.
   - This is the biggest lever: 79% of all deaths are gates.
   - Re-check `tests/stages.test.js`: the curve and the minimum gap still hold, since the gaps only grow.
2. **Halve the surprise rates:** `SUR.base` [.06, .08, .10, .12] → [.03, .04, .05, .06] and `step` .02 → .01.
   - Alone this took ZERO's stage 10 from 44% to 68% and stage 30 from 6% to 27%.
   - At 100 gates a stage, the old rate means 6–15 surprises a run. Shots alone end 9% of runs, and 18% on stages 5–7 where they are new.
   - Keep `hot` ×1.3 on boss rows.
3. **Make bosses 40/50 winnable for a unit without a save:**
   - boss HP 12 → 9 and 15 → 11;
   - stage 10's finale cut `bg` 28 → 12, which brings VOLT on stage 10 from 0% to 23%;
   - for stage 50, a shorter SKY PALACE mission (goal 70, or a goal by tier: 100 / 100 / 90 / 70) or +12 px more gap in zone 3.

   Expected with 1–3 together (the final probe): ZERO 100 / 70 / 51 / 44 / 27 / 12, and VOLT 23% on stage 10.

   To reach the curve's last two points and VOLT ≥ 40%, the next probes to fly are:
   - zone 3 at goal 60 or gap +36;
   - stage 40's `bg` 16 → 8;
   - boss attack pause `BOSS.pause` [2.2, 1.5] → [2.4, 2.0];
   - the meter refill `BOSS.charge` 2.6 → 2.2 s, which shortens the 77–108 s fights.
4. **Separate from the curve:**
   - **Stage 25:** look at its gust trap (226 wind deaths; every unit clears 0–2%) before tuning around it.
   - **NIMBUS:** cannot clear stage 1 with this bot; needs its own fix (glide-aware bot or unit numbers).
   - **Validate on a phone:** the bot's flap cycle sits ~30 px high, so play stages 10 / 20 / 40 with a common unit before locking any of these numbers.
