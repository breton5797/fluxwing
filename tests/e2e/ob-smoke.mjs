// Themed obstacle smoke: node tests/e2e/ob-smoke.mjs  (dev server: PORT=5291 node scripts/serve.mjs; PORT defaults to 5173)
// Every *supabase* request is aborted. Waits for the 37 art files, then at a 390x844 phone size, per zone: screenshots the gates a few seconds in,
// measures one static gate on the canvas (a frame with it minus a frame without it), and screenshots it as a moving gate, a broken (dashed) one,
// a twin pair and, in the grove, with its branch dropped. Fairness, per piece: the drawn stem covers at least 85 % of the 68 px hit width, the
// tip reaches within 3 px of the gap edge and nothing is drawn more than 3 px into the gap. Screenshots land in $SHOTS as ob-*.png.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = `http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`, shots = process.env.SHOTS || tmpdir();
const b = await chromium.launch(), ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
await page.route(/supabase/, r => r.abort());

const z50 = () => Array(50).fill(0);
const seed = () => page.evaluate(stg => { localStorage.clear(); for (const [k, v] of Object.entries({ fw27_tut: 1, fw27_lang: 'en', fw27_dintro: 1, fw27_stg2: stg }))
  localStorage.setItem(k, JSON.stringify(v)); }, { gates: z50(), score: z50(), clr: z50(), star: z50(), open: 49 });
const artIn = () => page.waitForFunction(() => performance.getEntriesByType('resource').filter(e => /\/art\/[\w-]+\.webp$/.test(e.name) && e.responseEnd > 0).length >= 37, null, { timeout: 15000 });
const boot = async () => { await page.reload(); await page.waitForFunction(() => window.FW && FW.state === 'menu'); await artIn(); await page.waitForTimeout(150); };
const start = async (i, salt = '') => { await page.evaluate(v => { FW.salt = v; document.getElementById('startBtn').click(); }, salt); await page.evaluate(n => document.querySelectorAll('#stageScr .stc')[n].click(), i);
  await page.waitForFunction(() => FW.state === 'play'); };
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const snap = async name => { await page.evaluate(() => { const d = document.getElementById('fxDev'); if (d) d.remove(); }); await frame(); await page.screenshot({ path: join(shots, `ob-${name}.png`) }); console.log('shot', name); };
const fly = (until, cap = 120 * 120) => page.evaluate(([u, c]) => {
  const stop = new Function('FW', 'return ' + u), flap = () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  for (let i = 0; i < c && FW.state === 'play'; i++){
    const g = FW.gates.find(q => !q.scored && q.x + q.w > FW.bird.x - 20), ty = g ? g.base + (g.off || 0) : 300;
    if (FW.bird.y > ty + 6 && FW.bird.vy > -120) flap();
    FW.step(1/120);
    if (stop(FW)) return 'hit';
  }
  return FW.state;
}, [until, cap]);
const ZONE = [[0, 'grove'], [14, 'canyon'], [33, 'magma'], [45, 'palace']];
// a plain static gate fully on screen, right of the bird: its gap edges are base -/+ gap/2
// (the screen is LW = 640 * width / height logical px wide)
const PLAIN = "FW.gates.some(g => g.type === 'static' && !g.sg && !g.twin && !g.lane && !g.sr && g.x > FW.bird.x + 40 && g.x + g.w < 640 * innerWidth / innerHeight - 10)";

// The obstacle probe: every draw of an art/ob-* image, of a canvas made from one (a stem's head, a soft tip) or of a pattern of one on the game
// canvas is mirrored, with the same transform and alpha, onto a transparent canvas while __obProbe.on, so the measure reads the art's own alpha
// whatever the backdrop behind it
await page.addInitScript(() => {
  const P = CanvasRenderingContext2D.prototype, cp = P.createPattern, di = P.drawImage, fr = P.fillRect, src = new WeakMap(), made = new WeakSet(), ob = img => img && (made.has(img) || /\/art\/ob-/.test(img.src || ''));
  const probe = window.__obProbe = { on: false, c: null };
  const mirror = (ctx, f) => { if (!probe.on || ctx.canvas.id !== 'c') return; const q = probe.c; q.setTransform(ctx.getTransform()); q.globalAlpha = ctx.globalAlpha; f(q); };
  P.createPattern = function(img, rep){ const pat = cp.call(this, img, rep); if (pat && ob(img)) src.set(pat, img); return pat; };
  P.drawImage = function(img, ...a){ if (ob(img)){ if (this.canvas.id !== 'c') made.add(this.canvas); mirror(this, q => di.call(q, img, ...a)); } return di.call(this, img, ...a); };
  P.fillRect = function(...a){ const img = src.get(this.fillStyle); if (img) mirror(this, q => { q.fillStyle = cp.call(q, img, 'repeat-y'); fr.call(q, ...a); }); return fr.call(this, ...a); };
});

// One piece (k) of a plain gate moved to base, so the piece's stem has room past its tip. Read off the probe (opaque: alpha >= 128, in logical
// px, LH 640 over the canvas height): the stem's mean cover of the 68 px hit width over rows 160-400 px from the gap edge (past the tip), the
// tip's over rows 0-40, the first row from the edge with the tip in it, and how far anything reaches into the gap.
const measure = async (zone, k, base) => {
  await page.evaluate(base => { const s = innerHeight / 640, g = FW.gates.find(g => g.type === 'static' && !g.sg && !g.twin && !g.lane && !g.sr && g.x > FW.bird.x + 40 && g.x + g.w < innerWidth / s - 10);
    g.b0 = g.base; g.base = base; }, base);
  await snap(`measure-${zone}-${k}`);
  return page.evaluate(async k => {
    const cv = document.getElementById('c'), s = cv.height / 640, pr = window.__obProbe, pc = document.createElement('canvas');
    pc.width = cv.width; pc.height = cv.height; pr.c = pc.getContext('2d');
    pr.on = true; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); pr.on = false;
    const g = FW.gates.find(g => 'b0' in g), A = pr.c.getImageData(0, 0, pc.width, pc.height).data, W = pc.width;
    const x0 = Math.round(g.x*s), x1 = Math.round((g.x + g.w)*s), row = y => { let n = 0; y = Math.round(y); for (let x = x0; x < x1; x++) n += A[(y*W + x)*4 + 3] >= 128; return n; };
    const d = k === 'bot' ? 1 : -1, E = (g.base + d*g.gap/2)*s, band = (a, z) => { let c = 0, n = 0;
      for (let y = E + d*a*s; d > 0 ? y < Math.min(E + z*s, 584*s) : y > Math.max(E - z*s, 0); y += d){ c += row(y) / (x1 - x0); n++; } return n ? c / n : null; };
    let tip = null; for (let t = 0; t <= 20*s && tip === null; t++) if (row(E + d*t) >= 2) tip = t / s;
    let into = 0; for (let t = 1; t <= 20*s; t++) if (row(E - d*t) >= 2) into = t / s;
    g.base = g.b0; delete g.b0;
    return { cover: band(160, 400), tipCover: band(0, 40), tip, into };
  }, k);
};

await page.goto(base);
await seed();
const report = {};
for (const [st, zone] of ZONE){
  let got = false;
  for (let tries = 0; tries < 30 && !got; tries++){ await boot(); await start(st, tries ? 'try' + tries : ''); got = await fly(`FW.run.gatesPassed >= 3 && ${PLAIN}`) === 'hit'; }
  assert.ok(got, 'a plain gate on screen in the ' + zone);
  await page.evaluate(() => { FW.hold = true; });
  await snap(`gates-${zone}`);
  const m = report[zone] = {bot: await measure(zone, 'bot', 190), top: await measure(zone, 'top', 440)};
  console.log(zone, JSON.stringify(m));
  for (const k of ['bot', 'top']){
    if (m[k].cover !== null) assert.ok(m[k].cover >= .85, `${zone} ${k}: the stem covers ${(m[k].cover*100).toFixed(1)} % of the hit width`);
    assert.ok(m[k].tip !== null && m[k].tip <= 3, `${zone} ${k}: the tip shows ${m[k].tip} px from the gap edge`);
    assert.ok(m[k].into <= 3, `${zone} ${k}: drawn ${m[k].into} px into the gap`);
  }
  // two gates placed in view: a moving one (the grove's with its branch dropped) and a broken (dashed) one; then a twin pair, 34 px apart
  const place = (z, twin) => page.evaluate(([z, twin]) => {
    const gs = [...FW.gates].sort((a, b) => b.x - a.x).slice(0, 2).reverse(), lw = 640 * innerWidth / innerHeight;
    for (const g of gs){ g.sg = null; g.brK = 0; g.broken = false; }
    gs[0].x = twin ? lw - 2*68 - 34 - 8 : 110; gs[1].x = twin ? lw - 68 - 8 : 210; gs[1].broken = !twin;
    gs[0].type = twin ? 'static' : 'move'; gs[0].amp = 40; gs[0].twin = gs[1].twin = twin; if (twin) gs[1].base = gs[0].base;
    if (z === 'grove' && !twin){ gs[0].sg = { k: 'branch', drop: 60 }; gs[0].brK = 1; gs[0].brSh = 0; }
  }, [z, twin]);
  await place(zone, false); await snap(`variants-${zone}`);
  await place(zone, true);
  await snap(`twin-${zone}`);
}

assert.deepEqual(errors, []);
await b.close();
console.log('ob smoke: ok', JSON.stringify(report));
