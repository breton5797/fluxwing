# Surprise obstacles, 100-gate missions and bosses (owner request 2026-10-29)

Owner's ask (ko, summarised): obstacles are only plain pillars. Make them themed, solid-looking 3D obstacles, and add
startling, unpredictable hazards that fit each theme (e.g. in the grove a man-eating plant suddenly lunges up from below
and eats the unit; a rock flies fast at you from the front). Make the game harder. Every stage ends in MISSION SUCCESS
once the 100th obstacle is passed. Every 10th stage, after the 100th gate, a boss appears that is beaten by dash-ramming;
boss HP grows stage to stage and it has varied attacks. Pillars, surprise hazards, backgrounds and bosses are drawn with
Higgsfield art.

This document is the contract shared by the art and engine work. Numbers here are starting values for tuning.

## 1. Missions: 100 gates, then the run ends

- Every stage's goal is **100 gates** (`ST_GOAL = 100`). It replaces `10 + round(.62 i) ± rest/boss`.
- Reaching the goal **ends the run as a win** (stage mode only). No more score chasing after the clear:
  a short "MISSION CLEAR" moment (~1.2 s: slow-mo, banner, confetti), then the result screen with the clear rewards.
  Daily and versus are unchanged.
- On a boss stage the 100th gate does not end the run. Gate spawning stops and the boss fight starts (section 3).
  Beating the boss is the clear.
- Keep the course seeded up to the goal (now 100). `runD` keeps its 45-gate ramp, so gates 45–100 fly at the
  stage's top difficulty. That is intended: harder.
- Stars, `failPay` and replay pay keep their formulas, which already scale with `goal`.
- Stage select shows `gates/100`. HUD stage line `min(gatesPassed, goal)/goal` stays.

## 2. Bosses move to stages 10/20/30/40/50

- `row.boss` now means **a boss fight**: `(i + 1) % 10 === 0`, i.e. stages 10, 20, 30, 40 and 50.
- The old `'!'` zone finales (stages 10, 25, 40 and 50) keep their tighter numbers under a new flag `row.fin`
  (d0 +.02, gap −bg, hp ×1.1, sp ×1.3). Stage 25 is a finale without a boss; stages 20 and 30 are bosses without finale numbers.
- First-clear diamonds ×1.5 (`diaClear`), the ♛ mark on the stage map, and SOLARIS's `bossGod` follow `row.boss` (the fight).

## 3. Boss fight

Each boss is themed to the zone of its stage:

| Stage | Zone | Boss (original names, not translated) | HP | Attack pool |
|---|---|---|---|---|
| 10 | NEON GROVE | MAWBLOOM: a giant carnivorous flower | 5 | volley, wall |
| 20 | CANYON RUN | DUNEHULK: a sandstone golem | 7 | volley, wall, charge |
| 30 | MAGMA CORE | CINDERWYRM: a lava serpent-dragon | 9 | volley, wall, charge, beam |
| 40 | MAGMA CORE | MOLTEN KING: a magma titan | 12 | all five |
| 50 | SKY PALACE | STORMCROWN: a thunder sovereign | 15 | all five, faster |

**Flow.**
- Gate 100 is passed and no gates spawn after it.
- A warning banner (`BOSS`, red, siren SFX, shake) plays, then the boss slides in from the right.
- The boss hovers at `x = LW - 95`. It eases its y toward the bird's y at about 40% of the gap per second, with a sine bob, clamped on screen.

**Ram.**
- While the fight runs, the dash meter refills by itself: full in `BOSS.charge = 2.6 s / B.dash`. Gate-based fills are gone, since there are no gates.
- Pressing dash with a full meter lunges the bird forward at 1500 px/s toward the boss. It still has the usual dash invulnerability.
- **Hit:** the bird circle overlaps the boss's hit circle (`r ≈ 58`, scaled with the sprite). The boss loses 1 HP, is knocked back, flashes white for 0.6 s and is invulnerable for that time. Hit-stop, shake, shatter SFX.
- **Miss:** the bird flies to `x = LW - 150` and comes back.
- Either way the bird eases back to `x = 120` over 0.35 s.
- Touching the boss without a dash kills the bird (`die('boss')`).

**Attacks.**
- The boss uses one attack at a time.
- The pause between attacks goes from 2.2 s (stage 10) down to 1.5 s (stage 50), and drops to ×0.75 once HP falls to half or below ("enraged": red tint, faster bob).
- Every attack is telegraphed. All boss projectiles respect invulnerability (`godT`, `invuln`, dash) and the clone/shield saves, so they go through the same path as `sigHit`.

| Attack | Telegraph | What happens |
|---|---|---|
| volley | 0.5 s glow at the mouth | 3 to 5 projectiles aimed at the bird's y, spread ±12°, 330 px/s (+20 per boss) |
| wall | 0.6 s markers at the right edge | a vertical wall of projectiles flies left at 260 px/s, with one 150 px hole at a random y (never more than 220 px from the hole of the previous wall) |
| charge | 0.7 s: shudders, eyes glow, a line at its y | rushes left along that y at 900 px/s to x = 40, then returns. Its y is locked at the start of the telegraph |
| beam | 0.8 s thin warning band (64 px tall) at the bird's y, locked at the start | the band becomes lethal for 0.5 s from x = 0 to the boss |
| minion | 0.4 s | 2 small homing foes (120 px/s, 6 s life). Touching one kills, unless dashing; a dash destroys it and gives +0.25 dash meter |

**Win.**
- The boss explodes: a big burst, a slow-motion beat and confetti.
- Then the MISSION CLEAR flow (section 1) runs, with the boss name in the banner.
- **No score points come from the boss.** The server's score bound is tied to gates, so the reward is the clear rewards (×1.5 diamonds).

**Death and continue.**
- A continue (`openCont`) resumes the fight. The boss keeps its HP and current attacks are cleared.

**HUD.** A boss HP bar sits at the top of the screen, with the boss name and the HP in segments.

## 4. Surprise hazards ("surprises")

Every surprise has a short, readable telegraph: sudden but fair. The bird can always escape by flapping or by dashing.
- Surprises never score.
- Dash and invulnerability pass through them, the same as signature obstacles (`sigHit` path).
- Each surprise has its own `die(why)` cause and death hint.

**Generic kinds.** Each kind is one mechanic with a different skin per zone:

| Kind | Mechanic | Grove | Canyon | Magma | Palace |
|---|---|---|---|---|---|
| `snap` | jaws lunge out of the gate's lower pillar (palace: upper) into the gap | man-eating plant | sand worm | lava serpent | gargoyle claw (from above) |
| `shot` | a projectile flies in fast from the right, aimed at the bird | thorn seed pod | spinning boulder | fireball | ice spear |
| `drop` | something falls from the top between two gates | spiky seed cone | stalactite rock | lava drip / meteor | lightning orb |

**snap**
- **Trigger:** the gate's distance to the bird, `g.x - bird.x`, drops below `trig`. `trig` is rolled per gate in [100, 220] px, so the timing is unpredictable.
- **Telegraph:** 0.18 s (leaves twitch / eyes glint, a tiny shake of the pillar cap).
- **Lunge:** reaches depth `dep` in 0.12 s, holds 0.5 s, then retracts in 0.3 s. `dep = min(k * gap, gap - keep)`, with k rolled in [.30, .42] and `keep = 112` px.
- **Hit:** the bird overlapping the jaws' rectangle and head circle → `die('snap')`.
- **Not used** on move or pulse gates, twins, lane gates or gates with a non-branch `sg`.

**shot**
- **Flag:** set on a gate. Fires once that gate has been passed.
- **Fairness guard:** fires only if the nearest gate ahead is more than 230 px from the bird. Otherwise it is skipped.
- **Telegraph:** a red `!` marker on the right edge follows the bird's y for 0.45 s, then locks.
- **Flight:** the projectile crosses from the right edge to the bird in 0.55 s, travelling straight. Projectile radius 14, hit radius 12. → `die('shot')`.

**drop**
- **Flag:** set on a gate. Falls at the midpoint between that gate and the one before it.
- **Trigger:** that x comes within 260 px of the bird.
- **Telegraph:** a crack or glow on the ceiling and a ground shadow at that x for 0.4 s.
- **Fall:** accelerates from 300 px/s at 1400 px/s². Radius 18. It shatters on the ground. → `die('drop')`.

**Introduction and rates.**
- The kinds arrive in order: snap from stage 3, shot from stage 5, drop from stage 7. After that all three run in every zone.
- **Chance per gate, for each kind:** zone base `[.06, .08, .10, .12]` plus `.02 * k`, where k runs 0→1 across the zone.
  - ×1.3 on `fin` and boss rows, ×.5 on breathers.
- At most one surprise per gate. None before gate 8.
- **Separate rng stream** seeded `'stage:' + i + ':v2' + salt + ':s'`, so the existing course (`rng`) and extras (`srng`) roll counts stay untouched.
- Surprises are their own track. They are not in `stElems`, so the "one new element per stage" rule is unchanged, and they have their own tests.
- **Juice:** a short sting SFX when a surprise triggers, plus a light camera shake. Respect `RM` (reduced motion) and the FX quality tiers.

## 5. Themed 3D obstacles and art (Higgsfield)

All art is generated with Higgsfield (`higgsfield generate create gpt_image_2_5 --background transparent --quality high`).
- **Style:** bright stylised 3D game art with clean shapes, soft rim light and strong silhouettes, readable at small size, matching each zone's palette (`ZONES`).
- **Originality:** no existing game, brand or character. The game is SWISHBY; do not make anything resembling Flappy Bird pipes.
- **Files:** WebP in `art/`. The page loads them as same-origin images, so they need entries in sw.js PRECACHE and `IOS_ASSETS`. If an image is not loaded yet, drawing falls back to the current procedural art.

| File | Size (px) | Content |
|---|---|---|
| `art/pillar-{grove,canyon,magma,palace}.webp` | 128×512 | a vertical column segment that tiles top-to-bottom (shaft only), cylindrical shading, opaque |
| `art/cap-{grove,canyon,magma,palace}.webp` | 192×96, transparent | the pillar's capital/end piece at the gap (drawn flipped for top pillars) |
| `art/sur-{snap,shot,drop}-{grove,canyon,magma,palace}.webp` | 192 max side, transparent | 12 surprise sprites; snap = jaws/head facing up (palace claw facing down) |
| `art/boss-{mawbloom,dunehulk,cinderwyrm,moltenking,stormcrown}.webp` | 384 max side, transparent | 5 bosses, facing left (toward the player) |
| `art/bg-{grove,canyon,magma,palace}.webp` | 540×960 | optional far backdrop painting; low contrast so gates stay readable |

**Drawing.**
- A pillar body is the shaft texture as a repeating pattern, clipped to the pillar rect, with the existing `body` gradient multiplied over it for depth, and the cap sprite at the gap end.
- Each zone keeps its `drawGateDeco` details on top. The neon stroke becomes a thin rim, so the gap edge stays readable.

## 6. Constraints (from the code map)

- **`index.html` is one file and tests regex its lines.** Do not reword these lines:
  - `FX.clearDone = true; FX.flawless = !FX.hit;`
  - `g.scored = true; gatesPassed++; ...`
  - `g.flash = 1; g.hitSide = ...; die(`
  - `state === 'dying' && g.hitSide` in `drawGate`
  - `die(bird.y - hr < top ? (g.brK > 0 ? 'branch' : 'top') : 'bot')`
  - the `reset()` spawn line, and `FIRST_GATE` / `firstGateX`
- **New pure logic goes in marker blocks** that `tests/*.test.js` can run with `new Function`:
  - surprise layout and timing goes in the `stages` block, or in a new `surprise:start` block;
  - boss tables and pure helpers go in `boss:start`.
- **Glow** goes through `glowPx()`. Honour `RM` and `IMP.q === 'low'`.
- **i18n has 23 languages.**
  - Every new key goes into every `I18N_W` world language and the core tables.
  - Placeholders must match.
  - At most 40 strings per language may equal the English.
  - Boss names are proper nouns drawn as data, not i18n keys.
- **Server score bound** (`3g² + 75g`, max gates 300–400): the boss gives no score, and 100 gates sits well inside the bound.
- **Tests that assert the old design must be updated to the new design, not deleted:**
  - goals and boss positions in `tests/stages.test.js`;
  - `REF_CFG.minBest` in `tests/referral.test.js`;
  - `FW.selfTest` goals.

## 7. Implementation notes (phase 1, engine, 2026-10-29)

Where the code differs from the text above, and why:

- **runD now holds after gate 45 in stage mode.** Section 1 says gates 45–100 fly at the stage's top difficulty, but the old `runD` kept
  climbing by .008 a gate after 45 (stage 1 would reach .79 by gate 100). Stage mode now holds `min(1, d0 + .35)` after gate 45; daily and
  versus are unchanged. `stDGoal` therefore reads the plateau for every stage (stage 1: .35).
- **No snap on a branch gate.** Section 4 excludes only non-branch `sg`. A falling branch closes the gap from above (it keeps 160 px) while the
  jaws would close it from below (they keep 112 px); together they could leave under 90 px. Snaps skip every gate with a signature obstacle.
- **The shot's fairness guard.** "The nearest gate ahead is more than 230 px away" can never hold right after a gate is passed: gates are
  only 220–250 px apart, so the next one is about 170 px ahead. Instead the shot fires, once its gate is passed, at the first moment the bird
  will be at least 24 px clear of every gate when the shot arrives (telegraph + flight, at world speed): `shotClear` in the surprise block.
  The dodge is never forced inside a gap. If no such moment comes before the gate scrolls off, the shot is dropped.
- **No drop beside a hazard or after a twin.** Drops also skip the second gate of a twin (the span is too short) and spans with a hazard
  pick-up or a gust / geyser / blade, so two things never compete for the same spot.
- **Surprise intro banners** use three generic kind names (`sr_snap` / `sr_shot` / `sr_drop`) rather than twelve per-zone names. The kinds
  are introduced on stages 3, 5 and 7 (all in the grove); the per-zone looks are art.
- **MISSION CLEAR** reuses the existing `stClear` banner ("STAGE {n} CLEAR!"); the result card shows the same line in place of a death hint.
- **Boss stub.** `bossStart()` sets `FX.bossOn` and calls `stageWin()` at once (marked TODO phase 2), so stages 10/20/30/40/50 stay
  playable until the fight lands. `stageWin()` holds the clear rewards and starts the 1.2 s beat (`WIN_BEAT`, `winTick`).
- **Help text** `hStage` now shows `(0/100)` in all 23 languages.

Code map for phase 2: `stageWin` / `bossStart` / `winTick` sit just above `sigTick`; the update loop's goal check reads
`!FX.bossOn`; gate spawning stops at `spawnIdx >= stGoal(curStage)` and tolerates an empty `gates` list; `surs` (shots and drops in flight)
is cleared by `closeCont`.

## 8. Implementation notes (phase 2, engine, 2026-10-29)

Where the boss fight differs from section 3, and why:

- **The arena is narrow on a phone.** On a 390×844 phone the logical width `LW` is about 296, so the bird's home is `x ≈ 89`
  (`min(LW*.3, 150)`, the same as `reset()`) and the boss rests at `LW - 95 ≈ 201`. Its mouth is then only about 70 px from the bird.
  The fixes below come from playing it at that width, and the scripted bot in `tests/e2e/boss-smoke.mjs` beats both stage 10 and stage 50.
- **The volley aims where the bird was when the telegraph started**, not where it is when it fires. Fired from 70 px away at the bird's
  current height, it could not be dodged. With the aim locked at the start of the 0.5 s glow (a dashed aim line shows it), moving during the
  warning is the dodge, like the beam.
- **Minions** hatch 110 px above and below the boss and hold still for 0.5 s (`wake`). They then home in with a soft turn (`steer` 1.2/s),
  and each makes **one pass**: once a minion is behind the bird it stops homing and flies off. The bird cannot move sideways, so a minion that
  kept circling back could not be dodged, only dashed. The 6 s life still caps them. The boss **summons no new minions while some are out**,
  so they never stack up.
- **"STORMCROWN … faster"**: `spd` 1.12 on the wall and the minions. Telegraph lengths stay the same for every boss, so it stays fair.
- **One death cause, `boss`,** covers contact, shots, the wall, the beam, the charge and the minions. It has one hint, `whyBoss`. The banner key is
  `bossWarn`. Both are in all 23 languages; nl translates it as "EINDBAAS NADERT!" to stay under `SAME_OK`.
- **The win banner** puts the boss name in front of the clear line, e.g. "MAWBLOOM · STAGE 10 CLEAR!". `bossKill` edits the big banner
  that `stageWin()` just raised, so `stageWin` itself is unchanged.
- **The ram** starts from `dash()` (`if (boss) bossRam();`), so it uses the normal dash with its invulnerability.
  - The miss point `LW - 150` is inside the boss's circle on a phone. A lunge at the boss's height therefore always connects, and the miss
    path only shows when the bird is off the boss's height.
  - During the 0.6 s after a hit, a lunge passes through the boss: dash invulnerability covers the bird.
- **Gate-counted skills and ultimates** (TEMPEST and VALKYRIE's storm chain, Hurricane, GARUDA, PLEIAD's meteors): while the fight runs,
  every `BOSS.gate` = 0.6 s counts as one gate in `bossUpdate`, so `FX.stormN` and `FX.ultN` run out and `ultEnd()` runs.
  - Genesis, AURORA's lane, COSMOS's stars and QUASAR's beam find no gate and do nothing. Every gate lookup in the code already handled an
    empty `gates` list.
  - None of these effects damages the boss: only the ram does.
  - The smoke casts the skill and the ultimate of SOLARIS, TEMPEST, PLEIAD, QUASAR, AURORA, COSMOS, GARUDA and VALKYRIE during a fight.
    Nothing throws, and every gate-counted part ends.
- **No score from the boss.** The boss code never touches `score`, `addScore` or `gatesPassed`; `tests/boss.test.js` checks the source.
  The dash meter refills by itself during the fight (`meterGain`), and no orb or gate adds to it.
- **QA jump** (`#dev` on localhost only): `FW.bossGo()` clears the course on a boss stage, marks the goal reached and starts the fight.
  `FW.boss` and `FW.bsh` show the fight.

Code map for phase 3 (art):

- **Boss data:** the `boss:start` block. `BOSS.list[k].id` matches the art file names: `art/boss-<id>.webp`.
- **Drawing:** `drawBoss(b)` draws one boss at `b.x, b.y`, facing left; this is the function to wrap. Around it:
  - `drawBossFx()`: the telegraphs, then `drawBoss`, then the shots and minions;
  - `drawBossBar(y)`: the HP bar.
- **Sizes:**
  - The hit circle is `BOSS.r` = 58. The procedural body is drawn at `R = 1.12 r` (≈ 65), so the body is about 130 px across and its
    features (petals, crown, coils) reach about 1.45 R.
  - A 345×384 sprite reads right at about 150–170 px tall, centred on `b.x, b.y`.
  - The bird is `r` 13 (about 26 px across), so the boss is roughly 5–6 times the bird's size.
- **State for the sprite:**
  - `b.hitT > 0`: flash white;
  - `b.rage`: red tint;
  - `b.s.ph === 'tel'`, with `b.s.atk`: the mouth or eye glow;
  - `b.dieT`: fade and shake.
- **Other draw code:** the surprise skins are `SUR_SKIN` and `drawSur()` (just above `drawBossFx`). `drawGate` and `drawGateDeco` draw the gates.
