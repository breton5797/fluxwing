// The fx block inlined in index.html must exist, expose FX, and match the arcade-core sources.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
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

test('inlined fx block evaluates and exposes the AFX api', () => {
  const AFX = new Function(`${extract()}\nreturn AFX;`)();
  assert.equal(AFX.spawnCount(12, true), 6);
  assert.equal(AFX.hitstop(1000).until, 1060);
  assert.equal(AFX.ringPhases(0, 2).length, 2);
  assert.equal(AFX.xpPopup(5).text, '+5 XP');
  assert.equal(AFX.stepParticles([AFX.makeParticle({ x: 0, y: 0, life: 0.01 })], 0.1).length, 0);
});

test('every inline <script> in index.html still parses (no duplicate declarations etc.)', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 2);
  for (const s of scripts) new Script(s); // throws on SyntaxError
});
