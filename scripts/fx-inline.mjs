// Embeds fx-config.json into index.html's <script type="application/json" id="fxcfg"> tag.
// Usage: node scripts/fx-inline.mjs   (idempotent; tests/fx-config.test.js asserts no drift)
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const cfg = JSON.parse(readFileSync(new URL('fx-config.json', root), 'utf8'));
const p = new URL('index.html', root);
const html = readFileSync(p, 'utf8');
const re = /(<script type="application\/json" id="fxcfg">)[\s\S]*?(<\/script>)/;
if (!re.test(html)) { console.error('fxcfg tag not found in index.html'); process.exit(1); }
const out = html.replace(re, (_, a, b) => a + JSON.stringify(cfg) + b);
if (out === html) { console.log('unchanged'); } else { writeFileSync(p, out); console.log('fx config embedded:', JSON.stringify(cfg).length, 'chars'); }
