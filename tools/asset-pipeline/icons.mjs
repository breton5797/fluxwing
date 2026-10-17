// Composes shop icons: 256x256, rounded grade border over a dark card background.
// Usage: node tools/asset-pipeline/icons.mjs   → assets/icons/<id>.png + .webp, manifest entries
import sharp from 'sharp';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { makeEntry, upsertManifest, GRADES } from './manifest.js';

const ROOT = new URL('../..', import.meta.url).pathname;
const RAW = join(ROOT, 'assets/_gen/icons-raw');
const OUTDIR = join(ROOT, 'assets/icons');
mkdirSync(OUTDIR, { recursive: true });

// grade -> border colour (일반 회색 / 희귀 파랑 / 영웅 보라 / 전설 금색)
const BORDER = { common: '#8e98a8', rare: '#3b82f6', epic: '#a855f7', legend: '#f5c518' };
// in-game rarity rank -> icon grade (0 common, 1 rare, 2-3 epic, 4 legend)
const RANK2GRADE = ['common', 'rare', 'epic', 'epic', 'legend'];

// ranks straight from the BIRDS table (kept in sync by tests/asset-pipeline through manifest review)
const RANKS = JSON.parse(readFileSync(join(ROOT, 'tools/asset-pipeline/ranks.json'), 'utf8'));

function frame(grade) {
  const c = BORDER[grade];
  return Buffer.from(`<svg width="256" height="256">
    <rect x="3" y="3" width="250" height="250" rx="26" fill="#141926"/>
    <rect x="3" y="3" width="250" height="250" rx="26" fill="none" stroke="${c}" stroke-width="6"/>
    <rect x="9" y="9" width="238" height="238" rx="21" fill="none" stroke="${c}" stroke-opacity="0.35" stroke-width="2"/>
  </svg>`);
}

let manifest = existsSync(join(ROOT, 'assets/manifest.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'assets/manifest.json'), 'utf8')) : { assets: [] };

for (const f of readdirSync(RAW).filter(f => f.endsWith('.png'))) {
  const id = f.replace('.png', '');
  const grade = RANK2GRADE[RANKS[id] ?? 0];
  if (!GRADES.includes(grade)) throw new Error(`bad grade for ${id}`);
  const unit = await sharp(join(RAW, f)).resize(208, 208, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const img = sharp(frame(grade)).composite([{ input: unit, left: 24, top: 24 }]);
  await img.clone().png().toFile(join(OUTDIR, `${id}.png`));
  await img.clone().webp({ quality: 90 }).toFile(join(OUTDIR, `${id}.webp`));
  manifest = upsertManifest(manifest, makeEntry({
    id: `icon-${id}`, grade,
    paths: { png: `assets/icons/${id}.png`, webp: `assets/icons/${id}.webp` },
    prompt: 'composited from in-game render (tools/asset-pipeline/capture-icons.mjs + icons.mjs)',
  }));
  console.log('icon', id, grade);
}
writeFileSync(join(ROOT, 'assets/manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('manifest:', manifest.assets.length, 'entries');
