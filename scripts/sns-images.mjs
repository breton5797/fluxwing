// Official SNS profile images from the brand assets (icon.svg, logo-swishby.png): sizes come from docs/launch/sns-kit.json.
//   node scripts/sns-images.mjs [--out=dir]
// Output: <out>/profile.png (1080x1080, TikTok/Instagram/X/YouTube avatar), youtube-banner.png (2560x1440, the logo stays
// inside YouTube's 1546x423 safe area), x-header.png (1500x500, content kept right of the avatar overlap). Default out: marketing/out/sns/.
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { parseArgs } from './marketing-copy.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const opt = parseArgs(process.argv.slice(2), { out: '' });
const outDir = opt.out || join(ROOT, 'marketing/out/sns');
const KIT = JSON.parse(readFileSync(join(ROOT, 'docs/launch/sns-kit.json'), 'utf8'));
const dataUrl = (file, type) => `data:${type};base64,${readFileSync(join(ROOT, file)).toString('base64')}`;
const ICON = dataUrl('icon.svg', 'image/svg+xml');
const LOGO = dataUrl('logo-swishby.png', 'image/png');
const BG = 'radial-gradient(120% 140% at 30% 0%, #2a1458 0%, #170a33 45%, #0d0618 100%)';

// One banner: icon + wordmark + link, centered in a box of boxW x boxH (the area every device shows), offset by dx
const banner = ({ boxW, boxH, dx = 0 }) => `
  <div style="position:absolute;left:calc(50% + ${dx}px);top:50%;transform:translate(-50%,-50%);width:${boxW}px;height:${boxH}px;
    display:flex;align-items:center;justify-content:center;gap:${Math.round(boxH * .12)}px">
    <img src="${ICON}" style="height:${Math.round(boxH * .78)}px;border-radius:${Math.round(boxH * .17)}px;box-shadow:0 0 0 ${Math.max(3, Math.round(boxH * .012))}px #4ff0ff66">
    <div style="display:flex;flex-direction:column;align-items:flex-start;gap:${Math.round(boxH * .05)}px">
      <img src="${LOGO}" style="height:${Math.round(boxH * .42)}px">
      <div style="font:700 ${Math.round(boxH * .1)}px 'Chakra Petch',sans-serif;color:#4ff0ff;letter-spacing:.08em">${KIT.link.replace('https://', '')}</div>
    </div>
  </div>`;

const PAGES = [
  { file: 'profile.png', size: KIT.images.profile, body: `<img src="${ICON}" style="width:100%;height:100%;display:block">` },
  { file: 'youtube-banner.png', size: KIT.images.youtubeBanner, body: banner({ boxW: 1546, boxH: 423 }) },
  { file: 'x-header.png', size: KIT.images.xHeader, body: banner({ boxW: 1100, boxH: 330, dx: 150 }) },
];

const browser = await chromium.launch();
try {
  mkdirSync(outDir, { recursive: true });
  for (const p of PAGES){
    const [w, h] = p.size;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<!doctype html><html><head>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@700&display=swap">
      <style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:${BG}}</style></head>
      <body style="position:relative">${p.body}</body></html>`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(outDir, p.file) });
    await page.close();
    process.stdout.write(`${join(outDir, p.file)} ${w}x${h}\n`);
  }
} finally {
  await browser.close();
}
