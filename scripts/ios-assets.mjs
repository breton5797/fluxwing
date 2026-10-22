// iOS app icon and launch image from the game's own art: icon.svg rendered at 1024x1024 with no transparency (App Store icons
// must be opaque), and a 2732x2732 launch image (the game's dark sky with the SWISHBY logo). Writes into ios/App/App/Assets.xcassets.
//   node scripts/ios-assets.mjs
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const root = new URL('..', import.meta.url);
const icons = new URL('ios/App/App/Assets.xcassets/AppIcon.appiconset/', root);
const splash = new URL('ios/App/App/Assets.xcassets/Splash.imageset/', root);
const svg = readFileSync(new URL('icon.svg', root), 'utf8');
const logo = readFileSync(new URL('logo-swishby.png', root)).toString('base64');

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#150a33">${svg.replace('<svg ', '<svg width="1024" height="1024" ')}</body></html>`);
  await page.screenshot({ path: new URL('AppIcon-512@2x.png', icons).pathname, omitBackground: false });

  await page.setViewportSize({ width: 2732, height: 2732 });
  await page.setContent(`<html><body style="margin:0;width:2732px;height:2732px;display:flex;align-items:center;justify-content:center;
    background:radial-gradient(70% 50% at 50% 40%,#5a1772 0%,#250b3f 45%,#0d0618 100%)">
    <img src="data:image/png;base64,${logo}" style="width:1100px;height:auto"></body></html>`);
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
    await page.screenshot({ path: new URL(f, splash).pathname });
} finally {
  await browser.close();
}
process.stdout.write('wrote AppIcon-512@2x.png and the launch images\n');
