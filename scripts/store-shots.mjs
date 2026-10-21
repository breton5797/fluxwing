// Localized store screenshots from real autopilot play, with a caption band on top.
//   node scripts/store-shots.mjs [--langs=en,ja,es,pt,id,ko,es-ES,pt-PT] [--platforms=play,iphone69] [--out=dir] [--port=5173] [--seed=2027] [--only=title,combo]
// Output: <out>/<lang>/<platform>/NN-name.png. play: 1080x1920 (Google Play phone) · iphone69: 1320x2868 (iPhone 6.9").
// Default out: marketing/out/store/. Starts scripts/serve.mjs on --port unless a server is already there. *.supabase.co is never reached.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, ensureServer, openGame, startRun, play } from './marketing-kit.mjs';
import { SHOTS, CAPTIONS, LANGS, STORE_VARIANTS, gameLang, parseArgs } from './marketing-copy.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const opt = parseArgs(process.argv.slice(2), { langs: 'en,ja,es,pt,id,ko', platforms: 'play,iphone69', out: '', port: Number(process.env.PORT) || 5173, seed: 2027, only: '' });
const outDir = opt.out || join(ROOT, 'marketing/out/store');
// px: final size. game: the CSS viewport the game is captured at (dsf 2, zoom 1.5: it lays out at game.w / 1.5).
const PLATFORMS = {
  play: { px: [1080, 1920], game: { w: 540, h: 960 } },
  iphone69: { px: [1320, 2868], game: { w: 660, h: 1434 } },
};
const OWNED = ['volt', 'blitz', 'nimbus', 'titan', 'mochi', 'aegis', 'phoenix', 'zero', 'pixel', 'neko', 'buzz', 'kraken', 'specter', 'oracle', 'raijin', 'chrono', 'goliath', 'solaris', 'pulsar'];
// A player a few days in: some level, coins and records, so the title and result screens are not all zeros.
const PROFILE = { fw27_owned: OWNED, fw27_wallet2: { xp: 40, lvl: 18, coins: 48250, dia: 1280, gems: 36 }, fw27_best: 214, fw27_bestg: 71,
  fw27_stg2: { open: 49, gates: Array(50).fill(0), score: Array(50).fill(0), clr: Array(50).fill(0) }, fw27_nick: 'SWISHBY', fw27_rp2: 1240 };

// Each shot: which unit, how the game gets to the moment, and when to take it.
const SCENES = {
  title: { unit: 'phoenix', async go(page) { await page.waitForTimeout(900); } },
  combo: { unit: 'volt', stage: 2, pick: (f, p) => p && f.combo >= 5 && f.combo > p.combo, hold: 6 },
  dash: { unit: 'zero', stage: 14, bot: { skill: false }, pick: (f, p, k) => k > 150 && p && f.dash < p.dash - .5, hold: 3 },
  roster: { cards: ['solaris', 'kraken'] },   // the hangar card of two units, stacked (the shop is not open in this build)
  daily: { unit: 'kraken', daily: true, pick: (f, p, k) => k > 180 && p && f.combo >= 3 && f.combo > p.combo, hold: 6 },
  versus: { unit: 'pulsar', versus: true, pick: (f, p, k) => k > 150 && p && f.combo >= 2 && f.combo > p.combo, hold: 6 },
};

// Play until pick() says this frame is the shot (then `hold` frames more so the pop is on screen), at most 40 s.
async function playTo(page, sc) {
  let prev = null, best = null;
  for (let k = 0; k < 1200; k++) {
    const [f] = await play(page, 1);
    if (f.state !== 'play') return false;
    if (sc.pick(f, prev, k)) { await play(page, sc.hold); return true; }
    prev = f; best = k;
  }
  return best != null;
}

// The roster shot: each unit's hangar card from the title screen, stacked on the game's night sky.
async function rosterShot(browser, lang, plat, units, path) {
  const { w, h } = PLATFORMS[plat].game, cards = [];
  for (const unit of units) {
    const g = await openGame(browser, { port: opt.port, w, h, dsf: 2, zoom: 1.5, lang: gameLang(lang), hideHud: true, storage: { ...PROFILE, fw27_bird: unit } });
    // the card at its full height: on the title screen its text box scrolls to leave room for the buttons
    await g.page.addStyleTag({ content: '#hangar,#hangar .hg-info{flex:none!important;max-height:none!important;height:auto!important;overflow:visible!important}#hangar .hg-passive{display:block!important}' });
    await g.page.waitForTimeout(900);
    cards.push((await g.page.locator('#hangar').screenshot()).toString('base64'));
    await g.ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;display:flex;flex-direction:column;justify-content:center;gap:${Math.round(h * .03)}px;
    background:radial-gradient(80% 50% at 30% 20%,#3a1458 0%,#170a2c 55%,#0b0616 100%)">${cards.map(c => `<img style="max-width:${Math.round(w * .94)}px;max-height:${Math.round(h * .46)}px;margin:0 auto;display:block" src="data:image/png;base64,${c}">`).join('')}</body></html>`);
  await page.screenshot({ path });
  await ctx.close();
  return 1;
}

async function gameShot(browser, lang, plat, name, path) {
  const sc = SCENES[name], { w, h } = PLATFORMS[plat].game;
  if (sc.cards) return rosterShot(browser, lang, plat, sc.cards, path);
  for (let attempt = 0; attempt < 12; attempt++) {
    const seed = opt.seed + attempt * 101 + SHOTS.indexOf(name);
    const g = await openGame(browser, { port: opt.port, w, h, dsf: 2, zoom: 1.5, lang: gameLang(lang), seed, hideHud: true, storage: { ...PROFILE, fw27_bird: sc.unit } });
    let ok = true;
    if (sc.go) await sc.go(g.page);
    else if (sc.versus) {
      await g.page.click('#vsBtn'); await g.page.click('#vsAi');
      await g.page.waitForFunction(() => FW.state === 'play', null, { timeout: 8000 });
      await g.page.evaluate(() => MK.manual());
      ok = await playTo(g.page, sc);
    } else {
      await startRun(g.page, sc);
      if (sc.bot) await g.page.evaluate(o => Object.assign(MK.o, o), sc.bot);
      ok = await playTo(g.page, sc);
    }
    if (ok) await g.page.screenshot({ path });
    const errors = g.errors.slice();
    await g.ctx.close();
    if (errors.length) console.log(`  ${lang}/${plat}/${name}: page errors: ${errors.join(' | ')}`);
    if (ok) return attempt + 1;
  }
  throw new Error(`${lang}/${plat}/${name}: no run reached the moment`);
}

const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// The frame: a caption band (headline + sub line) over the game shot, which sits in a rounded, glowing phone-like card.
function frameHtml(lang, [W, H], [head, sub], shot) {
  const cw = W / 2, ch = H / 2, band = Math.round(ch * .2), gh = Math.round(ch - band - ch * .035), gw = Math.round(gh * W / H);
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@600;700&display=block" rel="stylesheet">
<style>html,body{margin:0;width:${cw}px;height:${ch}px;overflow:hidden}
body{background:radial-gradient(90% 60% at 50% 0%,#5a1772 0%,#250b3f 45%,#0d0618 100%);font-family:"Chakra Petch","Hiragino Sans","Apple SD Gothic Neo","PingFang SC","Thonburi","Kohinoor Devanagari","Noto Sans SC","Noto Sans Thai","Noto Sans Devanagari",system-ui,sans-serif;color:#fff}
.band{height:${band}px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 ${Math.round(cw * .06)}px;box-sizing:border-box;gap:${Math.round(band * .05)}px}
h1{margin:0;font-weight:700;font-size:${Math.round(cw * .083)}px;line-height:1.08;letter-spacing:-.01em;text-shadow:0 3px 0 rgba(0,0,0,.35),0 0 26px rgba(255,61,139,.55)}
p{margin:0;font-weight:600;font-size:${Math.round(cw * .045)}px;color:#7ff3ff;opacity:.95}
.shot{display:block;margin:0 auto;width:${gw}px;height:${gh}px;border-radius:${Math.round(cw * .055)}px;overflow:hidden;box-shadow:0 0 0 3px rgba(255,255,255,.18),0 0 0 7px #ff3d8b,0 0 46px rgba(255,61,139,.55),0 22px 60px rgba(0,0,0,.6)}
.shot img{width:100%;height:100%;display:block}</style></head>
<body><div class="band"><h1>${esc(head)}</h1><p>${esc(sub)}</p></div><div class="shot"><img src="data:image/png;base64,${shot.toString('base64')}"></div></body></html>`;
}

async function compose(browser, lang, plat, name, raw, path) {
  const [W, H] = PLATFORMS[plat].px;
  const ctx = await browser.newContext({ viewport: { width: W / 2, height: H / 2 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(frameHtml(lang, [W, H], CAPTIONS[lang][name], readFileSync(raw)), { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path });
  await ctx.close();
}

const langs = opt.langs.split(','), plats = opt.platforms.split(','), only = opt.only ? opt.only.split(',') : SHOTS;
for (const l of langs) if (!LANGS.includes(l) && !STORE_VARIANTS[l]) { console.error(`unknown lang ${l}`); process.exit(1); }
for (const p of plats) if (!PLATFORMS[p]) { console.error(`unknown platform ${p}`); process.exit(1); }
const stop = await ensureServer(opt.port);
const browser = await chromium.launch();
const made = [];
try {
  const jobs = [];
  for (const lang of langs) for (const plat of plats) SHOTS.forEach((name, i) => { if (only.includes(name)) jobs.push({ lang, plat, name, i }); });
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < jobs.length) {
      const { lang, plat, name, i } = jobs[next++], dir = join(outDir, lang, plat);
      mkdirSync(join(dir, 'raw'), { recursive: true });
      const file = `${String(i + 1).padStart(2, '0')}-${name}.png`, raw = join(dir, 'raw', file);
      const tries = await gameShot(browser, lang, plat, name, raw);
      await compose(browser, lang, plat, name, raw, join(dir, file));
      made.push({ lang, platform: plat, file: join(lang, plat, file), caption: CAPTIONS[lang][name][0], size: PLATFORMS[plat].px.join('x'), tries });
      console.log(`${lang}/${plat}/${file}  "${CAPTIONS[lang][name][0]}"`);
    }
  }));
} finally {
  await browser.close(); stop();
}
made.sort((a, b) => a.file.localeCompare(b.file));
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ created: new Date().toISOString(), shots: made }, null, 2) + '\n');
console.log(`wrote ${made.length} screenshots to ${outDir} (raw game captures in each raw/ folder)`);
