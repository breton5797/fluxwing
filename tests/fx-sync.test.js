// The fx block inlined in index.html must exist, expose FX, and match the arcade-core sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFxBlock } from '../tools/sync-fx.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function extract() {
  const m = html.match(/\/\* fx:start[\s\S]*?\/\* fx:end \*\//);
  assert.ok(m, 'fx block missing from index.html — run: node tools/sync-fx.mjs');
  return m[0];
}

test('inlined fx block is in sync with arcade-core/fx sources', () => {
  assert.equal(extract(), buildFxBlock());
});

test('inlined fx block evaluates and exposes the FX api', () => {
  const FX = new Function(`${extract()}\nreturn FX;`)();
  assert.equal(FX.spawnCount(12, true), 6);
  assert.equal(FX.hitstop(1000).until, 1060);
  assert.equal(FX.ringPhases(0, 2).length, 2);
  assert.equal(FX.xpPopup(5).text, '+5 XP');
  assert.equal(FX.stepParticles([FX.makeParticle({ x: 0, y: 0, life: 0.01 })], 0.1).length, 0);
});
