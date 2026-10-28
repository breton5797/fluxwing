import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { readIndex } from './helpers/hitloop.js';
import { IOS_ASSETS } from '../scripts/ios-build.mjs';
import { ASSETS as PORTAL_ASSETS } from '../scripts/portal-build.mjs';

// The Higgsfield art (docs/design/surprise-obstacles-boss.md section 5): 29 WebP files in art/, loaded by the page as same-origin images. Every file
// the art block names exists with its size, ships wherever the page ships (Vercel, the service worker's precache for the Android TWA, the iOS bundle,
// the portal build), and every draw path keeps its procedural art for when an image has not loaded (or never will).
const html = readIndex();
const root = new URL('../', import.meta.url);
const bb = html.match(/\/\* boss:start[\s\S]*?\/\* boss:end \*\//), ab = html.match(/\/\* art:start[\s\S]*?\/\* art:end \*\//);
const A = bb && ab ? new Function(`${bb[0]}\n${ab[0]}\nreturn {BOSS, ART_Z, ART_NAMES, ART_PIL, ART_CAP, ART_BG, ART_SUR, ART_BOSS, ART_FIT};`)() : {};
const body = name => { const at = html.indexOf(name); assert.ok(at >= 0, name); return html.slice(at, html.indexOf('\n}\n', at)); };

// Width and height from a WebP header: lossy (VP8), lossless (VP8L) or extended (VP8X)
function webpSize(buf){
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF'); assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L'){ const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error('unknown WebP chunk ' + kind);
}
const size = n => webpSize(readFileSync(new URL(`art/${n}.webp`, root)));
const files = readdirSync(new URL('art/', root)).filter(f => f.endsWith('.webp'));

test('a pure art block names 29 files: per zone a shaft, a cap, a backdrop and three surprises, and one per boss', () => {
  assert.ok(ab, 'art block');
  assert.deepEqual([...A.ART_Z], ['grove', 'canyon', 'magma', 'palace'], 'in zone order (zoneIdx)');
  assert.equal(A.ART_NAMES.length, 29);
  assert.equal(new Set(A.ART_NAMES).size, 29);
  assert.ok(Object.isFrozen(A.ART_NAMES) && Object.isFrozen(A.ART_FIT));
  assert.deepEqual([...A.ART_PIL], A.ART_Z.map(z => 'pillar-' + z));
  assert.deepEqual([...A.ART_CAP], A.ART_Z.map(z => 'cap-' + z));
  assert.deepEqual([...A.ART_BG], A.ART_Z.map(z => 'bg-' + z));
  for (const k of ['snap', 'shot', 'drop']) assert.deepEqual([...A.ART_SUR[k]], A.ART_Z.map(z => `sur-${k}-${z}`));
  assert.deepEqual(Object.keys(A.ART_BOSS), A.BOSS.list.map(b => b.id), 'one sprite per boss id');
  for (const b of A.BOSS.list) assert.equal(A.ART_BOSS[b.id], 'boss-' + b.id);
  const all = [...A.ART_PIL, ...A.ART_CAP, ...A.ART_BG, ...A.ART_SUR.snap, ...A.ART_SUR.shot, ...A.ART_SUR.drop, ...Object.values(A.ART_BOSS)];
  assert.deepEqual([...A.ART_NAMES].sort(), all.sort());
});

test('every named file is in art/ at its size, and art/ holds nothing else', () => {
  assert.deepEqual(files.map(f => f.replace(/\.webp$/, '')).sort(), [...A.ART_NAMES].sort());
  for (const n of A.ART_PIL) assert.deepEqual(size(n), [128, 512], n);
  for (const n of A.ART_CAP) assert.deepEqual(size(n), [192, 96], n);
  for (const n of A.ART_BG) assert.deepEqual(size(n), [540, 960], n);
  for (const n of [...A.ART_SUR.snap, ...A.ART_SUR.shot, ...A.ART_SUR.drop]){ const [w, h] = size(n); assert.equal(Math.max(w, h), 192, n); }
  for (const n of Object.values(A.ART_BOSS)){ const [w, h] = size(n); assert.equal(h, 384, n); assert.ok(w <= 384, n); }
});

test('art/ stays under 1 MB', () => {
  const total = files.reduce((s, f) => s + statSync(new URL(`art/${f}`, root)).size, 0);
  assert.ok(total < 1024 * 1024, `${total} bytes`);
});

test('the fits: every anchor sits inside its sprite, and the sprites come out at the hit shapes\' sizes', () => {
  const F = A.ART_FIT;
  F.snap.forEach(([s, n], z) => { const [w, h] = size(A.ART_SUR.snap[z]); assert.ok(w*s > 36 && w*s < 52, `snap ${z}: ${w*s} px wide`); assert.ok(h*s > 55 && h*s < 80, `snap ${z}: ${h*s} px tall`);
    const jaw = (z === 3 ? h - n : n) * s; assert.ok(jaw > 28 && jaw < 44, `snap ${z}: the jaws are ${jaw} px tall, about the 32 px hit head`); });
  for (const k of ['shot', 'drop']) F[k].forEach(([cx, cy, s], z) => { const [w, h] = size(A.ART_SUR[k][z]);
    assert.ok(cx > 0 && cx < w && cy > 0 && cy < h, `${k} ${z} anchor`); assert.ok(s > .2 && s < .6, `${k} ${z} scale`); });
  assert.equal(F.cap.length, 4); for (const c of F.cap) assert.ok(c >= 0 && c < .5);
  for (const b of A.BOSS.list){ const [cx, cy] = F.boss[b.id]; assert.ok(cx > .3 && cx < .7 && cy > .3 && cy < .7, b.id); }
  assert.ok(F.bossH >= 150 && F.bossH <= 170, 'a boss reads at 150-170 px tall');
});

test('sw.js precaches every art file, under a new cache version', () => {
  const src = readFileSync(new URL('sw.js', root), 'utf8');
  const pre = vm.runInContext(src + '\n;PRECACHE', vm.createContext({ self: { addEventListener(){}, location: { origin: 'https://swishby.com' } }, URL }));
  for (const n of A.ART_NAMES) assert.ok(pre.includes(`/art/${n}.webp`), n);
  assert.notEqual(src.match(/const VERSION = '([^']+)';/)[1], '2026-10-28.1', 'bumped: the cache-first images changed');
});

test('the iOS bundle and the portal build copy every art file; Vercel deploys the folder', () => {
  for (const n of A.ART_NAMES){ assert.ok(IOS_ASSETS.includes(`art/${n}.webp`), 'iOS ' + n); assert.ok(PORTAL_ASSETS.includes(`art/${n}.webp`), 'portal ' + n); }
  const ignore = readFileSync(new URL('.vercelignore', root), 'utf8').split('\n').map(s => s.trim().replace(/^\//, '').replace(/\/$/, ''));
  assert.ok(!ignore.includes('art'), 'art/ is deployed');
});

test('the loader: one lazy Image per file, ok once loaded, errors ignored; warmed after boot, never awaited', () => {
  const ld = body('function artImg(');
  assert.match(ld, /new Image\(\)/);
  assert.match(ld, /onload = \(\) => \{ a\.ok = /);
  assert.match(ld, /onerror = /);
  assert.match(ld, /'art\/' \+ n \+ '\.webp'/);
  assert.match(html, /const artOk = n => \{ const a = ART\[n\] \|\| artImg\(n\); return a\.ok \? a\.img : null; \};/);
  assert.match(html, /setTimeout\(artWarm, \d+\);/);
  assert.doesNotMatch(html, /await[^\n]*artImg|\.decode\(\)[^\n]*art/, 'nothing waits for the art');
});

test('every draw path keeps its procedural art for an image that is not there', () => {
  const dg = html.slice(html.indexOf('function drawGate(g){'), html.indexOf('function drawBranch('));
  assert.match(dg, /const tex = artOk\(ART_PIL\[zoneIdx\]\)/);
  assert.match(dg, /if \(tex\) artPillars\(g, tex, t0, bot\);\n  else \{ ctx\.fillRect\(g\.x, -10, g\.w, t0 \+ 10\); ctx\.fillRect\(g\.x, bot, g\.w, GROUND - bot\); \}/);
  assert.match(dg, /if \(cap\) artCaps\(g, cap, t0, bot, col\);\n  else \{ ctx\.fillStyle = hsl\(col\); ctx\.fillRect\(g\.x-6, t0-10, g\.w\+12, 10\); ctx\.fillRect\(g\.x-6, bot, g\.w\+12, 10\); \}/);
  assert.match(dg, /if \(!tex\) drawGateDeco\(g, t0, bot, col, zoneIdx\);/);
  assert.match(dg, /state === 'dying' && g\.hitSide/);
  const ds = body('function drawSur(');
  assert.doesNotMatch(ds, /SUR_SKIN\./, 'drawSur goes through surDraw');
  for (const k of ['snap', 'shot', 'drop']) assert.match(ds, new RegExp(`surDraw\\('${k}', z, `));
  assert.match(html, /const surDraw = \(k, z, a, b\) => \{ if \(!artSur\(k, z, a, b\)\) SUR_SKIN\[k\]\[z\]\(a, b\); \};/);
  assert.match(body('function artSur('), /const img = artOk\(ART_SUR\[k\]\[z\]\); if \(!img\) return false;/);
  assert.match(body('function drawBoss(b){'), /^function drawBoss\(b\)\{\n  const img = artOk\(ART_BOSS\[b\.id\]\); if \(img\) return drawBossArt\(b, img\);\n/);
  const r = html.slice(html.indexOf('function render(){'), html.indexOf('[bgGrove, bgCanyon, bgMagma, bgPalace][zoneIdx]();'));
  assert.match(r, /artBg\(\);/, 'the painting first, under the procedural backdrop');
  assert.match(body('function artBg('), /const img = artOk\(ART_BG\[zoneIdx\]\); if \(!img\) return;/);
});

test('no per-frame allocations: patterns and tinted copies are made once per image', () => {
  assert.match(body('function artPillars('), /a\.pat \|\| \(a\.pat = ctx\.createPattern\(/);
  const tint = body('function artTint(');
  assert.match(tint, /if \(a\.fx\[k\]\) return a\.fx\[k\];/);
  assert.match(tint, /document\.createElement\('canvas'\)/);
  const bossArt = body('function drawBossArt(');
  assert.doesNotMatch(bossArt, /createElement|createPattern|new Image|Gradient\(/);
  assert.match(bossArt, /glowPx\(/);
  assert.match(bossArt, /IMP\.q === 'low'/, 'low quality: the sprite, no extra effects');
  for (const f of ['function artPillars(', 'function artCaps(', 'function artSur(', 'function artBg(']) assert.doesNotMatch(body(f), /createElement|new Image|Gradient\(/, f);
});
