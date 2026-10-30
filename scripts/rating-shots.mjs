// GCRB rating evidence: screenshots (and, with --video, one gameplay video) of SWISHBY in Korean at a 390x844 phone size.
//   PORT=5391 node scripts/serve.mjs &   then   PORT=5391 node scripts/rating-shots.mjs [--video] [--only=04,05]
// Every *supabase* request is aborted (the backend is live production): online screens show their offline state.
// The #dev hash is only used for the window.FW QA handle; its FX tuning panel (#fxDev) is hidden in every capture.
// The shots (JPEG, quality 85) land in docs/launch/rating/shots/ (OUT=... to change); the video in $VIDEO_DIR (default /Users/mac/Downloads/swishby-rating).
import { chromium } from 'playwright';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORT = process.env.PORT || 5173;
const base = `http://127.0.0.1:${PORT}/index.html#dev`;
const OUT = resolve(process.env.OUT || 'docs/launch/rating/shots');
const VIDEO_DIR = process.env.VIDEO_DIR || '/Users/mac/Downloads/swishby-rating';
const args = process.argv.slice(2), VIDEO = args.includes('--video'), SHOTS = !args.includes('--no-shots');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = n => !ONLY.length || ONLY.includes(n);
const VIEW = { width: 390, height: 844 };

const z50 = () => Array(50).fill(0);
const STG = { gates: z50(), score: z50(), clr: z50(), star: z50(), open: 49 };
const HIDE_DEV = '#fxDev{display:none!important}';

async function newPage(b, opts = {}){
  const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: 2, locale: 'ko-KR', ...opts });
  await ctx.route(/supabase/, r => r.abort());
  await ctx.addInitScript(css => document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }), HIDE_DEV);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  return { ctx, page };
}

// localStorage for a returning Korean player: tutorial done, all 50 stages open
const seed = (page, extra = {}) => page.evaluate(([stg, extra]) => { localStorage.clear();
  for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'ko', fw27_dintro: 1, fw27_stg2: stg, ...extra })) localStorage.setItem(k, JSON.stringify(v)); }, [STG, extra]);
const boot = async page => { await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu'); await page.waitForTimeout(900); };
const start = async (page, i, salt = '') => {
  await page.evaluate(v => { FW.salt = v; document.getElementById('startBtn').click(); }, salt);
  await page.evaluate(n => document.querySelectorAll('#stageScr .stc')[n].click(), i);
  await page.waitForFunction(() => FW.state === 'play');
};
const frame = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// the gate bot of tests/e2e/surprise-smoke.mjs: flap whenever the bird sinks below the next gap's centre
const fly = (page, until, cap = 120 * 120) => page.evaluate(([u, c]) => {
  const stop = new Function('FW', 'return ' + u), flap = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  for (let i = 0; i < c && FW.state === 'play'; i++){
    const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), ty = g ? g.base + (g.off || 0) : 300;
    if (FW.bird.y > ty + 6 && FW.bird.vy > -120) flap();
    FW.step(1/120);
    if (stop(FW)) return 'hit';
  }
  return FW.state;
}, [until, cap]);

// the boss bot of tests/e2e/boss-smoke.mjs, as a page-side function (installed once per page): steps until an event in `want`, a win or a loss
const BOSS_BOT = `window.__bossBot = function(want, cap){
  const flap = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })), dash = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' }));
  const W = new Set(want);
  for (let i = 0; i < cap && FW.state === 'play'; i++){
    const bo = FW.boss, bd = FW.bird; if (!bo){ FW.step(1/120); if (FW.FX.winT > 0) return {ev: 'won'}; continue; }
    const r = __bossDecide(bo, bd); if (r.flap) flap(); if (r.dash) dash();
    FW.step(1/120);
    const b2 = FW.boss; if (!b2) continue;
    const evs = [b2.dieT > 0 && 'kill', b2.hitT > .5 && 'hit', b2.ph === 'enter' && b2.t > 1.6 && 'entrance', b2.ph === 'fight' && b2.t > 3 && 'hpbar',
      ({volley: b2.s.ph === 'act' || FW.bsh.some(e => e.k === 'ball' && e.x < b2.x - 110), wall: FW.bsh.some(e => e.k === 'wall' && e.x < FW.LW*.6)})[b2.s.atk] && 'attack'];
    const ev = evs.find(e => e && W.has(e)); if (ev) return {ev};
  }
  return {ev: FW.state === 'play' ? 'cap' : FW.state};
};
window.__bossDecide = function(bo, bd){
  const s = bo.s, a = s.atk, act = s.ph !== 'wait', G = 584, hr = 11, mins = FW.bsh.filter(e => e.k === 'min'), hunt = mins.length > 0 && FW.timers.dashMeter >= 1;
  const bands = [], far = e => Math.hypot(e.x - bd.x, e.y - bd.y);
  if (a === 'beam' && act) bands.push([bo.lock, 32 + hr + 12]);
  if (a === 'charge' && act) bands.push([bo.lock, 52 + hr + 14]);
  if (a === 'volley' && act) bands.push([bo.lock, 44]);
  for (const e of FW.bsh){
    if (e.k === 'min'){ if (!hunt && far(e) < 200) bands.push([e.y + e.vy*.25, e.r + hr + 60]); continue; }
    for (let t = 0; t <= .6; t += .03){ if (Math.abs(e.x + e.vx*t - bd.x) < e.r + hr + 4){ bands.push([e.y + e.vy*t, e.r + hr + 10]); break; } }
  }
  const clr = y => Math.min(60, ...bands.map(([q, r]) => Math.abs(y - q) - r));
  const want = hunt ? mins.reduce((m, e) => far(e) < far(m) ? e : m).y : (a === 'wall' && s.ph === 'tel') || FW.bsh.some(e => e.k === 'wall' && e.x > bd.x - 30) ? bo.hole : FW.timers.dashMeter > .85 ? bo.y : G * .5;
  let ty = want, best = -1e9;
  for (let y = 50; y <= G - 50; y += 6){ const c = clr(y), sc = (c < 0 ? c*10 - 400 : c) - Math.abs(y - bd.y)*.25 - Math.abs(y - want)*.08; if (sc > best){ best = sc; ty = y; } }
  const flap = bd.y > ty + (bands.length ? 24 : 6) && bd.vy > (clr(bd.y) < 0 ? -330 : -140) && (clr(bd.y - 75) > Math.min(0, clr(bd.y)) || bd.y > G - 22);
  const near = mins.find(e => e.x > bd.x - 30 && far(e) < 75);
  const dash = FW.timers.dashMeter >= 1 && bo.ph === 'fight' && (near || clr(bd.y) < -6 || (!mins.length && bo.hitT <= 0 && Math.abs(bo.y - bd.y) < 40));
  return {flap, dash};
};`;
const bossBot = (page, want, cap = 120 * 30) => page.evaluate(([w, c]) => window.__bossBot(w, c), [want, cap]);

let shotN = 0;
async function snap(page, name, { hold = true } = {}){
  if (hold) await page.evaluate(() => { if (window.FW) FW.hold = true; });
  await frame(page); await page.waitForTimeout(120); await frame(page);
  // JPEG quality 85: the 23 PNGs came to ~14 MB, too much for the repo
  const file = name.replace(/\.png$/, '.jpg');
  await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 85 }); shotN++; console.log('shot', file);
}
// click an element by id and wait for its overlay to show
const open = async (page, btn, scr) => { await page.evaluate(id => document.getElementById(id).click(), btn); if (scr) await page.waitForFunction(id => !document.getElementById(id).hidden, scr); await page.waitForTimeout(500); };

async function menuShots(page){
  await seed(page); await boot(page);
  if (want('01')) await snap(page, '01-title-menu.png', { hold: false });
  if (want('02')){
    await page.evaluate(() => document.getElementById('startBtn').click()); await page.waitForFunction(() => !document.getElementById('stageScr').hidden);
    await page.waitForTimeout(500);
    // scroll so the list shows a zone boundary and the stage-10 boss mark
    await page.evaluate(() => { const c = document.querySelectorAll('#stageScr .stc')[6]; if (c) c.scrollIntoView({ block: 'start' }); });
    await page.waitForTimeout(300); await snap(page, '02-stage-select.png', { hold: false });
    await page.evaluate(() => document.getElementById('stageClose').click());
  }
  if (want('03')){
    await boot(page);
    for (let i = 0; i < 6; i++){ await page.click('#hgNext'); await page.waitForTimeout(120); }
    await page.evaluate(() => document.getElementById('hangar').scrollIntoView({ block: 'center' })); await page.waitForTimeout(600);
    await snap(page, '03-hangar-units.png', { hold: false });
  }
}

async function playShots(page){
  for (const [n, st, zone] of [['04', 2, 'grove'], ['05', 14, 'canyon'], ['06', 29, 'magma'], ['07', 44, 'palace']]){
    if (!want(n)) continue;
    let got = false;
    for (let tries = 0; tries < 20 && !got; tries++){ await seed(page); await boot(page); await start(page, st, tries ? 'try' + tries : ''); got = await fly(page, 'FW.run.gatesPassed >= 5 && FW.gates.some(g => !g.scored && g.x < FW.LW*.8 && g.x > FW.bird.x + 60)') === 'hit'; }
    if (!got) console.log('MISSING', n); else await snap(page, `${n}-play-${zone}.png`);
  }
  const SUR = [['08', 'snap', 6, "FW.gates.some(g => g.sr && g.sr.k === 'snap' && g.sr.ext > .85)"],
    ['09', 'shot', 14, "FW.surs.some(e => e.k === 'shot' && e.t > .45 + .2)"],
    ['10', 'drop', 33, "FW.surs.some(e => e.k === 'drop' && e.t > .4 + .25)"]];
  for (const [n, kind, st, cond] of SUR){
    if (!want(n)) continue;
    let got = false;
    for (let tries = 0; tries < 40 && !got; tries++){ await seed(page); await boot(page); await start(page, st, tries ? 'try' + tries : ''); got = await fly(page, cond) === 'hit'; }
    if (!got) console.log('MISSING', n); else await snap(page, `${n}-surprise-${kind}.png`);
  }
}

async function bossShots(page){
  if (!['11', '12', '13'].some(want)) return;
  await page.addScriptTag({ content: BOSS_BOT });
  for (let tries = 0; tries < 12; tries++){
    await seed(page, { fw27_bird: 'volt', fw27_owned: ['volt'] }); await boot(page); await page.addScriptTag({ content: BOSS_BOT });
    await start(page, 9, tries ? 'try' + tries : ''); await page.evaluate(() => { FW.hold = true; });
    if (await fly(page, 'FW.run.gatesPassed >= 4') !== 'hit') continue;   // past the zone card first
    await page.evaluate(() => FW.bossGo());
    const got = new Set(); let r, n = 0;
    while (n++ < 400){
      r = await bossBot(page, ['entrance', 'attack', 'hit', 'kill'].filter(w => !got.has(w)));
      if (['won', 'dying', 'over', 'cont'].includes(r.ev)) break;
      if (r.ev === 'cap') continue;
      got.add(r.ev);
      if (r.ev === 'entrance' && want('11')) await snap(page, '11-boss-entrance.png');
      if (r.ev === 'attack' && want('12')) await snap(page, '12-boss-fight.png');
      if (r.ev === 'hit' && want('13')) await snap(page, '13-boss-ram-hit.png');
      if (r.ev === 'hit') await page.evaluate(() => { if (FW.boss && FW.boss.hp > 2) FW.boss.hp = 2; });   // a short fight from here
    }
    if (got.size < 3){ console.log('boss try', tries + 1, r.ev, [...got]); continue; }
    return;
  }
  console.log('MISSING boss shots');
}

// a real 100-gate clear of stage 1, flown by the gate bot: the MISSION CLEAR beat, then the result card with the clear rewards
async function clearShots(page){
  if (!['16', '17'].some(want)) return;
  for (let tries = 0; tries < 30; tries++){
    await seed(page); await boot(page); await start(page, 0, tries ? 'try' + tries : ''); await page.evaluate(() => { FW.hold = true; });
    if (await fly(page, 'FW.FX.winT > 0', 120 * 600) !== 'hit'){ console.log('clear try', tries + 1, 'failed'); continue; }
    await page.evaluate(() => FW.step(1/60, 20));
    if (want('16')) await snap(page, '16-stage-clear.png');
    await page.evaluate(() => FW.step(1/60, 80));
    await page.waitForFunction(() => FW.state === 'over'); await page.evaluate(() => { FW.hold = false; }); await page.waitForTimeout(1600);
    if (want('17')) await snap(page, '17-result-clear.png', { hold: false });
    return;
  }
  console.log('MISSING clear shots');
}

async function deathShots(page){
  if (!['14', '15'].some(want)) return;
  await seed(page); await boot(page); await start(page, 2, 'death');
  await fly(page, 'FW.run.gatesPassed >= 6');
  // stop flapping into the next gate's lip
  await page.evaluate(() => { for (let i = 0; i < 120 * 6 && FW.state === 'play'; i++) FW.step(1/120); });
  await page.evaluate(() => { for (let i = 0; i < 240 && FW.state === 'dying' && FW.imp.gray < .55; i++) FW.step(1/60); });   // mid gray-out
  if (want('14')) await snap(page, '14-death.png');
  await page.evaluate(() => { FW.hold = false; });
  await page.waitForFunction(() => FW.state === 'over' || FW.state === 'cont', null, { timeout: 15000 });
  if (await page.evaluate(() => FW.state === 'cont')) await page.click('#contNo');
  await page.waitForFunction(() => FW.state === 'over'); await page.waitForTimeout(1600);
  if (want('15')) await snap(page, '15-result-fail.png', { hold: false });
}

async function overlayShots(page){
  if (want('18')){
    await seed(page, { fw27_dintro: 0 }); await boot(page);
    await page.evaluate(() => document.getElementById('dailyBtn').click());
    await page.waitForTimeout(600);
    if (await page.evaluate(() => document.getElementById('dIntro').hidden)){ await page.waitForFunction(() => FW.state === 'play'); await fly(page, 'FW.run.gatesPassed >= 3'); }
    await snap(page, '18-daily.png', { hold: !(await page.evaluate(() => FW.state === 'menu')) });
  }
  if (want('19')){ await seed(page); await boot(page); await open(page, 'vsBtn', 'vsScr'); await page.waitForTimeout(800); await snap(page, '19-versus-menu.png', { hold: false }); }
  if (want('20')){
    await seed(page); await boot(page); await open(page, 'lbBtn', 'lbScr'); await page.waitForTimeout(800);
    await page.fill('#nickIn', '하늘나는새'); await page.focus('#nickIn');
    await page.evaluate(() => document.getElementById('nickForm').scrollIntoView({ block: 'center' }));
    await snap(page, '20-nickname.png', { hold: false });
  }
  if (want('21')){
    await seed(page, { fw27_block: [{ id: '00000000-0000-4000-8000-00000000000a', n: '차단한플레이어' }] }); await boot(page);
    await open(page, 'frBtn', 'frScr'); await page.waitForTimeout(800); await snap(page, '21-friends.png', { hold: false });
  }
  if (want('22')){
    await seed(page); await boot(page);
    await page.evaluate(() => FW.rpt.open([{ id: '00000000-0000-4000-8000-00000000000a', nick: '플레이어123' }], 'board'));
    await page.waitForTimeout(600); await snap(page, '22-report.png', { hold: false });
  }
  if (want('23')){ await seed(page); await boot(page); await open(page, 'fxBtn', 'fxScr'); await snap(page, '23-settings.png', { hold: false }); }
}

/* ---------- video: one continuous take, flown live by the bots at game speed (FW.hold + fixed 1/120 s steps per rAF) ---------- */
// The page-side driver: every animation frame it steps the game by the real time elapsed, at most 4 steps, deciding flaps per step.
// mode 'gate' = the gate bot, 'boss' = the boss bot, 'idle' = no input (a crash), 'off' = the game's own loop runs (menus, result cards).
const DRIVER = `window.__drv = { mode: 'off', t: 0 };
(function loop(ts){
  const d = window.__drv;
  if (d.mode !== 'off' && window.FW){
    FW.hold = true;
    const n = Math.min(4, Math.max(1, Math.round(((ts - (d.t || ts)) / 1000) * 120))); d.t = ts;
    for (let i = 0; i < n; i++){
      if (FW.state === 'play' && FW.FX.winT <= 0){
        if (d.mode === 'gate'){ const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), ty = g ? g.base + (g.off || 0) : 300;
          if (FW.bird.y > ty + 6 && FW.bird.vy > -120) dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); }
        else if (d.mode === 'boss' && FW.boss){ const r = __bossDecide(FW.boss, FW.bird);
          if (r.flap) dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); if (r.dash) dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })); }
        else if (d.mode === 'boss'){ const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), ty = g ? g.base + (g.off || 0) : 300;
          if (FW.bird.y > ty + 6 && FW.bird.vy > -120) dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })); }
      }
      FW.step(1/120);
    }
  } else d.t = 0;
  requestAnimationFrame(loop);
})(performance.now());`;

// Find a course salt (headless, off camera) on which the gate bot meets `cond` within `gates` gates of stage `st`
async function findSalt(page, st, cond, maxGates){
  for (let tries = 0; tries < 60; tries++){
    const salt = 'v' + tries;
    await boot(page); await start(page, st, salt); await page.evaluate(() => { FW.hold = true; });
    const r = await fly(page, cond, 120 * 90);
    const g = await page.evaluate(() => FW.run.gatesPassed);
    if (r === 'hit' && g <= maxGates) return salt;
  }
  return '';
}

async function video(b){
  mkdirSync(VIDEO_DIR, { recursive: true });
  // scout the salts first in a plain context
  const scout = await newPage(b);
  await scout.page.goto(base); await seed(scout.page);
  const s15 = await findSalt(scout.page, 14, "FW.surs.some(e => e.k === 'shot' && e.t > .5) || FW.gates.some(g => g.sr && g.sr.k === 'snap' && g.sr.ext > .6)", 14);
  const surviveCond = 'FW.run.gatesPassed >= 8';
  let s3 = '';
  for (let k = 0; k < 20 && !s3; k++){ await boot(scout.page); await start(scout.page, 2, 'g' + k); await scout.page.evaluate(() => { FW.hold = true; }); if (await fly(scout.page, surviveCond) === 'hit') s3 = 'g' + k; }
  await scout.ctx.close();
  console.log('salts', { s3, s15 });

  const tmp = join(VIDEO_DIR, 'tmp-rec'); rmSync(tmp, { recursive: true, force: true });
  const { ctx, page } = await newPage(b, { deviceScaleFactor: 1, recordVideo: { dir: tmp, size: VIEW } });
  await page.goto(base); await seed(page, { fw27_bird: 'volt', fw27_owned: ['volt'] });
  await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu');
  await page.addScriptTag({ content: BOSS_BOT }); await page.addScriptTag({ content: DRIVER });
  const drv = m => page.evaluate(m => { window.__drv.mode = m; if (m === 'off') FW.hold = false; }, m);
  const wait = ms => page.waitForTimeout(ms);
  const t0 = Date.now(), mark = s => console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`, s);
  const pick = async (i, salt) => {
    await page.evaluate(v => { FW.salt = v; }, salt); await page.click('#startBtn'); await wait(1300);
    await page.evaluate(n => document.querySelectorAll('#stageScr .stc')[n].scrollIntoView({ block: 'center', behavior: 'smooth' }), i); await wait(900);
    await page.evaluate(n => document.querySelectorAll('#stageScr .stc')[n].click(), i);
    await page.waitForFunction(() => FW.state === 'play');
  };
  const toMenu = async () => {
    await page.waitForFunction(() => FW.state === 'over' || FW.state === 'cont', null, { timeout: 30000 });
    if (await page.evaluate(() => FW.state === 'cont')) { await wait(800); await page.click('#contNo'); }
    await page.waitForFunction(() => FW.state === 'over'); await drv('off'); await wait(3200);
    await page.click('#menuBtn'); await page.waitForFunction(() => FW.state === 'menu'); await wait(1200);
  };

  mark('menu'); await wait(2500);
  // 1. SUNNY GROVE stage 3: real gates, then the hands come off: a crash, the gray-out, the result card
  mark('stage 3'); await pick(2, s3); await drv('gate');
  await page.waitForFunction(() => FW.run.gatesPassed >= 8 || FW.state !== 'play', null, { timeout: 60000 });
  mark('crash'); await drv('idle');
  await toMenu();
  // 2. CANYON RUN stage 15: gates and a surprise hazard; flown on, then a crash
  mark('stage 15'); await pick(14, s15); await drv('gate');
  await page.waitForFunction(() => FW.surs.some(e => e.k === 'shot') || FW.gates.some(g => g.sr && g.sr.k === 'snap' && g.sr.ext > .5) || FW.state !== 'play', null, { timeout: 60000 });
  mark('surprise'); await wait(3500);
  await drv('idle'); await toMenu();
  // 3. stage 10: a few gates, then the boss (FW.bossGo skips the rest of the course), rammed by the dash; the fight is cut short after the first ram hits
  mark('stage 10'); await pick(9, 'try1'); await drv('gate'); await wait(5000);
  if (await page.evaluate(() => FW.state === 'play')){
    await page.evaluate(() => FW.bossGo()); await drv('boss'); mark('boss');
    await page.waitForFunction(() => (FW.boss && FW.boss.hitT > .5) || FW.state !== 'play', null, { timeout: 60000 });
    await page.evaluate(() => { if (FW.boss && FW.boss.hp > 2) FW.boss.hp = 2; });
    mark('ram hit');
    await page.waitForFunction(() => FW.FX.winT > 0 || FW.state !== 'play', null, { timeout: 60000 });
    mark('won? ' + await page.evaluate(() => FW.FX.winT > 0));
    await page.waitForFunction(() => FW.state === 'over' || FW.state === 'cont', null, { timeout: 30000 });
    if (await page.evaluate(() => FW.state === 'cont')) await page.click('#contNo');
    await drv('off'); await wait(4500);
  }
  mark('end');
  const vid = page.video(); await ctx.close();
  const src = await vid.path(); const dst = join(VIDEO_DIR, 'swishby-play.webm');
  renameSync(src, dst); rmSync(tmp, { recursive: true, force: true });
  console.log('video', dst);
}

const b = await chromium.launch();
if (SHOTS){
  mkdirSync(OUT, { recursive: true });
  const { page } = await newPage(b);
  await page.goto(base);
  await menuShots(page); await playShots(page); await deathShots(page); await bossShots(page); await clearShots(page); await overlayShots(page);
  console.log(shotN, 'shots in', OUT, readdirSync(OUT).length, 'files');
}
if (VIDEO) await video(b);
await b.close();
