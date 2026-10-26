import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// Fixes from the 2026-10-27 audit (feature list and error check).
const html = readIndex();

test('a stage-mode best keeps its gate count and unit, so a resend is not refused as implausible', () => {
  assert.match(html, /nb = score > best; if \(nb\)\{ best = score; store\.set\('fw27_best', best\); store\.set\('fw27_bestg', gatesPassed\); store\.set\('fw27_bestu', B\.id\); \}/);
  assert.match(html, /submitScore\(best, store\.get\('fw27_bestg', 0\), 'endless', k, store\.get\('fw27_bestu', B\.id\)\)/, 'syncLocal sends the unit that flew the best');
  assert.match(html, /function submitScore\(sc, gp, m, key, bird = B\.id\)\{/);
  const fn = html.slice(html.indexOf('\n', html.indexOf('function submitScore(')), html.indexOf('let r = await sbRpc(args);'));   // the body, after the default argument
  assert.doesNotMatch(fn, /B\.id/, 'submitScore reads the unit from its argument only');
  assert.match(html, /'fw27_bestu'/, 'the key is classified');
});

test('Esc closes the effects, versus and help screens before anything else; help blocks game keys', () => {
  assert.match(html, /if \(lbOpen\)\{ if \(e\.code === 'Escape' && \$\('seaScr'\)\.hidden\)\{ if \(!\$\('fxScr'\)\.hidden\) \$\('fxClose'\)\.click\(\); else if \(!\$\('helpScr'\)\.hidden\) \$\('helpClose'\)\.click\(\); else if \(!\$\('vsScr'\)\.hidden\) \$\('vsClose'\)\.click\(\); else if \(!\$\('confScr'\)\.hidden\)/);
  assert.match(html, /\$\('helpScr'\)\.hidden = false; lbOpen = true; \}\);/);
  assert.match(html, /\$\('helpScr'\)\.hidden = true; lbOpen = !\$\('shopScr'\)\.hidden \|\| !\$\('lbScr'\)\.hidden; \}\);/);
});

test('a finished match leaves its room only if no new search started since', () => {
  assert.doesNotMatch(html, /setTimeout\(\(\) => vsLeave\(\), 1500\);/);
  assert.equal(html.split("{ const tok = vs.tok; setTimeout(() => { if (tok === vs.tok) vsLeave(); }, 1500); }").length - 1, 2);
});

test('a refused session is refreshed first; a signed-in account never silently becomes a new guest', () => {
  const fn = html.slice(html.indexOf('function sbReauth(){'), html.indexOf('// Captcha (captcha block above)'));
  assert.match(fn, /const rs = await sbC\.auth\.refreshSession\(\);/);
  assert.ok(fn.indexOf('refreshSession') < fn.indexOf('signInAnonymously'), 'refresh before a new guest');
  assert.match(fn, /if \(!authAnon\(\)\)\{ sbOff\(\); return false; \}/, 'a real account goes offline instead');
});

test('the tutorial starts only when the run did', () => {
  assert.match(html, /const prev = curStage; curStage = 0; startGame\('endless'\); if \(state !== 'play'\)\{ curStage = prev; return; \}/);
});

test('a hit during Eternal Return is not undone when the ultimate ends', () => {
  assert.match(html, /const hitReset = \(\) => \{ FX\.arch = 0; FX\.loops = 0; FX\.loopsWas = -1; FX\.hit = true; \};/);
});
