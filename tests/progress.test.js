import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BOARD_SIZE, MISSIONS, SKINS } from '../src/config.js';
import {
  activeSkin, applyRun, buySkin, defaultSave, ensureToday, missionText, normalizeSave, pickMissions,
  runShards, shareText, spend, withSetting,
} from '../src/progress.js';

const DAY = '2026-10-06';
const today = pickMissions(DAY);
const runOf = (over = {}) => ({
  mode: 'classic', score: 0, gates: 0, perfects: 0, maxCombo: 0, orbs: 0, dashGates: 0, droneKills: 0, ...over,
});
const deepFreeze = o => {
  Object.values(o).forEach(v => { if (typeof v === 'object' && v !== null) deepFreeze(v); });
  return Object.freeze(o);
};

test('normalizeSave turns garbage into a default save', () => {
  for (const junk of [null, undefined, 42, 'x', [], { shards: -5, best: 'NaN', owned: 'all', board: {}, daily: 7 }]) {
    const s = normalizeSave(junk);
    assert.deepEqual(s, defaultSave());
  }
});

test('normalizeSave keeps valid data and strips what it does not recognise', () => {
  const s = normalizeSave({
    shards: 120.9, best: 44, skin: 'mint', owned: ['mint', 'nope', 'mint'], tutorialDone: true,
    daily: { date: DAY, best: 9, tries: 2 },
    stats: { runs: 3, gates: 50, hacked: 1 },
    settings: { sfx: false, music: 'yes' },
    board: [{ score: 5, date: DAY }, { score: 99, date: DAY }, { score: 'x', date: DAY }, { score: 7, date: 'soon' }],
    missions: { date: DAY, items: [{ id: today[0].id, goal: 1, reward: 9999, progress: 3, done: true }, { id: 'bogus' }, 7] },
  });
  assert.equal(s.shards, 120);
  assert.equal(s.skin, 'mint');
  assert.deepEqual(s.owned, ['flux', 'mint']);
  assert.deepEqual(s.daily, { date: DAY, best: 9, tries: 2 });
  assert.equal(s.stats.gates, 50);
  assert.equal('hacked' in s.stats, false);
  assert.deepEqual(s.settings, { sfx: false, music: true, haptic: true });
  assert.deepEqual(s.board.map(e => e.score), [99, 5]);
  assert.equal(s.tutorialDone, true);
  // goals and rewards are re-derived from the date; only progress is trusted
  assert.deepEqual(s.missions.items, [{ ...today[0], progress: 3, done: false }, today[1], today[2]]);
});

test('a tampered or truncated mission list is rebuilt for its date', () => {
  for (const items of [[], [{ id: 'gates' }, { id: 'gates' }], [{ id: today[1].id, progress: 1e9 }]]) {
    const m = normalizeSave({ missions: { date: DAY, items } }).missions;
    assert.deepEqual(m.items.map(i => [i.id, i.goal, i.reward]), today.map(i => [i.id, i.goal, i.reward]));
    assert.ok(m.items.every(i => i.progress <= i.goal && i.done === (i.progress >= i.goal)));
  }
  assert.deepEqual(normalizeSave({ missions: { date: 'nope', items: [] } }).missions, { date: '', items: [] });
});

test('an unowned skin selection falls back to the default', () => {
  assert.equal(normalizeSave({ skin: 'prism', owned: ['flux'] }).skin, 'flux');
  assert.equal(activeSkin({ skin: 'missing' }).id, 'flux');
});

test('daily missions are three distinct, date-seeded goals', () => {
  const a = pickMissions(DAY);
  assert.deepEqual(a, pickMissions(DAY));
  assert.equal(a.length, 3);
  assert.equal(new Set(a.map(m => m.id)).size, 3);
  for (const m of a) {
    const def = MISSIONS.find(d => d.id === m.id);
    assert.ok(def.goals.includes(m.goal));
    assert.ok(m.reward >= 20 && m.reward <= 40);
    assert.ok(missionText(m).includes(String(m.goal)));
  }
  const days = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(pickMissions(`2026-11-${String(i + 1).padStart(2, '0')}`))));
  assert.ok(days.size > 10, 'missions vary from day to day');
});

test('ensureToday rolls missions and the daily record over at a new date', () => {
  const day1 = ensureToday(defaultSave(), DAY);
  assert.equal(day1.missions.date, DAY);
  assert.equal(day1.missions.items.length, 3);
  assert.equal(ensureToday(day1, DAY).missions, day1.missions);
  const played = { ...day1, daily: { date: DAY, best: 30, tries: 4 } };
  const day2 = ensureToday(played, '2026-10-07');
  assert.deepEqual(day2.daily, { date: '2026-10-07', best: 0, tries: 0 });
  assert.equal(day2.missions.date, '2026-10-07');
});

test('a run pays out shards for orbs and score', () => {
  assert.equal(runShards(runOf({ orbs: 12, score: 47 })), 16);
  const base = { ...defaultSave(), missions: { date: DAY, items: [] } };
  const { save, earned, newBest, completed } = applyRun(base, runOf({ orbs: 12, score: 47, gates: 30, maxCombo: 3 }), DAY);
  assert.equal(earned, 16);
  assert.equal(save.shards, 16);
  assert.equal(save.best, 47);
  assert.equal(newBest, true);
  assert.deepEqual(completed, []);
  assert.deepEqual({ runs: save.stats.runs, gates: save.stats.gates, maxCombo: save.stats.maxCombo }, { runs: 1, gates: 30, maxCombo: 3 });
});

test('sum missions accumulate across runs, max missions need one good run', () => {
  const items = [
    { id: 'gates', goal: 40, reward: 20, progress: 0, done: false },
    { id: 'combo', goal: 4, reward: 30, progress: 0, done: false },
  ];
  const start = { ...defaultSave(), missions: { date: DAY, items } };
  const r1 = applyRun(start, runOf({ gates: 25, maxCombo: 3 }), DAY);
  assert.deepEqual(r1.save.missions.items.map(i => i.progress), [25, 3]);
  assert.deepEqual(r1.completed, []);
  const r2 = applyRun(r1.save, runOf({ gates: 25, maxCombo: 2 }), DAY);
  assert.deepEqual(r2.save.missions.items.map(i => [i.progress, i.done]), [[40, true], [3, false]]);
  assert.deepEqual(r2.completed.map(i => i.id), ['gates']);
  assert.equal(r2.earned, 20);
  const r3 = applyRun(r2.save, runOf({ gates: 50, maxCombo: 5 }), DAY);
  assert.deepEqual(r3.completed.map(i => i.id), ['combo'], 'a finished mission never pays twice');
  assert.equal(r3.earned, 30);
});

test('the leaderboard keeps only the top scores, sorted', () => {
  let save = defaultSave();
  for (const score of [5, 40, 12, 90, 33, 8, 61]) save = applyRun(save, runOf({ score }), DAY).save;
  assert.equal(save.board.length, BOARD_SIZE);
  assert.deepEqual(save.board.map(e => e.score), [90, 61, 40, 33, 12]);
  assert.equal(save.best, 90);
});

test('daily runs track their own best and never touch the classic record', () => {
  const classic = applyRun(defaultSave(), runOf({ score: 20 }), DAY).save;
  const r = applyRun(classic, runOf({ mode: 'daily', score: 55 }), DAY);
  assert.equal(r.newBest, true);
  assert.equal(r.save.best, 20);
  assert.deepEqual(r.save.daily, { date: DAY, best: 55, tries: 1 });
  assert.equal(r.save.board.length, 1);
  const worse = applyRun(r.save, runOf({ mode: 'daily', score: 10 }), DAY);
  assert.equal(worse.newBest, false);
  assert.deepEqual(worse.save.daily, { date: DAY, best: 55, tries: 2 });
});

test('skins: buying costs shards once, then re-selecting is free', () => {
  const mint = SKINS.find(s => s.id === 'mint');
  const poor = buySkin(defaultSave(), 'mint');
  assert.deepEqual([poor.ok, poor.reason], [false, 'shards']);
  assert.equal(buySkin(defaultSave(), 'nope').reason, 'unknown');
  const rich = { ...defaultSave(), shards: mint.cost + 5 };
  const bought = buySkin(rich, 'mint');
  assert.equal(bought.ok, true);
  assert.deepEqual([bought.save.shards, bought.save.skin, bought.save.owned], [5, 'mint', ['flux', 'mint']]);
  const back = buySkin(bought.save, 'flux');
  assert.deepEqual([back.save.shards, back.save.skin], [5, 'flux']);
  assert.equal(buySkin(back.save, 'mint').save.shards, 5);
  assert.equal(activeSkin(bought.save).id, 'mint');
});

test('spend and withSetting', () => {
  assert.equal(spend(defaultSave(), 1), null);
  assert.equal(spend({ ...defaultSave(), shards: 30 }, 30).shards, 0);
  assert.equal(withSetting(defaultSave(), 'music', false).settings.music, false);
});

test('nothing in the progress module mutates its input', () => {
  const save = deepFreeze(ensureToday({ ...defaultSave(), shards: 1000 }, DAY));
  const run = deepFreeze(runOf({ score: 200, gates: 100, perfects: 30, maxCombo: 9, orbs: 150, dashGates: 12, droneKills: 6 }));
  assert.doesNotThrow(() => {
    applyRun(save, run, DAY);
    applyRun(save, { ...run, mode: 'daily' }, '2026-10-07');
    buySkin(save, 'prism');
    spend(save, 10);
    withSetting(save, 'sfx', false);
    normalizeSave(save);
  });
});

test('share text reads like a result card', () => {
  const classic = shareText(runOf({ score: 87, gates: 41, perfects: 12, maxCombo: 7 }), DAY);
  assert.equal(classic.split('\n')[0], 'FLUX WING 2');
  assert.ok(classic.includes('87점') && classic.includes('RANK A') && classic.includes('x7'));
  assert.ok(shareText(runOf({ mode: 'daily' }), DAY).startsWith(`FLUX WING 2 · DAILY ${DAY}`));
});
