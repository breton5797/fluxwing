// Selection scoring + manifest rules for the premium-asset pipeline (tools/asset-pipeline).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgeTouchRatio, silhouetteScore, outlineScore, scoreCandidate, selectBest } from '../tools/asset-pipeline/select.js';
import { makeEntry, upsertManifest, GRADES } from '../tools/asset-pipeline/manifest.js';

// -- helpers: build tiny alpha/luminance grids (row-major Uint8) --
function grid(w, h, fill = 0) { return { w, h, a: new Uint8Array(w * h).fill(fill), l: new Uint8Array(w * h).fill(255) }; }
function rect(g, x0, y0, x1, y1, { a = 255, l = 255 } = {}) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { g.a[y * g.w + x] = a; g.l[y * g.w + x] = l; }
  return g;
}

test('edgeTouchRatio: centered blob touches no border, cropped blob does', () => {
  const centered = rect(grid(20, 20), 5, 5, 14, 14);
  const cropped = rect(grid(20, 20), 0, 5, 9, 14); // flush with left border
  assert.equal(edgeTouchRatio(centered), 0);
  assert.ok(edgeTouchRatio(cropped) > 0);
});

test('silhouetteScore: prefers a solid mid-sized centered mass over specks or full-bleed', () => {
  const good = rect(grid(20, 20), 4, 4, 15, 15);          // ~36% coverage, centered
  const speck = rect(grid(20, 20), 9, 9, 10, 10);          // ~1% coverage
  const bleed = rect(grid(20, 20), 0, 0, 19, 19);          // 100% coverage
  assert.ok(silhouetteScore(good) > silhouetteScore(speck));
  assert.ok(silhouetteScore(good) > silhouetteScore(bleed));
});

test('outlineScore: dark pixels on the alpha boundary count, interior dark pixels do not', () => {
  // body with a dark 1px rim
  const rimmed = rect(grid(20, 20), 4, 4, 15, 15, { l: 200 });
  for (let x = 4; x <= 15; x++) { rimmed.l[4 * 20 + x] = 20; rimmed.l[15 * 20 + x] = 20; }
  for (let y = 4; y <= 15; y++) { rimmed.l[y * 20 + 4] = 20; rimmed.l[y * 20 + 15] = 20; }
  const bare = rect(grid(20, 20), 4, 4, 15, 15, { l: 200 }); // no outline at all
  assert.ok(outlineScore(rimmed) > outlineScore(bare));
});

test('scoreCandidate: composite penalizes cropping hard', () => {
  const good = rect(grid(20, 20), 4, 4, 15, 15);
  const cropped = rect(grid(20, 20), 0, 0, 11, 19);
  assert.ok(scoreCandidate(good) > scoreCandidate(cropped));
});

test('selectBest: returns index of highest composite and never mutates input', () => {
  const a = rect(grid(20, 20), 9, 9, 10, 10);   // speck
  const b = rect(grid(20, 20), 4, 4, 15, 15);   // good
  const list = [a, b];
  const snapshot = JSON.stringify(list.map(g => [...g.a]));
  assert.equal(selectBest(list), 1);
  assert.equal(JSON.stringify(list.map(g => [...g.a])), snapshot);
});

test('manifest: entry validates grade and records prompt + paths', () => {
  const e = makeEntry({ id: 'bulwark', grade: 'epic', paths: { png512: 'assets/units/bulwark/512.png' }, prompt: 'p' });
  assert.equal(e.grade, 'epic');
  assert.throws(() => makeEntry({ id: 'x', grade: 'mythic', paths: {}, prompt: 'p' }), /grade/);
  assert.ok(GRADES.includes('legend'));
});

test('manifest: upsert replaces by id immutably', () => {
  const m0 = { assets: [] };
  const m1 = upsertManifest(m0, makeEntry({ id: 'u1', grade: 'rare', paths: {}, prompt: 'a' }));
  const m2 = upsertManifest(m1, makeEntry({ id: 'u1', grade: 'legend', paths: {}, prompt: 'b' }));
  assert.equal(m0.assets.length, 0);
  assert.equal(m2.assets.length, 1);
  assert.equal(m2.assets[0].grade, 'legend');
  assert.notEqual(m1, m2);
});
