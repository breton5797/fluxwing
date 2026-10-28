import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import vm from 'node:vm';
import { readIndex } from './helpers/hitloop.js';
import { IOS_ASSETS } from '../scripts/ios-build.mjs';
import { ASSETS as PORTAL_ASSETS } from '../scripts/portal-build.mjs';

// The Higgsfield art (docs/design/surprise-obstacles-boss.md sections 5 and 11): 37 WebP files in art/, loaded by the page as same-origin images. Every file
// the art block names exists with its size, ships wherever the page ships (Vercel, the service worker's precache for the Android TWA, the iOS bundle,
// the portal build), and every draw path keeps its procedural art for when an image has not loaded (or never will).
const html = readIndex();
const root = new URL('../', import.meta.url);
const bb = html.match(/\/\* boss:start[\s\S]*?\/\* boss:end \*\//), ab = html.match(/\/\* art:start[\s\S]*?\/\* art:end \*\//);
const A = bb && ab ? new Function(`${bb[0]}\n${ab[0]}\nreturn {BOSS, ART_Z, ART_NAMES, ART_OB, ART_BG, ART_SUR, ART_BOSS, ART_FIT};`)() : {};
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
// The obstacle art's alpha, measured by scripts/art/metrics.py (node cannot decode WebP): rerun it whenever an ob-* file changes
const OBM = JSON.parse(readFileSync(new URL('scripts/art/ob-metrics.json', root), 'utf8'));
const OB_PARTS = ['bot-stem', 'bot-tip', 'top-stem', 'top-tip'];

test('a pure art block names 37 files: per zone an obstacle (stem and tip at each end), a backdrop and three surprises, and one per boss', () => {
  assert.ok(ab, 'art block');
  assert.deepEqual([...A.ART_Z], ['grove', 'canyon', 'magma', 'palace'], 'in zone order (zoneIdx)');
  assert.equal(A.ART_NAMES.length, 37);
  assert.equal(new Set(A.ART_NAMES).size, 37);
  assert.ok(Object.isFrozen(A.ART_NAMES) && Object.isFrozen(A.ART_FIT));
  assert.deepEqual(A.ART_OB.map(o => [...o]), A.ART_Z.map(z => OB_PARTS.map(k => `ob-${z}-${k}`)), 'per zone: [bot stem, bot tip, top stem, top tip]');
  assert.ok(Object.isFrozen(A.ART_OB) && A.ART_OB.every(Object.isFrozen));
  assert.ok(!A.ART_NAMES.some(n => /^(pillar|cap)-/.test(n)), 'the pillar shafts and caps are gone');
  assert.doesNotMatch(html, /ART_PIL|ART_CAP|artPillars|artCaps|'pillar-'|'cap-'/, 'and nothing draws them');
  assert.deepEqual([...A.ART_BG], A.ART_Z.map(z => 'bg-' + z));
  for (const k of ['snap', 'shot', 'drop']) assert.deepEqual([...A.ART_SUR[k]], A.ART_Z.map(z => `sur-${k}-${z}`));
  assert.deepEqual(Object.keys(A.ART_BOSS), A.BOSS.list.map(b => b.id), 'one sprite per boss id');
  for (const b of A.BOSS.list) assert.equal(A.ART_BOSS[b.id], 'boss-' + b.id);
  const all = [...A.ART_OB.flat(), ...A.ART_BG, ...A.ART_SUR.snap, ...A.ART_SUR.shot, ...A.ART_SUR.drop, ...Object.values(A.ART_BOSS)];
  assert.deepEqual([...A.ART_NAMES].sort(), all.sort());
});

test('every named file is in art/ at its size, and art/ holds nothing else', () => {
  assert.deepEqual(files.map(f => f.replace(/\.webp$/, '')).sort(), [...A.ART_NAMES].sort());
  for (const o of A.ART_OB){ assert.deepEqual(size(o[0]), [128, 512], o[0]); assert.deepEqual(size(o[2]), [128, 512], o[2]);
    for (const n of [o[1], o[3]]){ const [w, h] = size(n); assert.ok(w <= 192 && h <= 256, `${n}: ${w}x${h}`); } }
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
  for (const b of A.BOSS.list){ const [cx, cy] = F.boss[b.id]; assert.ok(cx > .3 && cx < .7 && cy > .3 && cy < .7, b.id); }
  assert.ok(F.bossH >= 150 && F.bossH <= 170, 'a boss reads at 150-170 px tall');
});

// The obstacle fits against the measured alpha. A piece is a stem (drawn sw px wide, its column scx on the gate's centre line) and a tip (tw px wide,
// its column tcx on the centre line, pad transparent rows on the gap side, join transparent rows on the stem side)
const obPieces = () => A.ART_Z.flatMap((z, i) => [0, 1].map(e => { const f = A.ART_FIT.ob[i][e], o = A.ART_OB[i];
  return {z, end: e ? 'top' : 'bot', f, stem: OBM[o[e*2]], tip: OBM[o[e*2 + 1]], ks: f[0] / OBM[o[e*2]].w, kt: f[2] / OBM[o[e*2 + 1]].w}; }));
// The share of the 68 px hit width the stem's opaque pixels cover, averaged down the stem
const cover = (m, sw, scx) => { const ks = sw / m.w; let s = 0; for (let x = 0; x < 68; x++){ const c = Math.floor(scx + (x + .5 - 34) / ks); s += c >= 0 && c < m.w ? m.cols[c] : 0; } return s / 68; };

test('the obstacle metrics are fresh: one per ob-* file, at its byte size and pixel size', () => {
  assert.deepEqual(Object.keys(OBM).sort(), A.ART_OB.flat().sort());
  for (const n of A.ART_OB.flat()){ assert.equal(OBM[n].bytes, statSync(new URL(`art/${n}.webp`, root)).size, n + ': rerun scripts/art/metrics.py');
    assert.deepEqual([OBM[n].w, OBM[n].h], size(n), n); }
});

test('fairness: each stem covers at least 85 % of the hit width, each tip ends within 3 px of the gap edge and meets its stem', () => {
  assert.equal(A.ART_FIT.ob.length, 4);
  for (const p of obPieces()){
    const at = `${p.z} ${p.end}`, [sw, scx, tw, tcx, pad, join] = p.f;
    assert.equal(p.f.length, 6, at); assert.ok(Object.isFrozen(p.f), at);
    assert.ok(sw >= 68 && sw <= 110, `${at}: the stem is ${sw} px wide`);
    assert.ok(cover(p.stem, sw, scx) >= .85, `${at}: the stem covers ${(cover(p.stem, sw, scx)*100).toFixed(1)} % of the hit width`);
    assert.ok(Math.abs(scx - p.stem.cx) * p.ks <= 3, `${at}: the stem is centred on the gate`);
    assert.ok(Math.abs(tcx - p.tip.cx) * p.kt <= 3, `${at}: the tip is centred on its base`);
    assert.ok(Math.abs(pad - p.tip.pad) * p.kt <= 3, `${at}: the tip ends ${((pad - p.tip.pad) * p.kt).toFixed(1)} px off the gap edge`);
    assert.ok(Math.abs(join - p.tip.join) * p.kt <= 3, `${at}: the stem starts where the tip's base is`);
    const base = (p.tip.base[1] - p.tip.base[0]) * p.kt, core = (p.stem.core[1] - p.stem.core[0]) * p.ks;
    assert.ok(base > core * .7 && base < core * 1.5, `${at}: the tip's base (${base.toFixed(0)} px) meets the stem (${core.toFixed(0)} px)`);
    assert.ok(tw <= 140 && p.tip.h * p.kt <= 200, `${at}: the tip stays a tip`);
  }
});

test('sw.js precaches every art file, under a new cache version', () => {
  const src = readFileSync(new URL('sw.js', root), 'utf8');
  const pre = vm.runInContext(src + '\n;PRECACHE', vm.createContext({ self: { addEventListener(){}, location: { origin: 'https://swishby.com' } }, URL }));
  for (const n of A.ART_NAMES) assert.ok(pre.includes(`/art/${n}.webp`), n);
  for (const n of ['pillar', 'cap']) assert.ok(!pre.some(u => u.startsWith(`/art/${n}-`)), n + ' files are gone');
  assert.ok(!['2026-10-28.1', '2026-10-29.1'].includes(src.match(/const VERSION = '([^']+)';/)[1]), 'bumped: the cache-first images changed');
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
  assert.match(dg, /const ob = ART_OB\[zoneIdx\]\.every\(artOk\);/, 'all four pieces loaded, or none drawn');
  assert.match(dg, /if \(ob\) artObs\(g, t0, bot, col\);\n  else \{ ctx\.fillRect\(g\.x, -10, g\.w, t0 \+ 10\); ctx\.fillRect\(g\.x, bot, g\.w, GROUND - bot\);/);
  assert.match(dg, /ctx\.fillStyle = hsl\(col\); ctx\.fillRect\(g\.x-6, t0-10, g\.w\+12, 10\); ctx\.fillRect\(g\.x-6, bot, g\.w\+12, 10\);/, 'the procedural caps');
  assert.match(dg, /drawGateDeco\(g, t0, bot, col, zoneIdx\); \}/, 'and its deco, only without the art');
  assert.ok(dg.indexOf('drawBranch(g, t0, br)') > dg.indexOf('artObs('), 'the branch over the obstacle');
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
  assert.match(body('function artOb('), /a\.pat \|\| \(a\.pat = ctx\.createPattern\(/);
  const head = body('function artHead(');
  assert.match(head, /if \(a\.fx\.head\) return a\.fx\.head;/, 'a stem head is made once');
  assert.match(body('function artSoft('), /if \(a\.fx\.soft\) return a\.fx\.soft;/, 'and a soft tip');
  assert.match(body('function artOb('), /artHead\(a, r, n, d\)/);
  const tint = body('function artTint(');
  assert.match(tint, /if \(a\.fx\[k\]\) return a\.fx\[k\];/);
  assert.match(tint, /document\.createElement\('canvas'\)/);
  const bossArt = body('function drawBossArt(');
  assert.doesNotMatch(bossArt, /createElement|createPattern|new Image|Gradient\(/);
  assert.match(bossArt, /glowPx\(/);
  assert.match(bossArt, /IMP\.q === 'low'/, 'low quality: the sprite, no extra effects');
  for (const f of ['function artObs(', 'function artOb(', 'function artLava(', 'function artSur(', 'function artBg(']) assert.doesNotMatch(body(f), /createElement|new Image|Gradient\(|\[\]|\{\}|=>/, f);
});

test('theme motion: magma flickers, sheds embers and shimmers, the grove bud sways; all of it still under RM, the lava fx off on low quality', () => {
  const obs = body('function artObs(');
  assert.match(obs, /, live = bgLive\(\);/, 'RM stills it');
  assert.match(obs, /zoneIdx === 0 && live \? /, 'the grove sway only when live');
  assert.match(obs, /if \(zoneIdx === 2 && live && IMP\.q !== 'low'\) artLava\(/, 'the lava fx: magma, live, not low quality');
  const ob = body('function artOb(');
  assert.match(ob, /ctx\.rotate\(/, 'the sway turns the tip about its base');
  const lava = body('function artLava(');
  assert.match(lava, /glowPx\(/);
  assert.match(lava, /'lighter'/);
});
