import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18NParts } from './helpers/i18n.js';

// Replay rewards (owner's decision 2026-10-27): three mastery stars per stage paid once each, a daily replay bonus,
// evolution rewards, a cap on a run's score coins and five coin2x ads a day.
const html = readIndex();
const m = html.match(/\/\* replay:start[\s\S]*?\/\* replay:end \*\//);
const R = m ? new Function(`${m[0]}\nreturn {REPLAY, starNeed, starBits, starPay, replayDay, replayPay, scoreCoinCap, evoPay, ad2xLeft};`)() : {};

test('the numbers', () => {
  assert.ok(m, 'a pure replay block');
  assert.deepEqual([...R.REPLAY.starK], [3, 4, 5, 6]);
  assert.deepEqual({...R.REPLAY.starGem}, {2: 2, 4: 3});
  assert.deepEqual([R.REPLAY.dayN, R.REPLAY.dayCoin, R.REPLAY.dayDia, R.REPLAY.evoCoin, R.REPLAY.scCap, R.REPLAY.ad2xDay], [5, .3, .2, .1, 2, 5]);
  assert.deepEqual([...R.REPLAY.evoGem], [0, 1, 2, 3, 5], 'forms II-V: 1, 2, 3, 5 gems');
  assert.equal(R.starNeed(41, 3), 246, 'stage 50: goal 41 x 6');
});

test('stars: the clear, flawless, the score; only new ones pay, the clear never (it has its own reward)', () => {
  assert.equal(R.starBits({cleared: false, flawless: true, score: 999, need: 10}), 0, 'no clear, no star');
  assert.equal(R.starBits({cleared: true, flawless: false, score: 5, need: 10}), 1);
  assert.equal(R.starBits({cleared: true, flawless: true, score: 10, need: 10}), 7);
  assert.deepEqual(R.starPay(1, 7, 750), {mask: 7, nw: 6, gem: 5, dia: 750});
  assert.deepEqual(R.starPay(3, 7, 200), {mask: 7, nw: 4, gem: 3, dia: 100});
  assert.deepEqual(R.starPay(7, 7, 200), {mask: 7, nw: 0, gem: 0, dia: 0}, 'once each');
  assert.deepEqual(R.starPay(0, 1, 200), {mask: 1, nw: 1, gem: 0, dia: 0});
  // lifetime: 50 stages x 5 gems
  assert.equal(50 * R.starPay(1, 7, 0).gem, 250);
});

test('daily replay bonus: the first re-clear of up to five distinct stages a day', () => {
  let rec = null, paid = 0;
  for (const i of [3, 3, 4, 5, 6, 7, 8, 9]){ const r = R.replayDay(rec, '2026-10-27', i); rec = r.rec; if (r.pay) paid++; }
  assert.equal(paid, 5); assert.deepEqual(rec.st, [3, 4, 5, 6, 7]);
  assert.equal(R.replayDay(rec, '2026-10-28', 3).pay, true, 'a new day starts again');
  assert.deepEqual(R.replayDay({day: '2026-10-27', st: 'junk'}, '2026-10-27', 1), {rec: {day: '2026-10-27', st: [1]}, pay: true}, 'a bad record is a fresh one');
  assert.deepEqual(R.replayPay(3000, 750), {coin: 900, dia: 150});
});

test('the score-coin cap, evolution rewards and the coin2x day', () => {
  assert.equal(R.scoreCoinCap(550), 1100); assert.equal(R.scoreCoinCap(3000), 6000);
  assert.deepEqual(R.evoPay(true, 0, 3000), {coin: 300, gem: 0});
  assert.deepEqual(R.evoPay(true, 4, 3000), {coin: 300, gem: 5});
  assert.deepEqual(R.evoPay(false, 0, 3000), {coin: 0, gem: 0});
  assert.equal([1, 2, 3, 4].reduce((s, f) => s + R.evoPay(true, f, 0).gem, 0), 11, 'forms II-V: 11 gems a unit');
  assert.equal(R.ad2xLeft(null, 'd').left, 5);
  assert.equal(R.ad2xLeft({day: 'd', n: 4}, 'd').left, 1);
  assert.equal(R.ad2xLeft({day: 'd', n: 9}, 'd').left, 0);
  assert.equal(R.ad2xLeft({day: 'old', n: 9}, 'd').left, 5);
});

test('wiring: a hit marks the run, the clear reads it, the stars live in the synced stage record', () => {
  assert.match(html, /const hitReset = \(\) => \{ FX\.arch = 0; FX\.loops = 0; FX\.loopsWas = -1; FX\.hit = true; \};/);
  assert.match(html, /hit:false, flawless:false,/);
  assert.match(html, /FX\.clearDone = true; FX\.flawless = !FX\.hit;/);
  assert.match(html, /stg: \{ gates: fsArr\(s\.gates, 1e9\), score: fsArr\(s\.score, 1e9\), clr: fsArr\(s\.clr, 1\), star: fsArr\(s\.star, 7\),/);
  assert.match(html, /star: l\.stg\.star\.map\(\(v, i\) => v \| r\.stg\.star\[i\]\)/, 'stars merge by OR');
  assert.match(html, /star: \[\.\.\.s\.stg\.star\]/);
  assert.match(html, /star: arr\(s\.star\)\.map\(v => v & 7\)/, 'the device copy too');
});

test('wiring: the run settles stars, the cap and the ad day; the replay and evolution rewards pay at the clear', () => {
  assert.match(html, /scoreCoin = inSt \? Math\.min\(scoreCoinCap\(clearCoinOf\(curStage\)\), Math\.round\(scoreCoins\(score, stTier\(curStage\)\) \* PK\.coinMul\)\) : 0;/);
  assert.match(html, /const sp = starPay\(stg\.star\[curStage\] \| stg\.clr\[curStage\], starBits\(/);
  assert.match(html, /const rd = replayDay\(store\.get\('fw27_rday', null\), dayKey\(\), curStage\);/);
  assert.match(html, /const ep = evoPay\(true, ev\.up \? ev\.form : 0, clearCoinOf\(curStage\)\);/);
  assert.match(html, /const adOffers = \(ready, run, left2x = Infinity\) =>/);
  assert.match(html, /adOffers\(ADS\.ready\(\), adRun, ad2xLeft\(store\.get\('fw27_ad2x', null\), dayKey\(\)\)\.left\)/);
  for (const k of ['fw27_rday', 'fw27_ad2x']) assert.ok(html.includes(`'${k}'`), k);
});

test('every language names the new rewards', () => {
  const P = loadI18NParts();
  for (const [l, tb] of Object.entries(P.I18N)) for (const k of ['rwReplay', 'rwEvo', 'starFlaw', 'starScore', 'starNeed']){
    assert.ok(tb[k] && tb[k].trim(), `${l} ${k}`);
    if (k === 'starNeed') assert.match(tb[k], /\{n\}/, `${l} starNeed`);
  }
});
