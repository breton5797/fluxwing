// Records a short scene and converts it to a GIF for before/after comparison.
//   node scripts/fx-gif.mjs --scene=death|record|fever --out=docs/fx/gif/before-death.gif
// Needs the dev server on 127.0.0.1:5173 and ffmpeg on PATH.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const arg = k => (process.argv.find(a => a.startsWith(`--${k}=`)) || '').split('=')[1];
const scene = arg('scene'), out = arg('out');
if (!scene || !out) { console.error('usage: --scene=death|record|fever --out=file.gif'); process.exit(1); }
const vidDir = mkdtempSync(join(tmpdir(), 'fxgif-'));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, recordVideo: { dir: vidDir, size: { width: 390, height: 844 } } });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${process.env.PORT || 5173}/index.html#dev`);
await page.waitForFunction(() => window.FW);
await page.click('#startBtn');
await page.waitForTimeout(1200);
if (scene === 'death') {
  await page.evaluate(() => FW.kill());
  await page.waitForTimeout(2200);
} else if (scene === 'record') {
  await page.evaluate(() => { FW.setRun({ score: 10 }); });
  await page.evaluate(() => { localStorage.setItem('fw27_best', '3'); });
  await page.waitForTimeout(400);
  await page.evaluate(() => FW.kill());       // run ends → record flow on the result card
  await page.waitForTimeout(2600);
} else if (scene === 'fever') {
  // force fever via a unit cast when possible, else simulate long play
  await page.evaluate(() => { for (let i = 0; i < 40; i++) FW.step(1 / 60, 1); FW.cast(); });
  await page.waitForTimeout(2400);
}
await ctx.close(); await browser.close();
const webm = readdirSync(vidDir).find(f => f.endsWith('.webm'));
mkdirSync(dirname(out), { recursive: true });
execFileSync('ffmpeg', ['-y', '-i', join(vidDir, webm), '-vf', 'fps=20,scale=360:-1', out], { stdio: 'ignore' });
rmSync(vidDir, { recursive: true, force: true });
console.log('wrote', out);
