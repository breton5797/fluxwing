// Performance and offline (audit 2026-10-28, package perf-offline): the auto fx quality a device learned survives a reload,
// mid quality drops the costly glow, the page registers its service worker only on the live site, and a session that started
// offline tries the server again when the network comes back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFx, readIndex } from './helpers/fx.js';

const html = readIndex(), F = loadFx(html);
const HW8 = { cores: 8, mem: 8, dpr: 3 }, HW6 = { cores: 6, mem: 4, dpr: 2 }, HW4 = { cores: 4, mem: 2, dpr: 2 };

test('auto quality starts at the level this device learned', () => {
  for (const q of ['low', 'mid', 'high']) assert.equal(F.fxQualityPick(HW8, 'auto', q), q);
  assert.equal(F.fxQualityPick(HW4, 'auto', 'mid'), 'mid', 'the learned level wins over the hardware guess');
  assert.equal(F.fxQualityPick(HW8, 'high', 'low'), 'high', 'a quality the player chose wins over the learned one');
  assert.equal(F.fxQualityPick(HW8, 'auto', 'bogus'), 'mid', 'a broken stored value is ignored');
});

test('the first launch of a fast device starts at mid, not high', () => {
  assert.equal(F.fxQualityPick(HW8, 'auto'), 'mid');
  assert.equal(F.fxQualityPick(HW8, 'auto', null), 'mid');
  assert.equal(F.fxQualityPick(HW6, 'auto'), 'mid');
  assert.equal(F.fxQualityPick(HW4, 'auto'), 'low');
});

test('a very slow window steps from high straight to low', () => {
  assert.equal(F.fxQualityStep('high', 41), 'low');
  assert.equal(F.fxQualityStep('high', 40), 'mid');
  assert.equal(F.fxQualityStep('high', 25), 'mid');
  assert.equal(F.fxQualityStep('mid', 45), 'low');
  assert.equal(F.fxQualityStep('high', 20), 'high');
});

test('quality steps up one tier only after 600 smooth frames', () => {
  assert.equal(F.fxQualityUp('low', 600, 11), 'mid');
  assert.equal(F.fxQualityUp('mid', 720, 8), 'high');
  assert.equal(F.fxQualityUp('high', 900, 5), 'high');
  assert.equal(F.fxQualityUp('low', 480, 8), 'low', 'not enough smooth frames yet');
  assert.equal(F.fxQualityUp('low', 600, 12), 'low', 'p90 must be under 12 ms');
});

test('mid quality drops glow and caps the backing store at 1.75x; high is unchanged', () => {
  const a = { shake: true, flash: true }, f = q => F.fxFeatures(q, a, false, false);
  assert.equal(f('mid').glow, false);
  assert.equal(f('mid').dprCap, 1.75);
  assert.equal(f('low').dprCap, 1.5);
  assert.equal(f('high').glow, true);
  assert.equal(f('high').dprCap, 2);
});

test('the loop saves the learned level and keeps the player setting on auto', () => {
  const loop = html.slice(html.indexOf('function loop(now){'), html.indexOf('requestAnimationFrame(loop);\n}'));
  assert.match(loop, /fxQualityUp\(/, 'at most one step up a session');
  assert.match(html, /function fxLearn\(q\)\{ try \{ store\.set\('fw27_fxq_auto', q\); \} catch\(e\)\{\} \}/);
  assert.match(loop, /fxLearn\(q2\)/);
  assert.doesNotMatch(loop, /fxSettings\.q\s*=(?!=)/, 'the player setting stays auto');
  assert.match(html, /fxQualityPick\(fxHw, fxSettings\.q, store\.get\('fw27_fxq_auto', null\)\)/);
  const local = html.slice(html.indexOf('const FS_LOCAL'), html.indexOf(']);', html.indexOf('const FS_LOCAL')));
  assert.ok(local.includes("'fw27_fxq_auto'"), 'the learned level is per device, never synced');
});

const swOk = new Function(`${html.match(/\/\* sw-reg:start[\s\S]*?\/\* sw-reg:end \*\//)[0]}\nreturn swOk;`)();
const loc = (hostname, search = '') => ({ hostname, search });

test('the service worker registers only on the live site and its previews', () => {
  assert.equal(swOk(loc('swishby.com'), false), true);
  assert.equal(swOk(loc('fluxwing-git-x-minimalkora.vercel.app'), false), true);
  assert.equal(swOk(loc('swishby.com'), true), false, 'never in the native app');
  assert.equal(swOk(loc('localhost'), false), false, 'not on the dev server');
  assert.equal(swOk(loc('127.0.0.1'), false), false);
  assert.equal(swOk(loc('breton5797.github.io'), false), false);
  assert.equal(swOk(loc('evilswishby.com'), false), false);
  assert.equal(swOk(loc('localhost', '?sw=1'), false), true, 'QA flag on the local server');
  assert.equal(swOk(loc('localhost', '?sw=1'), true), false);
  assert.equal(swOk(loc('swishby.com.evil.app', '?sw=1'), false), false);
  assert.match(html, /if \(swOk\(location, NAT\)\) swReg\(\);/);
});

test('a session that started offline tries the server again', () => {
  assert.match(html, /window\.addEventListener\('online', \(\) => online\(\)\);/);
  assert.match(html, /function reconnect\(\)\{ if \(backend === 'none'\) online\(\); \}/);
  const toMenu = html.slice(html.indexOf('function toMenu(){'), html.indexOf('\n}', html.indexOf('function toMenu(){')));
  assert.match(toMenu, /reconnect\(\)/);
  const over = html.slice(html.indexOf('function showOver(){'), html.indexOf('\n}', html.indexOf('function showOver(){')));
  assert.match(over, /reconnect\(\)/);
  const on = html.slice(html.indexOf('function online(){'), html.indexOf('\n}', html.indexOf('function online(){')));
  assert.match(on, /Date\.now\(\) - dbAt < 15000/, 'still at most one try every 15 s');
});
