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
