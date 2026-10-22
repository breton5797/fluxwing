// Official SNS profile images from the brand art: sizes come from docs/launch/sns-kit.json.
//   node scripts/sns-images.mjs [--art=key-art.png] [--bird=bird.png] [--out=dir]
// The art is not in the repo (the site is public): defaults are ~/Downloads/swishby-marketing/brand/key-art.png (wide key art,
// logo left + bird right, 1795x876) and bird.png (square bird, 1254x1254).
// Output: <out>/profile.png (1080x1080, TikTok/Instagram/X/YouTube avatar), youtube-banner.png (2560x1440: logo and bird inside
// YouTube's 1546x423 safe area, a blurred copy of the art fills the rest), x-header.png (1500x500, cropped so the
// avatar overlap at the bottom left misses the logo). Default out: marketing/out/sns/.
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { parseArgs } from './marketing-copy.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BRAND = join(homedir(), 'Downloads/swishby-marketing/brand');
const opt = parseArgs(process.argv.slice(2), { art: join(BRAND, 'key-art.png'), bird: join(BRAND, 'bird.png'), out: '' });
const outDir = opt.out || join(ROOT, 'marketing/out/sns');
const KIT = JSON.parse(readFileSync(join(ROOT, 'docs/launch/sns-kit.json'), 'utf8'));
const dataUrl = file => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const ART = dataUrl(opt.art), BIRD = dataUrl(opt.bird);
const ART_W = 1795, ART_H = 876;
// The band of the key art that holds the logo (with "2027") and the bird's head and wings
const BAND = { y: 160, h: 492 };

// A box showing the key art from art row `y` down, scaled to `w` px wide
const artBox = ({ w, y, h, style = '' }) => {
  const k = w / ART_W;
  return `<div style="width:${w}px;height:${h}px;background:url(${ART}) 0 ${-Math.round(y * k)}px/${w}px ${Math.round(ART_H * k)}px no-repeat;${style}"></div>`;
};

// YouTube: the band fills the 1546x423 safe area; a blurred, darkened cover of the art behind it; feathered edges
const youtube = ([w, h]) => {
  const safeW = 1546, k = safeW / ART_W, safeH = Math.round(BAND.h * k);
  const fade = 'linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent)';
  return `
  <div style="position:absolute;inset:-60px;background:url(${ART}) center/cover;filter:blur(28px) brightness(.55) saturate(1.2)"></div>
  <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">
    ${artBox({ w: safeW, y: BAND.y, h: safeH, style: `-webkit-mask-image:${fade};mask-image:${fade}` })}
  </div>`;
};

const PAGES = [
  { file: 'profile.png', size: KIT.images.profile, body: ([w, h]) => `<img src="${BIRD}" style="width:${w}px;height:${h}px;display:block;object-fit:cover">` },
  { file: 'youtube-banner.png', size: KIT.images.youtubeBanner, body: youtube },
  // X: 3:1 crop starting under the logo's top star, so "SWISHBY 2027" sits above the avatar that overlaps the bottom left
  { file: 'x-header.png', size: KIT.images.xHeader, body: ([w, h]) => artBox({ w, y: 200, h }) },
];

const browser = await chromium.launch();
try {
  mkdirSync(outDir, { recursive: true });
  for (const p of PAGES){
    const [w, h] = p.size;
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#12082a}</style></head>
      <body style="position:relative">${p.body(p.size)}</body></html>`, { waitUntil: 'load' });
    await page.screenshot({ path: join(outDir, p.file) });
    await page.close();
    process.stdout.write(`${join(outDir, p.file)} ${w}x${h}\n`);
  }
} finally {
  await browser.close();
}
