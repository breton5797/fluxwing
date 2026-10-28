import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// Run fairness (audit 2026-10-28): the dash covers its own exit, a tap at the end of a dash is kept, the continue card only shows
// when it offers something, pops and banners stay on screen, haptic patterns keep their shape on native, the danger pulse respects
// reduced motion and the flash setting. The pure rules live in the run-fair block; the wiring is checked against the page source.
const html = readIndex();
const m = html.match(/\/\* run-fair:start[\s\S]*?\/\* run-fair:end \*\//);
const R = m ? new Function(`${m[0]}\nreturn {DASH_COVER, DASH_BUF, dashCover, contOk, popX, popFit, bannerFit, dangerPz};`)() : {};
const nat = html.match(/\/\* native:start[\s\S]*?\/\* native:end \*\//);
const N = new Function(`${nat[0]}\nreturn {natHapticStyle, natHapticPulses};`)();

test('the dash cover outlasts the dash by .3 s for every dash length', () => {
  assert.ok(m, 'run-fair block');
  for (const len of [1, 1.5]){
    const dashT = .55 * len, inv = R.dashCover(0, dashT);
    assert.ok(inv > dashT, `dashLen ${len}: ${inv} > ${dashT}`);
    assert.ok(Math.abs(inv - dashT - .3) < 1e-9);
  }
  assert.equal(R.dashCover(2.2, .55), 2.2, 'a longer invincibility already running is kept');
  assert.match(html, /dashT = \.55 \* PK\.dashLen; bird\.vy = 0; invuln = dashCover\(invuln, dashT\);/, 'dash() uses the rule');
});

test('a tap in the last moment of a dash is buffered and flown when the dash ends', () => {
  assert.ok(R.DASH_BUF > 0 && R.DASH_BUF <= .2);
  const fl = html.slice(html.indexOf('function flap(){'), html.indexOf('function dash(){'));
  assert.match(fl, /if \(dashT > 0\)\{ if \(dashT < DASH_BUF && !\(FX\.stormN > 0\)\) FX\.flapBuf = true; return; \}/);
  assert.match(html, /if \(dashT <= 0\)\{[^\n]*if \(FX\.flapBuf\)\{ FX\.flapBuf = false; flap\(\); \}/, 'the dash end flies the buffered tap');
  assert.match(html, /const newFx = \(\) => \(\{[^\n]*flapBuf:false/, 'reset() starts every run without one');
});

test('the continue card opens only when an option is usable', () => {
  const no = {revive: false}, ad = {revive: true};
  assert.equal(R.contOk('endless', false, 5, no, 0, 200), false, 'a fresh profile, no ads: straight to the result');
  assert.equal(R.contOk('endless', false, 5, no, 199, 200), false);
  assert.equal(R.contOk('endless', false, 5, no, 200, 200), true, 'coins pay');
  assert.equal(R.contOk('endless', false, 5, ad, 0, 200), true, 'an ad is ready');
  assert.equal(R.contOk('endless', true, 5, ad, 999, 200), false, 'once per run');
  assert.equal(R.contOk('endless', false, 2, ad, 999, 200), false, 'not before score 3');
  assert.equal(R.contOk('daily', false, 9, ad, 999, 200), false, 'stage mode only');
  const cc = html.match(/function canContinue\(\)\{[^\n]*/)[0];
  assert.match(cc, /contOk\(mode, contUsed, score, adOffers\(ADS\.ready\(\), \{ ?coinBonus: ?0, ?dailyBonus: ?null, ?claimed: ?\{\} ?\}\), W\.coins, CONT_COST\)/);
});

test('a pop is kept inside the screen at its widest', () => {
  assert.equal(R.popX(98.7, 136, 295.7), 142);
  assert.equal(R.popX(290, 50, 295.7), 295.7 - 56);
  assert.equal(R.popX(150, 40, 295.7), 150, 'a pop that fits stays where it is');
  assert.equal(R.popFit(1.6, 100, 295.7), 1.6, 'a short pop keeps its full pop-in');
  assert.ok(Math.abs(R.popFit(1.6, 222, 295.7) * 222 - (295.7 - 12)) < 1e-9, 'a long one is squeezed to the screen at its peak');
  assert.match(html, /const pw = ctx\.measureText\(p\.text\)\.width, ps = popFit\(s, pw, LW\); ctx\.translate\(popX\(p\.x, pw \* ps \/ 2, LW\), p\.y\)/);
});

test('bannerFit shrinks the font to the width, then wraps onto two lines at a space', () => {
  const meas = (px, s) => s.length * px * .7;   // a fake font: .7 em a character
  assert.deepEqual(R.bannerFit(meas, 'GO', 28, 270), {px: 28, lines: ['GO']});
  const a = R.bannerFit(meas, 'X'.repeat(20), 18, 200);   // 252 px at 18: fits at 14
  assert.equal(a.lines.length, 1); assert.ok(meas(a.px, a.lines[0]) <= 200 && a.px >= 12 && a.px < 18);
  const b = R.bannerFit(meas, 'Your opponent left. You win. Well played indeed', 18, 270);
  assert.equal(b.lines.length, 2); assert.ok(b.lines.every(l => meas(b.px, l) <= 270), JSON.stringify(b));
  assert.equal(b.lines.join(' '), 'Your opponent left. You win. Well played indeed');
  const c = R.bannerFit(meas, 'X'.repeat(60), 18, 270);   // no space to wrap at: smallest size, fillText's maxWidth squeezes the rest
  assert.deepEqual([c.px, c.lines.length], [12, 1]);
  const draw = html.slice(html.indexOf('for (const b of banners){'), html.indexOf("if (state === 'menu' && best > 0 && bestRoom)"));
  assert.match(draw, /bannerFit\(/);
  assert.match(draw, /fillText\([^)]*, LW - 24\)/, 'maxWidth as the last guard');
});

test('haptics: a pattern plays as timed pulses on native, and a Perfect fires one haptic', () => {
  assert.deepEqual(N.natHapticPulses(6), [{at: 0, style: 'LIGHT'}]);
  assert.deepEqual(N.natHapticPulses([20, 30, 40]), [{at: 0, style: 'LIGHT'}, {at: 50, style: 'MEDIUM'}]);
  assert.deepEqual(N.natHapticPulses([60, 30, 150]), [{at: 0, style: 'HEAVY'}, {at: 90, style: 'HEAVY'}]);
  assert.equal(N.natHapticPulses([60, 40, 60, 40, 60, 40, 60, 40, 60, 40, 60, 40, 250]).length, 6, 'capped at 6 pulses');
  assert.deepEqual(N.natHapticPulses(undefined), []);
  assert.deepEqual(N.natHapticPulses([]), []);
  const hap = html.match(/function haptic\(k\)\{[^\n]*/)[0];
  assert.match(hap, /natHapticPulses\(p\)/);
  assert.match(hap, /setTimeout\(/);
  assert.match(html, /near: \{ haptic: null \}/, 'the Perfect branch picks the haptic; the near event adds none');
});

test('death readability: the wall that killed is marked, the score fades so a top crash reads through it', () => {
  assert.match(html, /g\.flash = 1; g\.hitSide = bird\.y - hr < top \? 'top' : 'bot'; die\(/);
  const dg = html.slice(html.indexOf('function drawGate(g){'), html.indexOf('function drawBranch('));
  assert.match(dg, /state === 'dying' && g\.hitSide/);
  const hud = html.slice(html.indexOf('function drawHUD(){'), html.indexOf('function roundRect('));
  assert.match(hud, /state === 'dying' \? \.35 : 1/);
  assert.match(html, /cam\.fx = bird\.x; cam\.fy = bird\.y; cam\.tz = 1\.32;/, 'the zoom stays on the bird: the camera zooms about its focus, so a focus below a top crash would push the bird off the top');
});

test('flash safety: the danger pulse is steady with reduced motion or flash off, about 1.3 Hz otherwise; RM follows the OS', () => {
  assert.equal(R.dangerPz(1.234, true, true), .5);
  assert.equal(R.dangerPz(1.234, false, false), .5);
  for (const t of [0, .3, 1.1]) assert.ok(Math.abs(R.dangerPz(t, false, true) - (.5 + .5*Math.sin(t*8))) < 1e-12);
  assert.ok(8 / (2*Math.PI) < 1.5, 'under 1.5 Hz');
  assert.match(html, /const pz = dangerPz\(T, RM, IMP\.feat\.flash\)/);
  assert.doesNotMatch(html, /Math\.sin\(T\*18\), vd/);
  assert.match(html, /let RM = matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches;/);
  assert.match(html, /addEventListener\('change', e => \{ RM = e\.matches; \}\)/);
  assert.match(html, /invuln > 0 && godT <= 0 && !RM && Math\.floor\(T\*20\)%2 === 0/, 'no 10 Hz blink with reduced motion');
});
