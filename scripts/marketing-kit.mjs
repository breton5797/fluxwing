// Browser side of the marketing scripts (shorts.mjs, store-shots.mjs): a dev server, a game page that never
// reaches the live backend, an autopilot that plays through window.FW, and frame-by-frame stepping.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export { chromium };
const ROOT = fileURLToPath(new URL('..', import.meta.url));
// Only the page itself and its web font load. Supabase (*.supabase.co), the SDK CDN, ads and captcha are aborted.
const ALLOW = new Set(['127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com']);
const HIDE_CSS = '#fxDev,#toast,.testbar,#testerTag{display:none!important}';

/** Reuse a dev server on `port`, or start scripts/serve.mjs there. Returns a stop function. */
export async function ensureServer(port) {
  const up = () => fetch(`http://127.0.0.1:${port}/index.html`, { method: 'HEAD' }).then(r => r.ok, () => false);
  if (await up()) return () => {};
  const child = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise(r => setTimeout(r, 100));
  if (!(await up())) { child.kill(); throw new Error(`dev server did not start on ${port}`); }
  return () => child.kill();
}

/**
 * A game page: viewport w x h CSS px rendered at `scale`x (the page is zoomed so the game still lays out at w/zoom).
 * storage: localStorage keys set before the game boots (values are JSON-encoded). seed: Math.random becomes mulberry32(seed).
 */
export async function openGame(browser, { port, w, h, dsf = 2, zoom = 1, lang = 'en', seed = null, storage = {}, hideHud = false }) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, locale: lang, reducedMotion: 'no-preference' });
  const blocked = { supabase: 0, other: 0 };
  await ctx.route('**/*', route => {
    const host = new URL(route.request().url()).hostname;
    if (ALLOW.has(host)) return route.continue();
    blocked[host.endsWith('.supabase.co') ? 'supabase' : 'other']++;
    return route.abort();
  });
  const preset = { fw27_tut: 1, fw27_rookie_runs: 99, fw27_mute: true, fw27_lang: lang, fw27_fxq: 'high', ...storage };
  await ctx.addInitScript(([preset, seed]) => {
    for (const k in preset) localStorage.setItem(k, JSON.stringify(preset[k]));
    // Manual clock: with MK_CLOCK.manual on, animation frames and performance.now only move when the scene says so (MK.frame)
    const raf = window.requestAnimationFrame.bind(window), pnow = performance.now.bind(performance);
    const clock = window.MK_CLOCK = { manual: false, now: 0, q: [], run(now) { const c = clock.q; clock.q = []; for (const f of c) f(now); } };
    window.requestAnimationFrame = cb => { clock.q.push(cb); return clock.q.length; };
    performance.now = () => clock.manual ? clock.now : pnow();
    const pump = () => { if (!clock.manual) clock.run(pnow()); raf(pump); };
    raf(pump);
    if (seed != null) { let a = seed >>> 0; window.MK_RESEED = () => { a = seed >>> 0; }; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  }, [preset, seed]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html#dev`);
  await page.waitForFunction(() => window.FW && window.FW.imp);
  await page.addStyleTag({ content: HIDE_CSS + (hideHud ? '#topBtns{display:none!important}' : '') });
  if (zoom !== 1) await page.evaluate(z => { document.documentElement.style.zoom = z; dispatchEvent(new Event('resize')); }, zoom);
  await page.evaluate(BOT_SRC);
  await page.waitForTimeout(300);
  return { page, ctx, blocked, errors };
}

// The autopilot, evaluated inside the page. It reads the course through window.FW and plays with the real key bindings
// (Space flap, Shift dash, S skill, A ultimate), the same rules as tests/helpers/bot.js: ride just above a gate's lower
// edge so passes land in the Perfect window, dash when the meter is full right in front of a gate.
const BOT_SRC = `window.MK = (() => {
  const key = code => dispatchEvent(new KeyboardEvent('keydown', { code }));
  const gY = (g, T, FX) => g.lane ? g.base + g.off : g.base + (g.type === 'move' ? Math.sin((T - FX.still) * 1.7 + g.ph) * g.amp : 0);
  const gGap = (g, T, FX) => g.gap + (g.lane ? g.laneGap : g.type === 'pulse' ? Math.sin((T - FX.still) * 2.3 + g.ph) * Math.min(26, g.gap - 112) : 0);
  const o = { on: true, edge: 12, near: 70, look: true, dash: true, skill: true, ult: true, skillAt: 0, offAt: 0 };
  const unit = () => FW.BIRDS.find(u => u.id === JSON.parse(localStorage.getItem('fw27_bird') || '"volt"')) || FW.BIRDS[0];
  // The rule of thumb: ride the gate centre, then drop to just above the lower edge (o.edge px of air) when it is o.near px away.
  function wants(y, vy, x, gates, T, FX, R) {
    const gate = gates.find(g => !g.scored && g.x + g.w > x - R);
    if (!gate) return false;
    const line = gate.x - x < o.near ? gY(gate, T, FX) + gGap(gate, T, FX) / 2 - R - o.edge : gY(gate, T, FX) + 22;
    const floor = Math.min(line, 584 - R - 20);
    return y > floor && vy > (y > floor + 60 ? -300 : -60);
  }
  // Look ahead 0.9 s twice, flapping now or not and following the rule of thumb after that: avoid the crash first,
  // then take the branch with more Perfect passes (clearance inside the unit's window), else do what the rule says.
  function rollout(flapNow, u) {
    const b = FW.bird, run = FW.run, FX = FW.FX, R = b.r, hr = R * .82, dt = 1 / 60;
    const gates = FW.gates.filter(g => !g.scored && !g.broken).map(g => ({ ...g, minClear: 1e9 }));
    let y = b.y, vy = b.vy, perf = 0;
    for (let i = 0; i < 54; i++) {
      const T = run.T + i * dt;
      if (i === 0 ? flapNow : wants(y, vy, b.x, gates, T, FX, R)) vy = -u.flap;
      vy = Math.min(vy + u.grav * (FW.timers.lowGravT > i * dt ? .5 : 1) * dt, u.maxFall); y += vy * dt;
      if (y > 584 - R) return { dead: i, perf };
      for (const g of gates) {
        if (g.scored) continue;
        g.x -= run.speed * dt;
        if (b.x - R >= g.x + g.w) { g.scored = true; if (g.minClear < u.window) perf++; continue; }
        if (b.x + R <= g.x) continue;
        const cy = gY(g, T, FX), gp = gGap(g, T, FX), c = Math.min(y - hr - (cy - gp / 2), cy + gp / 2 - y - hr);
        if (c < 0) return { dead: i, perf };
        g.minClear = Math.min(g.minClear, c);
      }
    }
    return { dead: 99, perf };
  }
  function decide() {
    if (!o.on || FW.state !== 'play' || (o.offAt && FW.run.T >= o.offAt)) return;   // offAt: hands off from that run time on, the bird falls
    const b = FW.bird, run = FW.run, FX = FW.FX, R = b.r;
    const gate = FW.gates.find(g => !g.scored && g.x + g.w > b.x - R);
    if (!gate) return;
    let flap = wants(b.y, b.vy, b.x, FW.gates, run.T, FX, R);
    if (o.look) {
      const u = unit(), a = rollout(true, u), n = rollout(false, u);
      if (a.dead !== n.dead) flap = a.dead > n.dead;
      else if (a.perf !== n.perf) flap = a.perf > n.perf;
    }
    if (flap) key('Space');
    const dx = gate.x - b.x;
    if (o.dash && FW.timers.dashMeter >= 1 && dx > 0 && dx < 40) key('ShiftLeft');
    if (o.skill && run.skillCharge >= 1 && run.T >= o.skillAt) key('KeyS');
    if (o.ult && run.ultLive === false && run.ultCharge >= 1) key('KeyA');
  }
  // n sim ticks of 1/60 s, the autopilot deciding before each one; the run's dying/over screens tick on as usual.
  function tick(n) { for (let i = 0; i < n; i++) { decide(); FW.step(1 / 60, 1); } }
  // One video frame at fps: the sim ticks, the virtual clock moves, the game's own frame callback renders.
  // A death skips the continue offer straight to the result card.
  function frame(fps) {
    tick(Math.round(60 / fps)); MK_CLOCK.now += 1000 / fps; MK_CLOCK.run(MK_CLOCK.now);
    if (FW.state === 'cont') document.getElementById('contNo').click();
    const r = FW.run;
    return { state: FW.state, score: r.score, combo: r.combo, tier: r.tier, shields: r.shields, dash: FW.timers.dashMeter, skill: r.skillCharge, ultLive: r.ultLive };
  }
  const frames = (n, fps) => Array.from({ length: n }, () => frame(fps));
  // From here on the run depends only on the seed: the menu frames before it drew a wall-clock number of random particles.
  function manual() { FW.hold = true; MK_CLOCK.now = performance.now(); MK_CLOCK.manual = true; if (window.MK_RESEED) MK_RESEED(); }
  return { o, tick, frame, frames, manual, key, info: () => ({ state: FW.state, ...FW.run, dash: FW.timers.dashMeter }) };
})();`;

/** Start stage `n` (0-based) or the daily run on the manual clock: from here on only MK.frame / MK.tick move the game. */
export async function startRun(page, { stage = 0, daily = false }) {
  if (!daily) { await page.click('#startBtn'); await page.waitForSelector('#stageList .stc'); }
  await page.evaluate(([n, daily]) => { MK.manual(); if (daily) document.getElementById('dailyBtn').click(); else document.querySelectorAll('#stageList .stc')[n].click(); MK.frame(30); }, [stage, daily]);
}

/** Advance `frames` video frames (rendered, not captured); returns one trace entry per frame. */
export const play = (page, frames, fps = 30) => page.evaluate(([n, fps]) => MK.frames(n, fps), [frames, fps]);
export const info = page => page.evaluate(() => MK.info());
export const setBot = (page, o) => page.evaluate(o => Object.assign(MK.o, o), o);
