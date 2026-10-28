// Measures real frame cost under 4x CPU throttle: rAF-to-rAF intervals while the game's own loop renders, so the canvas
// raster (done at the frame commit, after render() returns) is counted too. Timing render() alone missed it (~25x too fast).
// Usage:
//   node scripts/fx-bench.mjs [--q=low|mid|high] [--frames=600] [--label=before|after]
// Needs the dev server (npm run dev) on 127.0.0.1:5173, or PORT=<port>. Supabase is blocked: the bench never talks to production.
import { chromium } from 'playwright';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const base = `http://127.0.0.1:${process.env.PORT || 5173}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
await page.route(/supabase\.co/, r => r.abort());
const cdp = await page.context().newCDPSession(page);
await page.goto(`${base}/index.html#dev`);
await page.waitForFunction(() => window.FW);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const res = await page.evaluate(async ({ q, frames }) => {
  if (q && window.FW.setFxQuality) window.FW.setFxQuality(q);
  document.getElementById('startBtn').click();
  await new Promise(r => setTimeout(r, 1500));
  window.FW.hold = true;                  // the scene stays put (no death mid-bench); the real loop keeps rendering it
  const busy = () => {                    // a frame with plenty going on, post effects active (waves/chroma/bloom) — review C1
    window.FW.cast();
    if (window.FW.fx){ window.FW.fx('shieldHit'); window.FW.fx('overdrive'); }
  };
  const ms = [];
  await new Promise(done => {
    let prev = 0, n = 0;
    const tick = now => {
      if (prev) ms.push(now - prev);
      prev = now;
      if (n++ % 60 === 0) busy();
      if (ms.length < frames) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  window.FW.hold = false;
  const s = ms.slice().sort((a, b) => a - b), at = p => +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(1);
  return { q: window.FW.imp && window.FW.imp.q, frames: s.length, p50Ms: at(.5), p95Ms: at(.95), over33: s.filter(v => v > 33).length,
    maxMs: +s[s.length - 1].toFixed(1) };
}, { q: arg('q'), frames: +(arg('frames') || 600) });
console.log(JSON.stringify({ label: arg('label') || 'before', ...res }));
await browser.close();
