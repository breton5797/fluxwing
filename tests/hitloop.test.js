import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadHitLoop, readIndex } from './helpers/hitloop.js';

const {
  SHARE_URL, ROOKIE, DAILY_REWARD, rookieRun, rookieGate, deathHint, shareUrl, shareMsg, readChallenge, challengeResult, dayIndex, dailyStreakNext, dailyReward,
} = loadHitLoop();
const DAY = '2026-10-13';
const T = {
  share: 'I scored {n} in SWISHBY. Can you beat me?',
  shareDaily: 'SWISHBY Daily {d}: {n} pts, {g} gates, combo x{c}. Same course worldwide. Can you beat me?',
};

test('the easing is for the first stage-1 runs only, never for a course everybody shares', () => {
  assert.equal(rookieRun('endless', 0, 0), true);
  assert.equal(rookieRun('endless', 0, ROOKIE.runs - 1), true);
  assert.equal(rookieRun('endless', 0, ROOKIE.runs), false);
  assert.equal(rookieRun('endless', 1, 0), false);
  assert.equal(rookieRun('daily', 0, 0), false);
  assert.equal(rookieRun('versus', 0, 0), false);
});

test('the first gates are wider and nearer the start height, then the course is the normal one', () => {
  const eased = Array.from({ length: ROOKIE.gates }, (_, i) => rookieGate(i, true));
  for (let i = 0; i < eased.length; i++) {
    assert.ok(eased[i].gap > 0 && eased[i].pull > 0 && eased[i].pull < 1, `gate ${i}`);
    if (i) assert.ok(eased[i].gap < eased[i - 1].gap && eased[i].pull > eased[i - 1].pull, `gate ${i} is harder than gate ${i - 1}`);
  }
  assert.deepEqual(rookieGate(ROOKIE.gates, true), { gap: 0, pull: 1 });
  assert.deepEqual(rookieGate(40, true), { gap: 0, pull: 1 });
  for (let i = 0; i < 6; i++) assert.deepEqual(rookieGate(i, false), { gap: 0, pull: 1 });
  assert.equal(ROOKIE.gap.length, ROOKIE.gates);
  assert.equal(ROOKIE.pull.length, ROOKIE.gates);
  assert.ok(ROOKIE.bounces > 0);
});

test('a death is told by its cause', () => {
  assert.equal(deathHint('ground', 0), 'whyGround0');
  assert.equal(deathHint('ground', 4), 'whyGround');
  assert.equal(deathHint('top', 0), 'whyTop');
  assert.equal(deathHint('bot', 9), 'whyBot');
  assert.equal(deathHint('', 3), 'whyGate');
  assert.equal(deathHint(undefined, 0), 'whyGate');
  assert.deepEqual(['branch', 'wind', 'geyser', 'blade'].map(w => deathHint(w, 5)), ['whyBranch', 'whyWind', 'whyGeyser', 'whyBlade'], 'each zone obstacle has its own hint');
});

test('every death hint has a Korean and an English line', () => {
  const html = readIndex();
  for (const key of ['whyGround0', 'whyGround', 'whyTop', 'whyBot', 'whyGate']) {
    assert.equal((html.match(new RegExp(`\\b${key}:'`, 'g')) || []).length >= 2, true, key);
  }
});

test('the zone obstacles\' hints and names are in all 23 languages, each its own words', async () => {
  const { loadI18NParts } = await import('./helpers/i18n.js');
  const P = loadI18NParts(), I = P.I18N, keys = ['whyBranch', 'whyWind', 'whyGeyser', 'whyBlade', 'sg_branch', 'sg_gust', 'sg_geyser', 'sg_blade'];
  assert.equal(Object.keys(I).length, 23);
  for (const l of Object.keys(I)) for (const k of keys) assert.ok(typeof I[l][k] === 'string' && I[l][k].trim(), `${l}.${k}`);
  for (const l of Object.keys(P.I18N_W)) for (const k of keys) assert.ok(P.I18N_W[l][k], `world table ${l} has ${k} itself`);
  for (const l of Object.keys(I).filter(l => l !== 'en')) assert.ok(keys.filter(k => I[l][k] === I.en[k]).length <= 1, l + ' is translated');
});

test('a share line carries the score and a link back to the game', () => {
  const run = { mode: 'endless', score: 42, gates: 17, combo: 6, day: DAY };
  assert.equal(shareMsg(T, run), `I scored 42 in SWISHBY. Can you beat me? ${SHARE_URL}?c=42`);
  assert.equal(SHARE_URL, 'https://swishby.com/');
});

test('a daily share line names the day and links to that day\'s challenge', () => {
  const text = shareMsg(T, { mode: 'daily', score: 42, gates: 17, combo: 6, day: DAY });
  assert.ok(text.startsWith(`SWISHBY Daily ${DAY}: 42 pts, 17 gates, combo x6.`));
  assert.ok(text.endsWith(`${SHARE_URL}?d=${DAY}&c=42`));
  assert.ok(!/[{}]/.test(text));
  assert.equal(shareUrl({ mode: 'daily', score: 0, day: DAY }), `${SHARE_URL}?d=${DAY}`);
  assert.equal(shareUrl({ mode: 'endless', score: 0, day: DAY }), SHARE_URL);
});

test('runtime share calls use the live I18N table, not the test-only T fixture', () => {
  const html = readIndex();
  assert.equal(html.includes('shareMsg(T[lang]'), false);
  assert.equal(html.includes('shareMsg(I18N[lang]'), true);
});

test('a challenge link is read back, and anything else is refused', () => {
  assert.deepEqual(readChallenge('?c=42', DAY), { score: 42, day: '', daily: false, live: true });
  assert.deepEqual(readChallenge(`?d=${DAY}&c=42`, DAY), { score: 42, day: DAY, daily: true, live: true });
  assert.deepEqual(readChallenge('?d=2026-10-12&c=42', DAY), { score: 42, day: '2026-10-12', daily: true, live: false });
  const round = { mode: 'daily', score: 311, gates: 90, combo: 12, day: DAY };
  assert.deepEqual(readChallenge(new URL(shareUrl(round)).search, DAY), { score: 311, day: DAY, daily: true, live: true });
  for (const junk of ['', '?c=', '?c=0', '?c=-4', '?c=4.5', '?c=1e9', '?c=99999999', '?c=<b>1</b>', '?c=42&d=today', '?c=42&d=2026-13-40x', '?d=2026-10-13', '?shop=abc']) {
    assert.equal(readChallenge(junk, DAY), null, junk);
  }
});

test('a result is measured against the challenge it answers', () => {
  const daily = { score: 42, day: DAY, daily: true, live: true }, open = { score: 42, day: '', daily: false, live: true };
  assert.deepEqual(challengeResult(daily, 'daily', 50), { beat: true, by: 8 });
  assert.deepEqual(challengeResult(daily, 'daily', 42), { beat: false, by: 0 });
  assert.deepEqual(challengeResult(daily, 'daily', 30), { beat: false, by: 12 });
  assert.equal(challengeResult(daily, 'endless', 50), null);
  assert.equal(challengeResult({ ...daily, live: false }, 'daily', 50), null);
  assert.deepEqual(challengeResult(open, 'endless', 43), { beat: true, by: 1 });
  assert.equal(challengeResult(open, 'daily', 43), null);
  assert.equal(challengeResult(open, 'versus', 43), null);
  assert.equal(challengeResult(null, 'endless', 43), null);
});

test('daily streak advances once per UTC day and resets after a missed day', () => {
  assert.equal(dayIndex('2026-10-13') + 1, dayIndex('2026-10-14'));
  assert.deepEqual(dailyStreakNext(null, '2026-10-13'), { last: '2026-10-13', streak: 1, claimed: false });
  assert.deepEqual(dailyStreakNext({ last: '2026-10-13', streak: 1 }, '2026-10-13'), { last: '2026-10-13', streak: 1, claimed: true });
  assert.deepEqual(dailyStreakNext({ last: '2026-10-13', streak: 1 }, '2026-10-14'), { last: '2026-10-14', streak: 2, claimed: false });
  assert.deepEqual(dailyStreakNext({ last: '2026-10-13', streak: 4 }, '2026-10-15'), { last: '2026-10-15', streak: 1, claimed: false });
  assert.deepEqual(dailyStreakNext({ last: 'bad-date', streak: 99 }, '2026-10-13'), { last: '2026-10-13', streak: 1, claimed: false });
});

test('daily reward gives a meaningful return reason without changing competitive fairness', () => {
  assert.deepEqual(DAILY_REWARD, { coin: 300, dia: 100, gem: 1, streakCoin: 50, cap: 7, bonus3: 1, bonus7: 3 });
  assert.deepEqual(dailyReward(1), { coin: 350, dia: 100, gem: 1 });
  assert.deepEqual(dailyReward(2), { coin: 400, dia: 100, gem: 1 });
  assert.deepEqual(dailyReward(3), { coin: 450, dia: 100, gem: 2 });
  assert.deepEqual(dailyReward(7), { coin: 650, dia: 100, gem: 4 });
  assert.deepEqual(dailyReward(30), { coin: 650, dia: 100, gem: 4 });
});

test('using the dash grants half a second of invincibility', () => {
  const html = readIndex();
  const m = html.match(/function dash\(\)\{[\s\S]*?\n\}/);
  assert.ok(m, 'dash() found');
  assert.match(m[0], /invuln = Math\.max\(invuln, \.5\)/);
});

test('a ranked match cannot be paused: keys and the button do nothing, leaving the tab is a death', () => {
  const { vsPauseAction } = loadHitLoop();
  assert.equal(vsPauseAction('endless', 'play', 'key'), 'pause');
  assert.equal(vsPauseAction('daily', 'play', 'hidden'), 'pause');
  assert.equal(vsPauseAction('versus', 'play', 'key'), 'ignore');
  assert.equal(vsPauseAction('versus', 'play', 'button'), 'ignore');
  assert.equal(vsPauseAction('versus', 'play', 'hidden'), 'die');
  assert.equal(vsPauseAction('versus', 'paused', 'key'), 'ignore');
  assert.equal(vsPauseAction('versus', 'over', 'hidden'), 'ignore');
});

test('the tutorial ends only after the DASH tip or three runs; an old save stays done', () => {
  const { tutDone, TUT_MAX_RUNS } = loadHitLoop();
  assert.equal(tutDone(1, 0, 0), true);
  assert.equal(tutDone(0, 2, 1), false);   // died after 3 flaps: not done yet
  assert.equal(tutDone(0, 3, 1), true);
  assert.equal(tutDone(0, 1, TUT_MAX_RUNS), true);
  assert.equal(tutDone(0, 1, TUT_MAX_RUNS - 1), false);
});

test('a hidden unit on a board is ??? for players who do not own it', () => {
  const { boardUnit } = loadHitLoop();
  const aurora = { id: 'aurora', name: 'AURORA', hidden: true, col: [160, 90, 58] };
  assert.deepEqual(boardUnit(aurora, () => false), { name: '???', col: [260, 20, 45] });
  assert.deepEqual(boardUnit(aurora, id => id === 'aurora'), { name: 'AURORA', col: [160, 90, 58] });
  assert.deepEqual(boardUnit({ id: 'volt', name: 'VOLT', col: [1, 2, 3], uiCol: [4, 5, 6] }, () => false), { name: 'VOLT', col: [4, 5, 6] });
  assert.equal(boardUnit(undefined, () => true), null);
});

test('a daily run that crossed UTC midnight still posts to yesterday, unless today is already posted', () => {
  const { prevDay, dailyKeyOk } = loadHitLoop();
  assert.equal(prevDay('2026-11-01'), '2026-10-31'); assert.equal(prevDay('2026-03-01'), '2026-02-28');
  assert.equal(dailyKeyOk('2026-10-25', '2026-10-25', ''), true);
  assert.equal(dailyKeyOk('2026-10-24', '2026-10-25', ''), true);
  assert.equal(dailyKeyOk('2026-10-24', '2026-10-25', '2026-10-24'), true);
  assert.equal(dailyKeyOk('2026-10-24', '2026-10-25', '2026-10-25'), false);   // today already on the board: never regress
  assert.equal(dailyKeyOk('2026-10-23', '2026-10-25', ''), false);
  assert.equal(dailyKeyOk('2026-10-26', '2026-10-25', ''), false);
});

test('audio resumes after an iOS interruption as well as a suspend', () => {
  const { audioResumeOn } = loadHitLoop();
  for (const s of ['suspended', 'interrupted']) assert.equal(audioResumeOn(s), true, s);
  for (const s of ['running', 'closed', undefined]) assert.equal(audioResumeOn(s), false, String(s));
});

test('a corrupted owned list boots with the starters instead of a TypeError', () => {
  const { ownedBoot } = loadHitLoop();
  const S = ['volt', 'blitz', 'nimbus', 'titan'];
  for (const bad of [null, 'volt', 7, {}, { length: 2 }]) assert.deepEqual(ownedBoot(bad).sort(), [...S].sort(), String(bad));
  assert.deepEqual(ownedBoot(['mochi', 3, '__proto__', 'BAD', 'volt']).sort(), [...S, 'mochi'].sort());
});

test('zone values ramp over six gates instead of jumping at the zone line', () => {
  const { zoneMix } = loadHitLoop();
  const MV = [.16, .42, .2, .36];
  assert.equal(zoneMix(MV, 0), .16); assert.equal(zoneMix(MV, 11), .16); assert.equal(zoneMix(MV, 12), .16);
  assert.ok(Math.abs(zoneMix(MV, 15) - .29) < 1e-9); assert.equal(zoneMix(MV, 18), .42); assert.equal(zoneMix(MV, 23), .42);
  assert.ok(Math.abs(zoneMix(MV, 27) - .31) < 1e-9); assert.equal(zoneMix(MV, 60), .36);
});

test('the first stall of a run costs the combo only; later stalls also strip the buffs', () => {
  const { STALL, stallPenalty } = loadHitLoop();
  assert.deepEqual(STALL, { warn: .6, at: 2 });
  assert.deepEqual(stallPenalty(0), { combo: true, buffs: false });
  assert.deepEqual(stallPenalty(1), { combo: true, buffs: true });
});

test('score coins settle every 10 points so a 49-point run is not worth zero', () => {
  const html = readIndex();
  const f = new Function(`const INCOME_X = 5, ST_SCOIN = [30,40,55,67]; ${html.match(/const scoreCoins = [^\n]+/)[0]}\nreturn scoreCoins;`)();
  assert.deepEqual([0, 9, 10, 49, 50, 99, 100, 275].map(s => f(s, 0)), [0, 0, 30, 120, 150, 270, 300, 810]);
  assert.deepEqual([1, 2, 3].map(tr => f(120, tr)), [480, 660, 804]);
  for (let sc = 0; sc < 400; sc += 7) for (let tr = 0; tr < 4; tr++) assert.ok(Number.isInteger(f(sc, tr)), `${sc}/${tr} is whole coins`);
  assert.equal(Number(html.match(/const DIA_LEVEL = (\d+)/)[1]), 250);
});

test('the daily intro card shows once', () => {
  const { dailyIntroDue } = loadHitLoop();
  assert.equal(dailyIntroDue(0), true); assert.equal(dailyIntroDue(1), false);
});

test('the no-payment shop stub only works on localhost', () => {
  const { shopStubAllowed } = loadHitLoop();
  assert.equal(shopStubAllowed('localhost', true), true);
  assert.equal(shopStubAllowed('127.0.0.1', true), true);
  assert.equal(shopStubAllowed('swishby.com', true), false);
  assert.equal(shopStubAllowed('localhost', false), false);
});
