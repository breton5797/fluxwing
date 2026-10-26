import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// AURORA (hidden ultra) was the balance outlier: 8 sure-Perfect gates every 12 s kept fever alive for most of a run (mean 1283 at stage 20 against 189-333 for the open ultras).
// Retuned 2026-10-26 to 3 gates every 16 s and a 4 s ultimate (mean 243 at form I, 492 at form V). The texts carry these numbers only through {n}.
const html = readIndex();

test('AURORA: three lane gates every 16 s, a four-second ultimate, and the self-test pins the three', () => {
  assert.match(html, /aurora:\{cd:16,n:3,gap:40,perf:1,f:\{cd:18,n:1,gap:0,perf:0\}\}/);
  assert.match(html, /\n {2}aurora:\{dur:4, gap:70, out:3\},/);
  assert.match(html, /\.map\(skN\), \[4,6,5,6,6,3,5,4,6\]\)/);
});
