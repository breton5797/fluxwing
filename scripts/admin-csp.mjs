// admin.html CSP: rewrites the 'sha256-…' script source to the hash of the page's one inline <script>.
// Run after every edit of that script (tests/admin.test.js fails until you do):  node scripts/admin-csp.mjs admin.html
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const p = process.argv[2], s = readFileSync(p, 'utf8');
const m = [...s.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (m.length !== 1) throw new Error('inline scripts: ' + m.length);
const h = createHash('sha256').update(m[0][1], 'utf8').digest('base64');
writeFileSync(p, s.replace(/'sha256-[^']+'/, `'sha256-${h}'`));
console.log('sha256-' + h);
