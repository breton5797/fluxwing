// Records 9:16 short clips of real autopilot play and encodes them for Shorts / Reels / TikTok.
//   node scripts/shorts.mjs [--n=20] [--lang=en] [--seed=2027] [--out=dir] [--port=5173] [--jobs=3] [--tries=14] [--only=combo,dash]
// Output: <out>/NN-scene-unit.mp4 (1080x1920 H.264, 30 fps, yuv420p, faststart, silent AAC track) + manifest.json.
// Default out: marketing/out/shorts/<YYYY-MM-DD>/. Starts scripts/serve.mjs on --port unless a server is already there.
// Every clip is played on a manual clock with Math.random seeded, so the same --seed gives the same clips.
// Live backend: never. *.supabase.co (and every host but the page and its web font) is aborted.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium, ensureServer, openGame, startRun, play } from './marketing-kit.mjs';
import { SCENES, scenePlan, sceneOk, clipLen, hookFor, fill, zoneOf, parseArgs, END_LINE, END_BEAT, LANGS } from './marketing-copy.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FPS = 30, END_S = 1.5, HOOK_S = 2.8;
const today = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const opt = parseArgs(process.argv.slice(2), { n: 20, lang: 'en', seed: 2027, out: '', port: Number(process.env.PORT) || 5173, jobs: 3, tries: 14, only: '' });
if (!LANGS.includes(opt.lang)) { console.error(`--lang must be one of ${LANGS.join(', ')}`); process.exit(1); }
const outDir = opt.out || join(ROOT, 'marketing/out/shorts', today);
mkdirSync(outDir, { recursive: true });
// Every unit that can be flown (not the hidden ones, not the season unit): the scenes pick from these.
const OWNED = ['volt', 'blitz', 'nimbus', 'titan', 'mochi', 'aegis', 'phoenix', 'zero', 'pixel', 'neko', 'buzz', 'kraken', 'specter', 'oracle', 'raijin', 'chrono', 'goliath', 'solaris', 'pulsar'];
const VIEW = { w: 540, h: 960, dsf: 2, zoom: 1.5 };   // 1080x1920 device px; the game lays out at 360x640 and draws its canvas at full resolution
const logo = 'data:image/png;base64,' + readFileSync(join(ROOT, 'logo-swishby.png')).toString('base64');

const storageFor = (clip, best) => {
  const score = Array(50).fill(0);
  if (clip.stage != null && best) score[clip.stage] = best;
  return { fw27_bird: clip.unit, fw27_owned: OWNED, fw27_stg2: { open: 49, gates: Array(50).fill(0), score, clr: Array(50).fill(0) }, fw27_best: best || 0 };
};

async function dryRun(browser, clip, seed, edge, best) {
  const g = await openGame(browser, { port: opt.port, ...VIEW, lang: opt.lang, seed, hideHud: true, storage: storageFor(clip, best) });
  await startRun(g.page, clip);
  await g.page.evaluate(([e, off]) => Object.assign(MK.o, { edge: e, offAt: off }), [edge, SCENES[clip.scene].offAt || 0]);
  const trace = await play(g.page, Math.round(clip.len * FPS));
  await g.ctx.close();
  return trace.map(f => ({ ...f, record: best > 0 && f.score > best }));
}

// Try run seeds (and a few autopilot edges) until a dry run shows what the scene is about.
async function findRun(browser, clip) {
  const sc = SCENES[clip.scene], edges = [sc.edge ?? 12, 8, sc.edge ?? 12, 16];
  let fallback = null;
  for (let k = 0; k < opt.tries * (sc.want.death ? 2 : 1); k++) {
    const seed = (clip.runSeed + k * 7919) >>> 0, edge = edges[k % edges.length];
    let best = 0, trace = await dryRun(browser, clip, seed, edge, 0);
    if (clip.scene === 'record') {   // a stage best a little under where this run is at 4.5 s: the record falls on camera
      best = Math.max(3, trace[Math.round(4.5 * FPS)].score);
      trace = await dryRun(browser, clip, seed, edge, best);
    }
    const r = sceneOk(sc.want, trace, FPS), run = { seed, edge, best, stats: r.stats, matched: r.ok, tries: k + 1 };
    if (r.ok) return run;
    if (!fallback || r.stats.alive > fallback.stats.alive) fallback = run;
  }
  return fallback;
}

const overlayHtml = body => `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Bungee&family=Chakra+Petch:wght@700&display=block" rel="stylesheet">
<style>html,body{margin:0;width:540px;height:960px;background:transparent;overflow:hidden}
body{font-family:"Chakra Petch","Hiragino Sans","Apple SD Gothic Neo",system-ui,sans-serif;color:#fff;font-weight:700}
.hook{position:absolute;left:30px;right:30px;top:208px;padding:20px 24px;border-radius:30px;text-align:center;font-size:42px;line-height:1.12;
  background:rgba(12,6,28,.82);box-shadow:0 0 0 4px #ff3d8b,0 0 0 8px rgba(0,234,255,.75),0 14px 50px rgba(0,0,0,.55);text-shadow:0 3px 0 rgba(0,0,0,.4)}
.end{position:absolute;inset:0;background:radial-gradient(120% 80% at 50% 40%,rgba(58,14,82,.96),rgba(10,6,24,.97));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px}
.end img{width:440px}.beat{font-family:"Bungee","Chakra Petch","Hiragino Sans","Apple SD Gothic Neo",sans-serif;font-size:40px;color:#ffd84a;text-align:center;padding:0 24px}
.cta{font-size:34px;padding:16px 30px;border-radius:999px;background:#fff;color:#14081f;box-shadow:0 0 0 4px #ff3d8b,0 0 34px rgba(255,61,139,.7)}</style></head><body>${body}</body></html>`;
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function overlayPng(browser, body, path) {
  const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(overlayHtml(body), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path, omitBackground: true });
  await ctx.close();
}

// Records the run the dry run found. The recording's own trace decides the cut (2.5 s after a death) and the numbers on
// the hook and end card, so a run that strays from its dry run still gets a true caption.
async function recordClip(browser, clip, run, file) {
  const dir = mkdtempSync(join(tmpdir(), 'shorts-'));
  const g = await openGame(browser, { port: opt.port, ...VIEW, lang: opt.lang, seed: run.seed, hideHud: true, storage: storageFor(clip, run.best) });
  await startRun(g.page, clip);
  await g.page.evaluate(([e, off]) => Object.assign(MK.o, { edge: e, offAt: off }), [run.edge, SCENES[clip.scene].offAt || 0]);
  const trace = [];
  let deathAt = null;
  for (let f = 0; f < Math.round((clipLen(clip.len, deathAt) + END_S) * FPS); f++) {
    const [fr] = await play(g.page, 1, FPS);
    trace.push({ ...fr, record: run.best > 0 && fr.score > run.best });
    if (deathAt == null && fr.state !== 'play') deathAt = f / FPS;
    await g.page.screenshot({ path: join(dir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
  const errors = g.errors.slice(), blocked = g.blocked.supabase;
  await g.ctx.close();
  const foot = clipLen(clip.len, deathAt), dur = trace.length / FPS;
  const seen = sceneOk(SCENES[clip.scene].want, trace.slice(0, Math.round(foot * FPS)), FPS);
  if (seen.stats.score !== run.stats.score) errors.push(`recorded score ${seen.stats.score}, dry run ${run.stats.score}`);

  const vars = { n: seen.stats.score, z: zoneOf(clip.stage) };
  const hook = hookFor(opt.lang, clip.scene, clip.hook, vars);
  await overlayPng(browser, `<div class="hook">${esc(hook)}</div>`, join(dir, 'hook.png'));
  const beat = clip.scene === 'beat' ? `<div class="beat">${esc(fill(END_BEAT[opt.lang], vars))}</div>` : '';
  await overlayPng(browser, `<div class="end">${beat}<img src="${logo}"><div class="cta">${esc(END_LINE[opt.lang])}</div></div>`, join(dir, 'end.png'));
  const e0 = (dur - END_S).toFixed(3);
  const fc = `[1:v]format=rgba,fade=t=in:st=0.1:d=0.25:alpha=1,fade=t=out:st=${HOOK_S - 0.35}:d=0.35:alpha=1[h];`
    + `[2:v]format=rgba,fade=t=in:st=${e0}:d=0.3:alpha=1[e];[0:v][h]overlay=0:0:enable='lte(t,${HOOK_S})'[a];[a][e]overlay=0:0:enable='gte(t,${e0})',scale=out_range=tv,format=yuv420p[v]`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', join(dir, '%05d.jpg'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(dur), '-i', join(dir, 'hook.png'),
    '-loop', '1', '-framerate', String(FPS), '-t', String(dur), '-i', join(dir, 'end.png'),
    '-f', 'lavfi', '-t', String(dur), '-i', 'anullsrc=r=44100:cl=stereo',
    '-filter_complex', fc, '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high',
    '-r', String(FPS), '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-c:a', 'aac', '-b:a', '64k', '-t', String(dur), '-movflags', '+faststart', join(outDir, file)]);
  rmSync(dir, { recursive: true, force: true });
  return { hook, duration: +dur.toFixed(2), errors, blocked, stats: seen.stats, matched: seen.ok };
}

const stop = await ensureServer(opt.port);
const browser = await chromium.launch();
const only = opt.only ? opt.only.split(',') : null;
const plan = scenePlan(opt.n, opt.seed).filter(c => !only || only.includes(c.scene));
const manifest = [];
let next = 0;
async function worker() {
  while (next < plan.length) {
    const clip = plan[next++];
    const run = await findRun(browser, clip);
    const file = `${String(clip.i + 1).padStart(2, '0')}-${clip.scene}-${clip.unit}.mp4`;
    const rec = await recordClip(browser, clip, run, file);
    const s = rec.stats;
    manifest.push({ file, scene: clip.scene, unit: clip.unit, mode: clip.daily ? 'daily' : 'stage', stage: clip.stage == null ? null : clip.stage + 1, zone: zoneOf(clip.stage),
      hook: rec.hook, lang: opt.lang, duration: rec.duration, seed: run.seed, matched: rec.matched,
      stats: { score: s.score, maxCombo: s.maxCombo, fever: !!s.fever, dashes: s.dashes, saves: s.saves, casts: s.casts, ult: !!s.ult, record: !!s.record, deathAt: s.deathAt } });
    console.log(`${file}  ${rec.duration}s  "${rec.hook}"  score ${s.score}${rec.matched ? '' : '  (scene not matched: best try kept)'}${rec.blocked ? `  aborted ${rec.blocked} supabase request(s)` : ''}${rec.errors.length ? '  notes: ' + rec.errors.join(' | ') : ''}`);
  }
}
try {
  await Promise.all(Array.from({ length: Math.max(1, opt.jobs) }, worker));
} finally {
  await browser.close(); stop();
}
manifest.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ created: new Date().toISOString(), lang: opt.lang, seed: opt.seed, clips: manifest }, null, 2) + '\n');
console.log(`wrote ${manifest.length} clips + manifest.json to ${outDir}`);
