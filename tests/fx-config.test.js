import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadFx, readIndex } from './helpers/fx.js';
const src = JSON.parse(readFileSync(new URL('../fx-config.json', import.meta.url), 'utf8'));
const html = readIndex();

test('index.html embeds exactly fx-config.json (run scripts/fx-inline.mjs)', () => {
  const m = html.match(/<script type="application\/json" id="fxcfg">([\s\S]*?)<\/script>/);
  assert.ok(m, 'fxcfg block missing');
  assert.deepEqual(JSON.parse(m[1]), src);
});

test('fx-config.json values are inside FX_RANGES (merge changes nothing)', () => {
  const F = loadFx();
  assert.deepEqual(F.fxCfgMerge(F.FX_DEFAULTS, src), F.fxCfgMerge(F.FX_DEFAULTS, F.fxCfgMerge(F.FX_DEFAULTS, src)));
  const merged = F.fxCfgMerge(F.FX_DEFAULTS, src);
  assert.equal(merged.slowmo.scale, .3);
  assert.equal(merged.death.slow, .4);
  assert.equal(merged.chroma.dur, .2);
});
