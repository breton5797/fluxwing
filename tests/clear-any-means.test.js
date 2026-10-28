import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// Clear by any means (owner 2026-10-29, docs/design/surprise-obstacles-boss.md section 12): whatever the player uses, once 100 gates are behind the bird
// the stage clears (a boss stage starts its fight). It holds because no gate ever leaves the course unscored: broken, dashed and lane gates stay in `gates`
// until the bird is past them, and the one removal is far behind the scoring line. tests/e2e/clear-any-means.mjs flies it with every unit.
const html = readIndex();
const body = name => { const at = html.indexOf(name); assert.ok(at >= 0, name); return html.slice(at, html.indexOf('\n}\n', at)); };
const code = s => s.split('\n').map(l => l.replace(/(^|\s)\/\/ .*$/, '')).join('\n');   // comments off (comment-lint: nothing follows a `// ` comment on its line)

test('a gate is scored in one place only, and the count goes up with it', () => {
  assert.equal(html.match(/gatesPassed\+\+/g).length, 1);
  assert.equal(html.match(/\.scored = true/g).length, 1);
  assert.match(body('function update('), /if \(!g\.scored && bird\.x - bird\.r > g\.x \+ g\.w\)\{\n\s+g\.scored = true; gatesPassed\+\+;/);
});

test('the scoring check runs for every gate in the array, broken or dashed, before anything can return', () => {
  const up = body('function update('), loop = up.slice(up.indexOf('  for (const g of gates){\n    const cy = gY(g)'));
  const pass = loop.indexOf('if (!g.scored && bird.x - bird.r > g.x + g.w)');
  assert.ok(pass > 0);
  assert.doesNotMatch(code(loop.slice(0, pass)), /\bcontinue\b/, 'no gate skips the scoring check');
  assert.deepEqual(code(loop.slice(0, pass)).match(/return;/g), ['return;'], 'the only return before scoring follows a death');
  assert.match(loop.slice(0, pass), /die\([^\n]*\); if \(state !== 'play'\) return; \}/);
});

test('the only gate removal in a run is the filter far behind the bird: no gate leaves unscored, even at the fastest step', () => {
  const sets = html.match(/(?<![.\w])gates = [^;,]*[;,]/g);
  assert.deepEqual(sets.filter(s => !/^gates = \[\][;,]$/.test(s)),['gates = gates.filter(g => g.x > -120);'], 'reset, bossGo and selfTest empty it; nothing else drops gates');
  assert.doesNotMatch(html, /gates\.(splice|shift|pop)\(|gates\.length = /);
  const up = body('function update(');
  assert.ok(up.indexOf('gates = gates.filter(g => g.x > -120);') < up.indexOf('g.scored = true; gatesPassed++;'));
  // worst case per step: the fastest unit, at the top of the speed curve, dashing (x2.6) with the potion and the over hazard, on the longest frame step
  const step = +html.match(/function frameSteps\(elapsedS, maxStep = ([\d.]+)/)[1];
  const uMax = Math.max(...[...html.matchAll(/\{ id:'[a-z]+',[^\n]*? speed:([\d.]+),/g)].map(m => +m[1]));
  assert.match(up, /speed = \(190 \+ spdD\(diff\(\)\)\*120\) \* B\.speed;/);
  assert.match(up, /speed \* \(dashT > 0 \? 2\.6 : 1\) \* \(potionT > 0 \? POW\.potionSpeed : 1\) \* \(FX\.heavyT > 0 \? \.8 : 1\) \* \(overT > 0 \? HAZ\.overSpeed : 1\)/);
  const pot = +html.match(/potionSpeed:([\d.]+)/)[1], over = +html.match(/overSpeed:([\d.]+)/)[1];
  const worst = (190 + 1.5*120) * uMax * 2.6 * pot * over * step;
  // the bird sits at min(LW*.3, 150) (LW >= 300 on any phone): a gate is scored once its right edge is past bird.x - r, removed at x <= -120
  const scoreLine = 300*.3 - 15 - 68;
  assert.ok(uMax >= 1 && step <= .034);
  assert.ok(scoreLine - (-120) > 2 * worst, `a gate moves at most ${worst.toFixed(1)} px a step; ${scoreLine + 120} px lie between scoring and removal`);
});

test('stage mode lays exactly the goal\'s gates: one per spawnGate, none past the goal', () => {
  assert.match(body('function spawnGate('), /const idx = spawnIdx\+\+/);
  assert.equal(html.match(/gates\.push\(/g).length, 1);
  assert.equal(html.match(/spawnIdx\+\+/g).length, 1);
});

// every case group of a switch ends in break or return before the next case label; labels stacked on one body (case 'a': case 'b':) are one group
function fallThroughs(fnSrc){
  const src = code(fnSrc), at = src.indexOf('switch (id){');
  assert.ok(at > 0, 'switch (id)');
  let i = src.indexOf('{', at), depth = 0, end = -1;
  for (let k = i; k < src.length; k++){ if (src[k] === '{') depth++; else if (src[k] === '}' && --depth === 0){ end = k; break; } }
  const sw = src.slice(i + 1, end), labels = [...sw.matchAll(/case '([a-z]+)':/g)], bad = [];
  labels.forEach((m, n) => {
    const from = m.index + m[0].length, to = n + 1 < labels.length ? labels[n + 1].index : sw.length, part = sw.slice(from, to).trim();
    if (part && !/(break|return[^;]*);\s*\}?\s*$/.test(part)) bad.push(m[1]);   // an empty part: a stacked label
  });
  return { cases: labels.map(m => m[1]), bad };
}

test('the fall-through check finds a missing break (red check on a made-up switch)', () => {
  const fake = "function useSkill(){\n  switch (id){\n    case 'a': x = 1; break;   // one\n    case 'b': y = 2;   // falls through\n    case 'c': case 'd': z = 3; break;\n    case 'e': return;\n  }\n}";
  assert.deepEqual(fallThroughs(fake), { cases: ['a', 'b', 'c', 'd', 'e'], bad: ['b'] });
});

test('useSkill and useUlt: no case falls through into the next (AURORA never runs into TEMPEST\'s storm dash)', () => {
  for (const fn of ['function useSkill(', 'function useUlt(']){
    const { cases, bad } = fallThroughs(body(fn));
    assert.deepEqual(bad, [], fn + ' falls through');
    assert.ok(cases.includes('aurora') && cases.includes('tempest'), fn);
    assert.ok(cases.indexOf('tempest') === cases.indexOf('aurora') + 1, fn + ': AURORA sits right above TEMPEST, where a missing break would start a storm dash');
  }
  assert.match(html, /case 'aurora': FX\.laneN = Math\.max\(FX\.laneN, skv\('n'\)\);[^\n]*laneApply\(g\); break;\n    case 'tempest': case 'valkyrie': dashT/);
  assert.match(html, /FX\.laneP = true; for \(const g of gates\) if \(!g\.scored && !g\.broken\) laneApply\(g\); FX\.ultT = FX\.ultMax = u\.dur; break;\n    case 'tempest': case 'valkyrie': case 'garuda':/);
});
