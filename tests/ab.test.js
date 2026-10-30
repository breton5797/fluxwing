// 사5-lite A/B buckets and the 다4 near-miss result line (owner decisions 2026-10-30, docs/qa/owner-decisions-2026-10-30.md):
// an install id hashed with the experiment key picks the arm, a static ab-config.json (bundle defaults inside the page) sets the split,
// and the arm rides on every event as props.v. Experiment 1: the near-miss line on a failed stage run, 50/50.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadAb } from './helpers/ab.js';
import { loadEvents } from './helpers/events.js';
import { loadI18NParts } from './helpers/i18n.js';

const A = loadAb();
const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const seq = vals => { let i = 0; return () => vals[i++ % vals.length]; };
const ids = (n, seed = 1) => { let a = seed; const r = () => { a = (Math.imul(a, 1103515245) + 12345) >>> 0; return a / 4294967296; }; return Array.from({ length: n }, () => A.abId('', r)); };

test('abId: keeps a well-formed id, makes a new 16-character one otherwise', () => {
  assert.equal(A.abId('0123456789abcdef', Math.random), '0123456789abcdef');
  const made = A.abId('', seq([0, .5, .99]));
  assert.match(made, /^[0-9a-z]{16}$/);
  for (const bad of [null, undefined, 42, 'short', 'UPPERCASE0123456', '0123456789abcdef0', { id: 'x' }]) assert.match(A.abId(bad, Math.random), /^[0-9a-z]{16}$/);
  assert.notEqual(A.abId('', Math.random), A.abId('', Math.random));
});

test('abBucket: 0..99, the same for the same id and key, and independent across keys', () => {
  const id = '0123456789abcdef';
  assert.equal(A.abBucket(id, 'nm'), A.abBucket(id, 'nm'));
  const all = ids(5000);
  for (const x of all) { const b = A.abBucket(x, 'nm'); assert.ok(Number.isInteger(b) && b >= 0 && b < 100, String(b)); }
  // another key splits the same installs again: about half of nm's treatment lands in each arm of the other key
  const nmB = all.filter(x => A.abBucket(x, 'nm') < 50), both = nmB.filter(x => A.abBucket(x, 'mh') < 50).length;
  assert.ok(Math.abs(both / nmB.length - .5) < .04, `cross-key overlap ${both}/${nmB.length}`);
});

test('a 50/50 split stays within ±2 % over 10,000 installs, and every tenth of the range is used', () => {
  for (const seed of [1, 7, 2026]) {
    const all = ids(10000, seed), b = all.filter(x => A.abArm({ nm: { on: 1, pct: 50 } }, x, 'nm') === 'b').length;
    assert.ok(Math.abs(b / all.length - .5) <= .02, `seed ${seed}: ${b} of ${all.length} in b`);
    const dec = Array(10).fill(0); for (const x of all) dec[Math.floor(A.abBucket(x, 'nm') / 10)]++;
    for (const n of dec) assert.ok(Math.abs(n / all.length - .1) <= .02, `seed ${seed}: deciles ${dec}`);
  }
});

test('abArm: off or unknown gives no arm; pct 0 / 100 put everyone in a / b', () => {
  const id = ids(1)[0];
  assert.equal(A.abArm({ nm: { on: 0, pct: 50 } }, id, 'nm'), '');
  assert.equal(A.abArm({}, id, 'nm'), '');
  assert.equal(A.abArm({ nm: { on: 1, pct: 50 } }, id, 'zz'), '');
  for (const x of ids(200)) { assert.equal(A.abArm({ nm: { on: 1, pct: 0 } }, x, 'nm'), 'a'); assert.equal(A.abArm({ nm: { on: 1, pct: 100 } }, x, 'nm'), 'b'); }
});

test('abNorm: only known experiments with a 0/1 switch and a whole pct 0..100 are taken; a broken entry turns its experiment off (fails closed)', () => {
  assert.deepEqual(A.AB_KEYS, ['nm']);
  assert.deepEqual(A.AB_DEF, { nm: { on: 1, pct: 50 } }, 'experiment 1 ships on, 50/50');
  assert.deepEqual(A.abNorm({ nm: { on: 1, pct: 100 } }, A.AB_DEF), { nm: { on: 1, pct: 100 } });
  assert.deepEqual(A.abNorm({ nm: { on: 0, pct: 50 } }, A.AB_DEF), { nm: { on: 0, pct: 50 } });
  for (const bad of [null, undefined, 'x', [], 7]) assert.deepEqual(A.abNorm(bad, A.AB_DEF), A.AB_DEF, 'no config at all: ' + JSON.stringify(bad));
  assert.deepEqual(A.abNorm({}, A.AB_DEF), A.AB_DEF, 'an experiment the file does not name keeps its default');
  for (const bad of [{ nm: null }, { nm: { on: 2, pct: 50 } }, { nm: { on: 1, pct: 101 } }, { nm: { on: 1, pct: -1 } }, { nm: { on: 1, pct: 12.5 } },
    { nm: { on: '1', pct: 50 } }, { nm: { on: 1, pct: '50' } }, { nm: [1, 50] }, { nm: { on: false } }, { nm: { on: 0 } }, { nm: { on: 1, pct: '0' } }])
    assert.deepEqual(A.abNorm(bad, A.AB_DEF), { nm: { on: 0, pct: 0 } }, 'an attempt to stop it that went wrong still stops it: ' + JSON.stringify(bad));
  assert.deepEqual(A.abNorm({ nm: { on: 1, pct: 50, extra: 'x' }, zz: { on: 1, pct: 1 } }, A.AB_DEF), { nm: { on: 1, pct: 50 } }, 'unknown keys and fields are dropped');
});

test('abTag: the arms as one short string for props.v, empty with no experiment on', () => {
  const id = ids(1)[0], arm = A.abArm(A.AB_DEF, id, 'nm');
  assert.equal(A.abTag(A.AB_DEF, id), 'nm:' + arm);
  assert.equal(A.abTag({ nm: { on: 0, pct: 50 } }, id), '');
  assert.equal(A.abTag({}, id), '');
});

test('ab-config.json ships with the site and matches the bundle default', () => {
  const cfg = JSON.parse(readFileSync(new URL('ab-config.json', root), 'utf8'));
  assert.deepEqual(A.abNorm(cfg, { nm: { on: 0, pct: 0 } }), A.AB_DEF);
  assert.equal(A.AB_URL, 'https://swishby.com/ab-config.json');
  const ignore = readFileSync(new URL('.vercelignore', root), 'utf8').split('\n').map(s => s.trim());
  assert.ok(!ignore.includes('ab-config.json'));
});

test('vercel.json lets the iOS app read ab-config.json (CORS) and keeps it fresh', () => {
  const vj = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
  const r = vj.headers.find(h => h.source === '/ab-config.json'); assert.ok(r);
  const h = Object.fromEntries(r.headers.map(x => [x.key.toLowerCase(), x.value]));
  assert.equal(h['access-control-allow-origin'], '*');
  assert.match(h['cache-control'], /max-age=300\b/);
});

test('nearMiss: a failed stage run at 30 %+ shows the gates left and the progress, honestly rounded down', () => {
  assert.equal(A.NEAR_MIN, 30);
  assert.deepEqual(A.nearMiss({ gates: 94, goal: 100, best0: 80, bhp: -1 }), { k: 'nearLeft', n: 6, p: 94, best: true });
  assert.deepEqual(A.nearMiss({ gates: 30, goal: 100, best0: 30, bhp: -1 }), { k: 'nearLeft', n: 70, p: 30, best: false }, 'equal to the old best is no new best');
  assert.deepEqual(A.nearMiss({ gates: 199, goal: 200, best0: 0, bhp: -1 }), { k: 'nearLeft', n: 1, p: 99, best: true }, '99.5 % reads 99, never 100');
  assert.equal(A.nearMiss({ gates: 29, goal: 100, best0: 0, bhp: -1 }), null, 'under 30 % there is nothing near about it');
  assert.equal(A.nearMiss({ gates: 0, goal: 100, best0: 0, bhp: -1 }), null);
  assert.equal(A.nearMiss({ gates: 50, goal: 0, best0: 0, bhp: -1 }), null, 'off stage mode: no goal');
});

test('nearMiss: a lost boss fight shows the boss HP really left, nothing when it is unknown or zero', () => {
  assert.deepEqual(A.nearMiss({ gates: 70, goal: 70, best0: 70, bhp: 8 }), { k: 'nearBoss', h: 8 });
  assert.deepEqual(A.nearMiss({ gates: 75, goal: 70, best0: 10, bhp: 100 }), { k: 'nearBoss', h: 100 });
  assert.equal(A.nearMiss({ gates: 70, goal: 70, best0: 0, bhp: -1 }), null);
  assert.equal(A.nearMiss({ gates: 70, goal: 70, best0: 0, bhp: 0 }), null);
});

test('the page: install id and config are device-only keys, the arm goes into EV_BASE.v, the line shows only in arm b', () => {
  const local = html.slice(html.indexOf('const FS_LOCAL'), html.indexOf(']);', html.indexOf('const FS_LOCAL')));
  for (const k of ["'fw27_abid'", "'fw27_abcfg'"]) assert.ok(local.includes(k), k + ' stays on this device');
  assert.match(html, /EV_BASE = Object\.freeze\(\{ plat: EV_PLAT, v: AB_V \}\)/);
  assert.match(html, /const AB_NM = abArm\(AB, AB_ID, 'nm'\) === 'b'/);
  assert.match(html, /<div class="nearmiss" id="oNear" hidden>/);
  assert.match(html, /<i class="nearbar" aria-hidden="true">/, 'the bar repeats the text: screen readers skip it');
  assert.match(html, /bhp: boss && boss\.max > 0 \? Math\.ceil\(/, 'the line rounds the boss HP up');
  assert.equal(loadEvents().EV_V, '', 'the events block keeps its empty default');
});

test('near-miss strings exist in every language with the English placeholders', () => {
  const I = loadI18NParts().I18N;
  for (const l of Object.keys(I)) {
    assert.match(I[l].nearLeft, /\{n\}/, l); assert.match(I[l].nearLeft, /\{p\}/, l);
    assert.match(I[l].nearBoss, /\{h\}/, l);
    assert.ok(I[l].nearBest && !/\{/.test(I[l].nearBest), l);
  }
});
