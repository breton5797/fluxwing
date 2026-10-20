# Marketing assets

Two scripts turn real play into marketing assets: 9:16 short clips (Shorts, Reels, TikTok, video ads) and
localized store screenshots. Both play the game with an autopilot through the `#dev` hooks on localhost,
so every frame is real gameplay, not a mock-up. Nothing they produce is committed: `marketing/out/` is in `.gitignore`.

## Requirements

- `npm install` (Playwright is a devDependency) and, once, `npx playwright install chromium`
- `ffmpeg` on `PATH` (shorts only)
- Nothing else. Each script starts `scripts/serve.mjs` on `--port` (default 5173) if no server answers there,
  and reuses one that does. If another checkout's dev server holds 5173, pass another port, e.g. `--port=5191`.

The browser never reaches the live backend: every request except the page itself and its Google web font is
aborted, `*.supabase.co` included, so no test score, account or analytics event leaves the machine.

## Shorts: `node scripts/shorts.mjs`

Records `--n` clips (default 20) and writes `marketing/out/shorts/<YYYY-MM-DD>/`:

- `NN-scene-unit.mp4`: 1080x1920 H.264 (high profile, yuv420p), 30 fps, faststart, a silent AAC track, 8 to 15 s
- `manifest.json`: per clip the file, scene, unit, mode / stage / zone, hook text, duration, run seed,
  whether the run showed what the scene wanted (`matched`) and the run's numbers (score, max combo, fever, dashes, ...)

Each clip opens with a hook line (about 2.8 s) and ends with a 1.5 s end card: the SWISHBY logo and
"Play free at swishby.com" (plus "Your turn: beat N" on a challenge clip).

| Option | Default | |
|---|---|---|
| `--n=20` | 20 | number of clips |
| `--lang=en` | en | hook, end card and in-game language: en, ko, ja, es, pt, id |
| `--seed=2027` | 2027 | same seed, same clips (units, stages, runs) |
| `--out=dir` | `marketing/out/shorts/<date>` | output folder |
| `--only=combo,dash` | all | record only these scenes (clip numbers stay those of the full plan) |
| `--jobs=3` | 3 | clips recorded in parallel |
| `--tries=14` | 14 | run seeds tried per clip before the best try is kept |
| `--port=5173` | 5173 | dev server port |

Scenes rotate in this order, so any 10 clips cover all of them: `combo` (near-miss chain), `fever`,
`dash` (through a wall), `save` (a shield takes a hit), `record` (the stage best falls on camera), `daily`,
`zone` (zones 2 to 4), `skill`, `ult` (ultimate), `beat` (the run ends on the result card: "Can you beat N?").
Units, stages and hook lines are tables in `scripts/marketing-copy.mjs`; add a line there to get a new hook.

How a clip is made: the game runs on a manual clock with `Math.random` seeded, so a run is fully reproducible.
The script dry-runs candidate seeds (no capture, a couple of seconds each) until one shows the scene, for
example a fever before the cut or a death between 6 and 11 s with a real score, then records that run frame by frame
and encodes it. Hook numbers (the score in "Can you beat 41?") come from the recorded run itself.

## Store screenshots: `node scripts/store-shots.mjs`

Six shots per language and platform, each a caption band (headline + sub line) over the game in a framed card:

1. `01-title`: title screen and hangar
2. `02-combo`: a Perfect combo in play
3. `03-dash`: the moment of a phase dash
4. `04-roster`: two unit cards (SOLARIS, KRAKEN) with stats and skills
5. `05-daily`: the daily challenge run
6. `06-versus`: a versus race against the AI, opponent ghost on screen

Output: `marketing/out/store/<lang>/<platform>/NN-name.png`, the plain game captures in `raw/` next to them,
and `marketing/out/store/manifest.json`.

| Option | Default | |
|---|---|---|
| `--langs=en,ja,es,pt,id,ko` | all six | languages |
| `--platforms=play,iphone69` | both | `play` 1080x1920 (Google Play phone), `iphone69` 1320x2868 (iPhone 6.9") |
| `--only=title,combo` | all | some shots only |
| `--seed=2027` | 2027 | run seeds |
| `--out=dir` | `marketing/out/store` | output folder |
| `--port=5173` | 5173 | dev server port |

Captions live in `CAPTIONS` in `scripts/marketing-copy.mjs`. The screenshots use a demo profile
(level 18, some coins, all units owned) so the title screen is not all zeros.

## Weekly routine (20+ clips a week, shared between ads and organic)

The plan is 20 or more clips a week, one pool used both for paid ads and for organic posts.

1. Monday: generate the week's clips with a new seed, e.g. the ISO week number:
   `node scripts/shorts.mjs --seed=202643` (English), then the same seed with `--lang=ko`, `--lang=ja`, ... for each market you post in.
2. Skim `manifest.json`: drop or re-roll (`--only=<scene> --seed=<other>`) any clip with `"matched": false`.
3. Split the pool: the 5 to 6 strongest hooks go to ads (two hooks per scene make an easy A/B pair);
   the rest are organic, about 3 a day across Shorts, Reels and TikTok.
4. Friday: note which scenes and hooks won (view-through, CTR) and move the winners to the top of their
   `HOOKS` lists; write new hook lines for the losers.
5. Store screenshots only need a re-run when the game's look, the units or the captions change:
   `node scripts/store-shots.mjs`.
