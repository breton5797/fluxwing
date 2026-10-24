import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadLoop } from './helpers/loop.js';

const { frameSteps } = loadLoop();

test('a slow frame is simulated in full by several steps, never slowed down', () => {
  const sum = a => a.reduce((s, x) => s + x, 0);
  assert.deepEqual(frameSteps(.016), [.016]);
  const s50 = frameSteps(.050); assert.equal(s50.length, 2); assert.ok(Math.abs(sum(s50) - .050) < 1e-9); assert.ok(s50.every(x => x <= .034 + 1e-9));
  assert.ok(Math.abs(sum(frameSteps(.1)) - .1) < 1e-9);
  assert.equal(frameSteps(2).length, 8); assert.ok(Math.abs(sum(frameSteps(2)) - .25) < 1e-9);   // background return: capped, no spiral
  assert.deepEqual(frameSteps(0), []); assert.deepEqual(frameSteps(-1), []);
});
