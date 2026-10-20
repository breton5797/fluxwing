import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAds } from './helpers/ads.js';

const A = loadAds();
const NOW = 1_800_000_000_000, GAP = A.AD_CFG.interGapMs;

test('broken or tampered pacing data reads as a fresh install', () => {
  for (const raw of [null, undefined, 7, 'x', [], { runs: 'x', lastAt: -5 }, { runs: -3, lastAt: NaN }])
    assert.deepEqual(A.adNorm(raw, NOW), { runs: 0, lastAt: 0 });
  assert.deepEqual(A.adNorm({ runs: 2.9, lastAt: NOW - 10 }, NOW), { runs: 2, lastAt: NOW - 10 });
});

test('a lastAt in the future (clock moved back) is pulled to now', () => {
  assert.equal(A.adNorm({ runs: 5, lastAt: NOW + 9e9 }, NOW).lastAt, NOW);
});

test('interstitial: at most one per 3 runs and never inside the gap', () => {
  const ctx = { mode: 'endless', rewarded: false };
  let st = A.adNorm(null, NOW);
  st = A.adRunDone(A.adRunDone(st));
  assert.equal(A.adInterDue(st, NOW, ctx), false);           // 2 runs
  st = A.adRunDone(st);
  assert.equal(A.adInterDue(st, NOW, ctx), true);            // 3 runs, never shown
  st = A.adInterShown(st, NOW);
  assert.deepEqual(st, { runs: 0, lastAt: NOW });
  st = A.adRunDone(A.adRunDone(A.adRunDone(st)));
  assert.equal(A.adInterDue(st, NOW + GAP - 1, ctx), false); // 3 runs but inside the gap
  assert.equal(A.adInterDue(st, NOW + GAP, ctx), true);
});

test('no interstitial in versus or right after a rewarded ad', () => {
  const st = { runs: 9, lastAt: 0 };
  assert.equal(A.adInterDue(st, NOW, { mode: 'versus', rewarded: false }), false);
  assert.equal(A.adInterDue(st, NOW, { mode: 'daily', rewarded: true }), false);
});

test('pacing helpers return new objects', () => {
  const st = Object.freeze({ runs: 1, lastAt: 0 });
  assert.notEqual(A.adRunDone(st), st);
});

test('coin x2 pays the run income again; daily x2 the daily reward again', () => {
  assert.equal(A.adCoinBonus(120, 330), 450);
  assert.equal(A.adCoinBonus(-5, NaN), 0);
  assert.deepEqual(A.adDailyBonus({ coin: 350, dia: 100, gem: 2 }), { coin: 350, dia: 100, gem: 2 });
  assert.equal(A.adDailyBonus(null), null);
});

test('each placement can be claimed once per run', () => {
  const c1 = A.adClaim({}, 'coin2x');
  assert.deepEqual(c1, { coin2x: true });
  assert.equal(A.adClaim(c1, 'coin2x'), null);
  assert.deepEqual(A.adClaim(c1, 'daily2x'), { coin2x: true, daily2x: true });
});

test('offers hide everything when no ad is ready, and anything already claimed or worth 0', () => {
  const run = { coinBonus: 10, dailyBonus: { coin: 1, dia: 0, gem: 0 }, claimed: {} };
  assert.deepEqual(A.adOffers(false, run), { revive: false, coin2x: false, daily2x: false });
  assert.deepEqual(A.adOffers(true, run), { revive: true, coin2x: true, daily2x: true });
  assert.deepEqual(A.adOffers(true, { coinBonus: 0, dailyBonus: null, claimed: {} }), { revive: true, coin2x: false, daily2x: false });
  assert.equal(A.adOffers(true, { ...run, claimed: { coin2x: true } }).coin2x, false);
});

const tick = () => new Promise(r => setTimeout(r, 0));

test('the stub answers by its mode', async () => {
  const mk = mode => A.adStub({ mode, wait: tick, ms: 1 });
  assert.equal(await mk('ok').rewarded('revive'), 'granted');
  assert.equal(await mk('skip').rewarded('revive'), 'skipped');
  assert.equal(await mk('fail').rewarded('revive'), 'failed');
  assert.equal(mk('none').ready(), false);
  assert.equal(mk('ok').ready(), true);
  assert.equal(await mk('ok').interstitial(), 'shown');
  assert.equal(await mk('fail').interstitial(), 'failed');
});

test('the guard turns a hang, a throw or junk into failed', async () => {
  const hang = { name: 'hang', ready: () => true, rewarded: () => new Promise(() => {}), interstitial: () => new Promise(() => {}) };
  const boom = { name: 'boom', ready: () => { throw new Error('x'); }, rewarded: () => { throw new Error('x'); }, interstitial: async () => { throw new Error('x'); } };
  const junk = { name: 'junk', ready: () => 1, rewarded: async () => 'yes', interstitial: async () => 42 };
  const g = a => A.adGuard(a, tick, 5);
  assert.equal(await g(hang).rewarded('coin2x'), 'failed');
  assert.equal(await g(hang).interstitial(), 'failed');
  assert.equal(g(boom).ready(), false);
  assert.equal(await g(boom).rewarded('coin2x'), 'failed');
  assert.equal(await g(boom).interstitial(), 'failed');
  assert.equal(await g(junk).rewarded('coin2x'), 'failed');
  assert.equal(await g(junk).interstitial(), 'failed');
  assert.equal(g(junk).ready(), true);
});

test('?ads= picks a stub mode only where the stub is the provider or on localhost', () => {
  assert.deepEqual(A.adPick('', 'breton5797.github.io', undefined), { prov: 'stub', mode: 'ok' });
  assert.deepEqual(A.adPick('?ads=fail', 'breton5797.github.io', 'stub'), { prov: 'stub', mode: 'fail' });
  assert.deepEqual(A.adPick('?ads=ok', 'breton5797.github.io', 'poki'), { prov: 'poki', mode: '' });
  assert.deepEqual(A.adPick('?ads=none', 'localhost', 'poki'), { prov: 'stub', mode: 'none' });
  assert.deepEqual(A.adPick('?ads=hack', 'localhost', 'stub'), { prov: 'stub', mode: 'ok' });
});

test("ads 'none': no offers anywhere, and ?ads= cannot bring the stub back off localhost", () => {
  assert.deepEqual(A.adPick('', 'swishby.com', 'none'), { prov: 'none', mode: '' });
  assert.deepEqual(A.adPick('?ads=ok', 'swishby.com', 'none'), { prov: 'none', mode: '' });
  assert.deepEqual(A.adPick('?ads=ok', 'localhost', 'none'), { prov: 'stub', mode: 'ok' }, 'local QA can still exercise the stub');
  const a = A.adMake({ prov: 'none', mode: '' }, { wait: async () => {}, load: async () => null });
  assert.equal(a.name, 'stub:none');
  assert.equal(a.ready(), false);
  assert.deepEqual(A.adOffers(a.ready(), { coinBonus: 10, dailyBonus: { c: 1, g: 1 }, claimed: {} }), { revive: false, coin2x: false, daily2x: false });
});
