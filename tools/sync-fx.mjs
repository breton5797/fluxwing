// Inlines arcade-core/fx sources into index.html between fx markers (single-file deploy).
// Usage: node tools/sync-fx.mjs   (idempotent; tests/fx-sync.test.js asserts freshness)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORDER = ['particles.js', 'shield.js', 'xp.js', 'juice.js'];

export function buildFxBlock() {
  const body = ORDER.map(f => {
    const src = readFileSync(join(root, 'arcade-core/fx', f), 'utf8');
    return `// -- fx/${f} --\n` + src
      .split('\n')
      .filter(l => !/^import\b/.test(l))
      .map(l => l.replace(/^export function /, 'function ').replace(/^export const /, 'const '))
      .join('\n')
      .trim();
  }).join('\n');
  const names = ['makeParticle', 'stepParticles', 'spawnCount', 'ringPhases', 'hexBurst', 'shieldHit', 'pushTrail', 'xpPopup', 'shakeOffset', 'hitstop', 'flashAlpha', 'coinBounceScale'];
  return `/* fx:start — generated from arcade-core/fx, do not edit by hand; run: node tools/sync-fx.mjs */\nconst AFX = (() => {\n${body}\nreturn { ${names.join(', ')} };\n})();\n/* fx:end */`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = join(root, 'index.html');
  const html = readFileSync(p, 'utf8');
  const block = buildFxBlock();
  let out;
  if (/\/\* fx:start[\s\S]*?\/\* fx:end \*\//.test(html)) {
    out = html.replace(/\/\* fx:start[\s\S]*?\/\* fx:end \*\//, () => block);
  } else {
    // first insertion: right after the main IIFE's 'use strict';
    out = html.replace("(() => {\n'use strict';", `(() => {\n'use strict';\n${block}`);
    if (out === html) throw new Error('anchor not found');
  }
  writeFileSync(p, out);
  console.log('fx block synced:', block.length, 'chars');
}
