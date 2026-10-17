// Measures render() cost under 4x CPU throttle. Usage:
//   node scripts/fx-bench.mjs [--q=low|mid|high] [--label=before|after]
// Needs the dev server (npm run dev) on 127.0.0.1:5173 (IPv4 — localhost may be shadowed by another Vite).
import { chromium } from 'playwright';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const base = `http://127.0.0.1:${process.env.PORT || 5173}`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const cdp = await page.context().newCDPSession(page);
await page.goto(`${base}/index.html#dev`);
await page.waitForFunction(() => window.FW);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const res = await page.evaluate(async q => {
  if (q && window.FW.setFxQuality) window.FW.setFxQuality(q);
  document.getElementById('startBtn').click();
  await new Promise(r => setTimeout(r, 1500));
  window.FW.hold = true;
  window.FW.cast();                       // a frame with plenty going on
  const ms = [];
  for (let i = 0; i < 200; i++){ const t0 = performance.now(); window.FW.dbg.render(); ms.push(performance.now() - t0); }
  ms.sort((a, b) => a - b);
  return { avgMs: +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(3), p95Ms: +ms[Math.floor(ms.length * .95)].toFixed(3), frames: ms.length };
}, arg('q'));
console.log(JSON.stringify({ label: arg('label') || 'before', q: arg('q') || 'n/a', ...res }));
await browser.close();
