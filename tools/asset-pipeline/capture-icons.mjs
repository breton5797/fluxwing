// Renders every unit through the game's own drawShape into 256x256 PNGs (dev server must run).
// Usage: node tools/asset-pipeline/capture-icons.mjs   → assets/_gen/icons-raw/<id>.png
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const OUT = join(ROOT, 'assets/_gen/icons-raw');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:5173/?icons=1#dev');
await page.waitForFunction(() => window.FW && FW.BIRDS, null, { timeout: 10000 });
await page.waitForTimeout(1200); // let premium unit images load

const shots = await page.evaluate(() => {
  const out = {};
  for (const d of FW.BIRDS) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c = cv.getContext('2d');
    c.translate(128, 136);
    const k = 200 / Math.max(d.span * 2.1, d.r * 5.4);
    c.scale(k, k);
    FW.dbg.drawShape(c, d, 0.5, d.uiCol || d.col, { lite: false, pose: 0, vy: 0 });
    out[d.id] = cv.toDataURL('image/png');
  }
  return out;
});
for (const [id, url] of Object.entries(shots)) {
  writeFileSync(join(OUT, `${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
}
console.log('captured', Object.keys(shots).length, 'unit icons ->', OUT);
await browser.close();
