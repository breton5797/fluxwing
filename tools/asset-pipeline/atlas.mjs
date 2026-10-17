// Builds a JSON atlas next to every Ludo spritesheet: frame rects, grid, fps.
// Usage: node tools/asset-pipeline/atlas.mjs   (reads assets/units/*/anim/*/ludo-assets.json)
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const unitsDir = join(ROOT, 'assets/units');

for (const unit of readdirSync(unitsDir)) {
  const animDir = join(unitsDir, unit, 'anim');
  if (!existsSync(animDir)) continue;
  for (const motion of readdirSync(animDir)) {
    const dir = join(animDir, motion);
    const metaPath = join(dir, 'ludo-assets.json');
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    const sheetEntry = meta.assets.find(a => a.file.endsWith('.png'));
    if (!sheetEntry) { console.log(unit, motion, 'no sheet'); continue; }
    const job = JSON.parse(execFileSync('npx', ['ludo', 'jobs', 'wait', sheetEntry.job_id, '--json'], { cwd: ROOT, env: process.env }).toString());
    const r = Array.isArray(job.result) ? job.result[0] : job.result;
    const { width, height } = await sharp(join(dir, sheetEntry.file)).metadata();
    const fw = Math.floor(width / r.num_cols), fh = Math.floor(height / r.num_rows);
    const frames = [];
    for (let i = 0; i < r.num_frames; i++) {
      frames.push({ x: (i % r.num_cols) * fw, y: Math.floor(i / r.num_cols) * fh, w: fw, h: fh });
    }
    const atlas = {
      sheet: sheetEntry.file, motion, unit,
      cols: r.num_cols, rows: r.num_rows, frames,
      fps: +(r.num_frames / (r.duration || 3)).toFixed(2),
    };
    writeFileSync(join(dir, 'atlas.json'), JSON.stringify(atlas, null, 2) + '\n');
    console.log(unit, motion, `${r.num_frames}f ${r.num_cols}x${r.num_rows} @${atlas.fps}fps`);
  }
}
