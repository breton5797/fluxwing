import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// The first-time flow: the glide hint after the tutorial, tips on any first run, the next-stage button, the affordable cue, the ad text and the
// words and labels that used to be hard-coded English.
const html = readIndex();
const m = html.match(/\/\* ftue:start[\s\S]*?\/\* ftue:end \*\//);
const F = m ? new Function(`${m[0]}\nreturn {glideHintDue, adMsg, tutNext, nextStageOf, focusStage, newlyAffordable};`)() : {};
const fn = name => { const a = html.indexOf(`function ${name}(`); assert.ok(a >= 0, name); return html.slice(a, html.indexOf('\n}', a)); };

test('a pure ftue block', () => { assert.ok(m, '/* ftue:start */ … /* ftue:end */ in index.html'); });

test('glide hint: drawn after reset clears the banners, never on a tutorial run, once', () => {
  assert.doesNotMatch(fn('reset'), /glideHint|fw27_glide/, 'reset() also runs at boot and for the menu: it must not draw or spend the hint');
  const sg = fn('startGame'), rs = sg.indexOf('reset();'), hint = sg.indexOf("banner(t('glideHint')");
  assert.ok(rs > 0 && hint > rs, 'startGame draws the hint after reset() has cleared `banners = []`');
  assert.ok(sg.indexOf("store.set('fw27_glide', 1)") > rs, 'the seen flag is written only where the banner is drawn');
  assert.equal(F.glideHintDue({ mode: 'endless', glide: 1.5, seen: 0, tut: false }), false, 'tutorial run: the tip box has the floor');
  assert.equal(F.glideHintDue({ mode: 'endless', glide: 1.5, seen: 0, tut: true }), true, 'first stage run after the tutorial');
  assert.equal(F.glideHintDue({ mode: 'endless', glide: 1.5, seen: 1, tut: true }), false, 'once');
  assert.equal(F.glideHintDue({ mode: 'daily', glide: 0, seen: 0, tut: true }), false, 'no glide in fair modes');
  assert.equal(F.glideHintDue({ mode: 'endless', glide: 0, seen: 0, tut: true }), false);
});

test('tutorial tips: any first run gets them (daily too), spaced by gates', () => {
  const sg = fn('startGame');
  assert.match(sg, /tutStep = 1; tutFlaps = 0; showTip\(t\('tut1'\)\)/, 'startGame starts the tips for whatever mode runs first');
  assert.doesNotMatch(fn('startFromMenu'), /tutStep = 1/, 'not a second time from PLAY NOW');
  assert.equal(F.tutNext(1, 1), 1); assert.equal(F.tutNext(1, 2), 2, 'tut2 at gate 2');
  assert.equal(F.tutNext(2, 5), 2); assert.equal(F.tutNext(2, 6), 3, 'tut3 at gate 6');
  assert.equal(F.tutNext(3, 9), 3);
});

test('next stage: offered after a clear when the next one is open; the select focuses the highest open uncleared stage', () => {
  const clr = [1, 1, 0, 0], open = i => i <= 2;
  assert.equal(F.nextStageOf(1, true, 4, open), 2);
  assert.equal(F.nextStageOf(1, false, 4, open), -1, 'no clear this run');
  assert.equal(F.nextStageOf(3, true, 4, open), -1, 'the last stage');
  assert.equal(F.nextStageOf(2, true, 4, open), -1, 'next one still locked');
  assert.equal(F.focusStage(clr, open, 0), 2);
  assert.equal(F.focusStage([1, 1, 1, 1], () => true, 1), 1, 'everything cleared: keep the current one');
  assert.match(html, /id="oNext"/, 'a NEXT button on the result card');
  assert.ok(html.indexOf('id="oNext"') < html.indexOf('id="retryBtn"'), 'above RETRY');
});

test('affordable cue: only units that were not affordable before', () => {
  assert.deepEqual(F.newlyAffordable(['a'], ['a', 'b', 'c']), ['b', 'c']);
  assert.deepEqual(F.newlyAffordable(['a', 'b'], ['a']), []);
  assert.match(html, /toast\(t\('canUnlock', \{u: /);
});

test('ad text: neutral for a real provider, the test-build note only on the stub', () => {
  const tt = k => ({ adPlaying: 'Ad playing', adTestSfx: ' (test build)' })[k];
  assert.equal(F.adMsg('crazygames', tt), 'Ad playing');
  assert.equal(F.adMsg('poki', tt), 'Ad playing');
  assert.equal(F.adMsg('stub:ok', tt), 'Ad playing (test build)');
  assert.equal(F.adMsg(undefined, tt), 'Ad playing');
  assert.match(html, /\$\('contAdMsg'\)\.textContent = adMsg\(ADS\.name, t\);/);
});

test('no hard-coded English in the run: CLOSE!, OVERDRIVE, the seconds unit, the daily HUD line', () => {
  assert.doesNotMatch(html, /pop\('CLOSE!'/); assert.match(html, /pop\(t\('fx_close'\)/);
  assert.doesNotMatch(html, /banner\('OVERDRIVE'/); assert.match(html, /banner\(t\('fx_overdrive'\)/);
  assert.doesNotMatch(html, /skillCd\(\)\) \+ 's'/); assert.doesNotMatch(html, /\$\{SK\[B\.id\]\.cd\}s\)/);
  assert.ok((html.match(/t\('secFmt', \{n: /g) || []).length >= 2, 'secFmt in the HUD countdown and the hangar');
  assert.match(html, /t\('modeDaily', \{d: fmtDay\(runDay\)\}\), 16, LH - 30\)/, 'the daily HUD line uses the one mode name');
});

test('touch / app copy: tap-only restart hint, app-data warnings with a warning sign', () => {
  assert.match(html, /'hintTap'/); assert.match(html, /'authB3N'/); assert.match(html, /'frWarnN'/);
  assert.match(html, /⚠ <span data-i18n="authB3"/, 'the guest warning is a warning, not a ✓ benefit');
  assert.doesNotMatch(html, /<li data-i18n="authB3">/);
});

test('screen readers: localized labels, dialogs, a live toast', () => {
  const al = fn('applyI18n');
  for (const id of ['muteBtn', 'fxBtn', 'hgPrev', 'hgNext', 'helpBtn', 'langSel', 'ultBtn', 'skillBtn', 'oRefX', 'vsCodeIn', 'nickIn', 'frIn']) assert.ok(al.includes(`'${id}'`), id);
  assert.match(html, /<div id="toast" aria-live="polite" hidden><\/div>/);
  for (const id of ['over', 'stageScr', 'helpScr', 'vsScr', 'authScr', 'seaScr', 'dIntro', 'contScr', 'fxScr', 'confScr', 'shopScr', 'frScr', 'lbScr', 'plScr', 'pauseScr'])
    assert.match(html, new RegExp(`<div class="overlay" id="${id}" role="dialog" aria-modal="true" aria-labelledby="[a-zA-Z0-9]+"`), id);
  for (const id of [...html.matchAll(/aria-labelledby="([a-zA-Z0-9]+)"/g)].map(x => x[1])) assert.match(html, new RegExp(`id="${id}"`), 'label target ' + id);
  assert.doesNotMatch(html, /id="muteBtn"[^>]*aria-pressed/, 'mute toggle state belongs to the audio package');
});

test('help: stages and stars, power-ups, glide, evolution, zone obstacles', () => {
  for (const k of ['hStage', 'hPow', 'hGlide', 'hEvo', 'hZone']) assert.match(html, new RegExp(`<p data-i18n="${k}"></p>`), k);
  assert.match(html, /<p data-i18n="hUnits"><\/p><p data-i18n="hRp"><\/p>/);
});
