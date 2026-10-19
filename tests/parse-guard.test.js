// The 2026 SyntaxError incident: a duplicate const in the inline script broke the whole game.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import { readIndex } from './helpers/fx.js';

test('every executable inline <script> in index.html compiles', () => {
  const html = readIndex(), re = /<script(?![^>]*type="application\/json")[^>]*>([\s\S]*?)<\/script>/g;
  let m, n = 0;
  while ((m = re.exec(html))) { if (!m[1].trim()) continue; assert.doesNotThrow(() => new vm.Script(m[1]), `script #${n}`); n++; }
  assert.ok(n >= 2);
});

test('fx-core does not redeclare game globals', () => {
  const blk = readIndex().match(/\/\* fx-core:start[\s\S]*?\/\* fx-core:end \*\//)[0];
  for (const name of ['FX', 'hitstop', 'shake', 'flash', 'slowT', 'parts', 'rings', 'pops', 'banners', 'ghosts', 'cam', 'SFX', 'HAPTIC', 'RM', 'tier', 'feverGlow'])
    assert.doesNotMatch(blk, new RegExp(`\\b(const|let|var|function)\\s+${name}\\b`), name);
});

test('social-core does not redeclare game globals', () => {
  const blk = readIndex().match(/\/\* social-core:start[\s\S]*?\/\* social-core:end \*\//)[0];
  for (const name of ['vs', 'W', 'sb', 'uid', 'nick', 'rp', 'toast', 't', 'store', 'SOC'])
    assert.doesNotMatch(blk, new RegExp(`\\b(const|let|var|function)\\s+${name}\\b`), name);
});
