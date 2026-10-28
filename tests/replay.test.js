import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18NParts } from './helpers/i18n.js';

// Replay rewards (owner's decision 2026-10-27): three mastery stars per stage paid once each, a daily replay bonus,
// evolution rewards, a cap on a run's score coins and five coin2x ads a day.
const html = readIndex();
const m = html.match(/\/\* replay:start[\s\S]*?\/\* replay:end \*\//);
const R = m ? new Function(`${m[0]}\nreturn {REPLAY, starNeed, starBits, starPay, replayDay, replayPay, scoreCoinCap, evoPay, ad2xLeft, failPay};`)() : {};

test('the numbers', () => {
  assert.ok(m, 'a pure replay block');
  assert.deepEqual([...R.REPLAY.starK], [3, 4, 5, 6]);
  assert.deepEqual({...R.REPLAY.starGem}, {2: 2, 4: 3});
  assert.deepEqual([R.REPLAY.dayN, R.REPLAY.dayCoin, R.REPLAY.dayDia, R.REPLAY.evoCoin, R.REPLAY.scCap, R.REPLAY.ad2xDay, R.REPLAY.failK], [10, .3, .2, .1, 2, 5, .35],
    'replay cap 5 -> 10 stages a day and the failed-run distance floor (owner 2026-10-28)');
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

test('daily replay bonus: the first re-clear of up to ten distinct stages a day', () => {
  let rec = null, paid = 0;
  for (const i of [3, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]){ const r = R.replayDay(rec, '2026-10-27', i); rec = r.rec; if (r.pay) paid++; }
  assert.equal(paid, 10); assert.deepEqual(rec.st, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.equal(R.replayDay(rec, '2026-10-28', 3).pay, true, 'a new day starts again');
  assert.deepEqual(R.replayDay({day: '2026-10-27', st: 'junk'}, '2026-10-27', 1), {rec: {day: '2026-10-27', st: [1]}, pay: true}, 'a bad record is a fresh one');
  assert.deepEqual(R.replayPay(3000, 750), {coin: 900, dia: 150});
});

test('a failed run on a stage not cleared yet is topped up to 35% of the clear coins for the share of the goal it flew', () => {
  // stage 5: clear coins 750, goal 10. Five gates = half the goal: floor 131; the run's own 25 coins are topped up by 106
  assert.equal(R.failPay(750, 5, 10, 25, false), 106);
  assert.equal(R.failPay(750, 5, 10, 200, false), 0, 'a run that already earned the floor gets nothing more');
  assert.equal(R.failPay(750, 0, 10, 0, false), 0, 'no gate, no floor');
  assert.equal(R.failPay(1000, 19, 20, 0, false), 333, 'one gate short of STAGE 10\'s goal');
  assert.equal(R.failPay(1000, 25, 20, 0, false), 350, 'never past the goal');
  assert.equal(R.failPay(750, 5, 10, 0, true), 0, 'a stage cleared before pays no floor: past the replay cap a clear pays only its score coins, a fail must not beat it');
  assert.equal(R.failPay(750, 5, 0, 0, false), 0, 'a bad goal pays nothing');
  // never more than a clear: the floor stays below the first-clear coins a clear of the same stage adds on top of its run coins
  for (const [c, g] of [[550, 8], [1000, 20], [3000, 41]]) assert.ok(R.failPay(c, g - 1, g, 0, false) < c);
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
  assert.match(html, /const distCoin = inSt && !FX\.clearDone \? failPay\(clearCoinOf\(curStage\), gatesPassed, stGoal\(curStage\), fieldCoin \+ scoreCoin, stg\.clr\[curStage\]\) : 0;/, 'the floor: stage mode, a run that did not clear');
  assert.match(html, /W\.coins \+= fieldCoin \+ scoreCoin \+ distCoin;/);
  assert.match(html, /if \(distCoin\) cpill\('rwDist', distCoin\);/, 'the result card names it');
  assert.match(html, /adCoinBonus\(fieldCoin, scoreCoin\)/, 'coin x2 doubles the run income, not the floor');
});

test('every language names the new rewards', () => {
  const P = loadI18NParts();
  for (const [l, tb] of Object.entries(P.I18N)) for (const k of ['rwReplay', 'rwEvo', 'starFlaw', 'starScore', 'starNeed', 'rwDist']){
    assert.ok(tb[k] && tb[k].trim(), `${l} ${k}`);
    if (k === 'starNeed') assert.match(tb[k], /\{n\}/, `${l} starNeed`);
  }
  assert.equal(Object.keys(P.I18N).length, 23);
  for (const l of Object.keys(P.I18N)) if (l !== 'en') assert.notEqual(P.I18N[l].rwDist, P.I18N.en.rwDist, `${l} rwDist is translated`);
});
