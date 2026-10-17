// Picks the best of each unit's background-removed candidates, emits 512/256/128 PNG+WebP,
// moves rejects to assets/_rejected/, and records everything in assets/manifest.json.
// Usage: node tools/asset-pipeline/process.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { selectBest } from './select.js';
import { makeEntry, upsertManifest } from './manifest.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const UNITS = {
  bulwark: 'epic', catalyst: 'epic', mirage: 'rare',
  tempo: 'rare', magnet: 'rare', phoenix: 'legend',
};
const PROMPTS = JSON.parse(readFileSync(join(ROOT, 'tools/asset-pipeline/prompts.json'), 'utf8'));

async function grid(file) {
  const { data, info } = await sharp(file).resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height, a = new Uint8Array(n), l = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    a[i] = data[i * 4 + 3];
    l[i] = Math.round(0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]);
  }
  return { w: info.width, h: info.height, a, l };
}

let manifest = existsSync(join(ROOT, 'assets/manifest.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'assets/manifest.json'), 'utf8')) : { assets: [] };

for (const [unit, grade] of Object.entries(UNITS)) {
  const dir = join(ROOT, 'assets/_gen', unit, 'nobg');
  const files = readdirSync(dir).filter(f => f.endsWith('.png')).map(f => join(dir, f));
  if (!files.length) { console.log(unit, 'no candidates'); continue; }
  const grids = [];
  for (const f of files) grids.push(await grid(f));
  const best = selectBest(grids);
  const outDir = join(ROOT, 'assets/units', unit);
  mkdirSync(outDir, { recursive: true });
  const rejDir = join(ROOT, 'assets/_rejected', unit);
  mkdirSync(rejDir, { recursive: true });
  const paths = {};
  for (const size of [512, 256, 128]) {
    const base = sharp(files[best]).trim().resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } });
    await base.clone().png().toFile(join(outDir, `${size}.png`));
    await base.clone().webp({ quality: 90 }).toFile(join(outDir, `${size}.webp`));
    paths[`png${size}`] = `assets/units/${unit}/${size}.png`;
    paths[`webp${size}`] = `assets/units/${unit}/${size}.webp`;
  }
  files.forEach((f, i) => { if (i !== best) renameSync(f, join(rejDir, `${i}.png`)); });
  manifest = upsertManifest(manifest, makeEntry({ id: unit, grade, paths, prompt: PROMPTS[unit] ?? '' }));
  console.log(unit, `picked candidate ${best} of ${files.length}`);
}
writeFileSync(join(ROOT, 'assets/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest updated:', manifest.assets.length, 'entries');
