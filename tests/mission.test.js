import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// 100-gate missions (owner 2026-10-29, docs/design/surprise-obstacles-boss.md section 1): reaching the goal in stage mode ends the run as a win
// (a short MISSION CLEAR beat, then the result card); a boss stage starts its fight instead. Daily and versus keep flying.
const html = readIndex();
const body = name => { const at = html.indexOf(name); assert.ok(at >= 0, name); return html.slice(at, html.indexOf('\n}\n', at)); };

test('stage mode stops laying gates at the goal; daily and versus keep spawning', () => {
  const up = body('function update(');
  assert.match(up, /if \(lastG && lastG\.x < LW - \(250 - lastG\.d\*30\) \* \(lastG\.twin \? TWIN : 1\) && !\(mode === 'endless' && spawnIdx >= stGoal\(curStage\)\)\) spawnGate\(/);
});

test('reaching the goal: a boss row starts the fight (bossStart), any other stage wins (stageWin); stage mode only', () => {
  const up = body('function update(');
  assert.match(up, /if \(mode === 'endless' && !FX\.clearDone && !FX\.bossOn && gatesPassed >= stGoal\(curStage\)\)\{ if \(STAGES\[curStage\]\.boss\) bossStart\(\); else stageWin\(\); \}/);
  const b = body('function bossStart(');
  assert.doesNotMatch(b, /stageWin\(/, 'phase 2: the boss is fought (tests/boss.test.js); its defeat wins the stage');
  assert.match(b, /FX\.bossOn = true;/);
});

test('stageWin pays the clear once and starts the MISSION CLEAR beat; the beat ends in the result card, never a continue', () => {
  const w = body('function stageWin(');
  assert.match(w, /FX\.clearDone = true; FX\.flawless = !FX\.hit;/);
  assert.match(w, /FX\.winT = WIN_BEAT;/);
  assert.match(html, /const WIN_BEAT = 1\.2;/);
  const up = body('function update(');
  assert.match(up, /if \(FX\.winT > 0\)\{ winTick\(rdt, dt\); return; \}/);
  assert.match(body('function winTick('), /if \(\(FX\.winT -= rdt\) <= 0\)\{ FX\.winT = 0; showOver\(\); return; \}/);
  assert.ok(up.indexOf('FX.winT > 0') < up.indexOf('for (const g of gates){'), 'no gate, obstacle or surprise can hit during the beat');
  assert.match(html, /why\.textContent = FX\.won \? t\('stClear', \{n: curStage \+ 1\}\) : t\(deathHint\(deathWhy, gatesPassed\)\);/);
});

test('runD in stage mode climbs for 45 gates and then holds the stage\'s top difficulty; daily and versus are unchanged', () => {
  const src = body('function runD(') + '\n}';
  const run = (mode, d0, k) => new Function('mode', 'stD0', 'curStage', `${src}\nreturn runD(${k});`)(mode, () => d0, 0);
  assert.equal(run('endless', .2, 45), .55);
  assert.equal(run('endless', .2, 99), .55);
  assert.equal(run('daily', 0, 30), 30 / 45);
  assert.equal(run('daily', 0, 99), 1);
});
