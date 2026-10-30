// 사4-0 (owner decision 2026-10-30; docs/plans/2026-10-30-psych-advancement/04-judge-final.md "첫 30일" W0, 03-round2-explorer.md 새1):
// the launch-day funnel baselines ride on the EXISTING event kinds as more props. No new kind (the server allow-list checks kind only),
// no migration (props is any JSON object up to 1 KB), no new evTrack call site (the event count per run is unchanged, so the
// 60-an-hour cap for a fresh guest is untouched), nothing personal. tests/events.test.js covers the queue; this file pins the decision
// and the field semantics of run_end, session_start and daily_done.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex, loadHitLoop } from './helpers/hitloop.js';
import { loadEvents } from './helpers/events.js';

const html = readIndex(), E = loadEvents(), H = loadHitLoop();
const KINDS = ['first_open', 'session_start', 'session_end', 'tutorial_done', 'run_end', 'daily_done', 'shop_buy', 'ad_view', 'share', 'level_up'];
const RUN_NEW = ['goal', 'pct', 'clr', 'cont', 'cm', 'bhp', 'att', 'best0', 'dur', 'sn', 'plat', 'v'];
const BASE = Object.freeze({ plat: 'web', v: '' });
// as evTrack queues it: the run fields from evRunProps under the central evStamp (plat, v)
const run = (o = {}) => E.evStamp(BASE, E.evRunProps({ mode: 'endless', score: 12, gates: 37, stage: 1, bird: 'zero', goal: 100, clr: false, cont: '', bhp: -1, att: 1, best0: 0, dur: 42, sn: 1, ...o }));
const showOver = html.slice(html.indexOf('function showOver('), html.indexOf('function renderWallet(', html.indexOf('function showOver(')));

test('no new kind: EV_CFG.kinds is the 2026-10-30 list the server allow-list mirrors', () => {
  assert.deepEqual([...E.EV_CFG.kinds], KINDS);
  assert.equal(E.EV_V, '', 'the A/B variant slot is reserved, empty until 사5-lite');
});

test('no new call site: evTrack is called from exactly 13 places, as on 2026-10-30 (사4-0 enriches props, never adds an event)', () => {
  // 13 call sites + the definition = 14 matches of "evTrack(". A new call changes the event count per run: that needs its own owner decision.
  assert.equal(html.match(/evTrack\('/g).length, 13);
  assert.equal(html.match(/evTrack\(/g).length, 14);
});

test('nothing personal: no nick, mail, user id, device id, address or free text key in any call site or built props', () => {
  const FORBID = /\b(nick|nickname|email|mail|uid|user|userId|user_id|player|player_id|pid|device|deviceId|ip|ua|userAgent|name|token|phone|lat|lng|href|url|referrer|text|msg)\s*:/;
  const sites = [...html.matchAll(/evTrack\('[a-z_]+',\s*([^;]*)\);/g)];
  assert.equal(sites.length, 13);
  for (const m of sites) assert.ok(!FORBID.test(m[1]), m[0].slice(0, 160));
  const built = [run(), E.evStamp(BASE, { how: 'run' }), E.evStamp(BASE, null)];
  for (const p of built){ for (const k of Object.keys(p)) assert.ok(!FORBID.test(k + ':'), k); assert.ok(!JSON.stringify(p).includes('@')); }
  assert.ok(!/evSess = \(\) => \([^\n]*\b(nick|uid|email)\b/.test(html), 'session_start props are the level, the clears and the platform only');
});

test('evStamp: plat and v ride on every event; the call site may still override; null props become the base alone', () => {
  assert.deepEqual(E.evStamp(BASE, { how: 'run' }), { plat: 'web', v: '', how: 'run' });
  assert.deepEqual(E.evStamp(BASE, null), { plat: 'web', v: '' });
  assert.deepEqual(E.evStamp(BASE, { plat: 'ios' }), { plat: 'ios', v: '' });
  assert.deepEqual(E.evStamp(null, { a: 1 }), { a: 1 });
  assert.ok(html.includes("evSt = evAdd(evSt, kind, evStamp(EV_BASE, props))"), 'evTrack stamps centrally');
  assert.ok(html.includes("'first_open', EV_BASE)"), 'first_open carries the platform');
  assert.ok(html.includes('evHide(evSt, Date.now(), EV_BASE)'), 'session_end carries the platform');
});

test('evPlat: the Capacitor app is ios, the Android app (TWA: standalone display mode or an android-app:// referrer) is and, all else web', () => {
  assert.equal(E.evPlat({ native: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), 'ios');
  assert.equal(E.evPlat({ native: false, referrer: 'android-app://com.minimalkorea.swishby/', ua: 'Mozilla/5.0 (Linux; Android 14)' }), 'and');
  assert.equal(E.evPlat({ standalone: true, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile' }), 'and');
  assert.equal(E.evPlat({ standalone: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), 'web', 'a home-screen web app on iOS is not the Android app');
  assert.equal(E.evPlat({ standalone: false, referrer: 'https://swishby.com/', ua: 'Mozilla/5.0 (Linux; Android 14)' }), 'web');
  assert.equal(E.evPlat({}), 'web'); assert.equal(E.evPlat(null), 'web');
  assert.ok(html.includes("const EV_PLAT = evPlat({ native: NAT, referrer: document.referrer, standalone:"), 'built from the same signals as the Play link');
});

test('evRunProps: the old fields stay, the funnel fields join; stage mode fills goal/pct/clr, other modes zero them', () => {
  assert.deepEqual(run(), { plat: 'web', v: '', mode: 'endless', score: 12, gates: 37, stage: 1, bird: 'zero', goal: 100, pct: .37, clr: 0, cont: 0, cm: '', bhp: -1, att: 1, best0: 0, dur: 42, sn: 1 });
  for (const k of RUN_NEW) assert.ok(k in run(), k);
  assert.deepEqual(run({ mode: 'daily', stage: null, goal: 0, gates: 9 }), { ...run({ mode: 'daily', stage: null, goal: 0, gates: 9 }), goal: 0, pct: 0, clr: 0 });
  assert.equal(run({ gates: 100 }).pct, 1); assert.equal(run({ gates: 1, goal: 3 }).pct, .33); assert.equal(run({ gates: 2, goal: 3 }).pct, .67);
  assert.equal(run({ gates: 100, goal: 70, stage: 41 }).pct, 1.43, 'past the goal (a boss stage keeps counting) the ratio is kept, not clamped');
  assert.equal(run({ clr: true, gates: 100 }).clr, 1); assert.equal(run({ clr: false }).clr, 0);
  assert.equal(run({ mode: 'daily', goal: 0, clr: true }).clr, 0, 'a win is a stage win');
  assert.equal(run({ gates: -3 }).gates, 0); assert.equal(run({ dur: 41.6 }).dur, 42); assert.equal(run({ dur: -1 }).dur, 0);
  assert.equal(run({ att: 2.9 }).att, 2); assert.equal(run({ best0: 88 }).best0, 88); assert.equal(run({ sn: 7 }).sn, 7);
});

test('cont / cm: 0 never offered, 1 offered and declined or timed out, 2 taken (cm says by what)', () => {
  assert.deepEqual([run({ cont: '' }).cont, run({ cont: '' }).cm], [0, '']);
  assert.deepEqual([run({ cont: 'no' }).cont, run({ cont: 'no' }).cm], [1, '']);
  assert.deepEqual([run({ cont: 'coin' }).cont, run({ cont: 'coin' }).cm], [2, 'coin']);
  assert.deepEqual([run({ cont: 'ad' }).cont, run({ cont: 'ad' }).cm], [2, 'ad']);
  assert.deepEqual([run({ cont: 'x' }).cont, run({ cont: 'x' }).cm], [0, ''], 'anything else reads as never offered');
  assert.ok(/function openCont\(\)\{\n\s*state = 'cont'; contSeen = 'no';/.test(html), 'the card opening marks the offer');
  assert.ok(html.includes("W.coins -= CONT_COST; saveW(); renderWallet(); contSeen = 'coin'; closeCont(true);"), 'the coin continue');
  assert.ok(html.includes("if (r === 'granted'){ FX.adSeen = true; contSeen = 'ad'; closeCont(true); return; }"), 'the ad continue');
  assert.ok(html.includes("contUsed = false; contSeen = ''; runAt = Date.now();"), 'reset() clears it for the next run and stamps the run start');
});

test('evBhp: the boss HP left as a 0..100 integer, -1 without a boss', () => {
  assert.equal(E.evBhp(40, 80), 50); assert.equal(E.evBhp(0, 80), 0); assert.equal(E.evBhp(80, 80), 100);
  assert.equal(E.evBhp(1, 300), 0); assert.equal(E.evBhp(299, 300), 100);
  assert.equal(E.evBhp(-5, 100), 0); assert.equal(E.evBhp(999, 100), 100, 'clamped');
  assert.equal(E.evBhp(null, 0), -1); assert.equal(E.evBhp(10, 0), -1); assert.equal(E.evBhp(undefined, undefined), -1);
  assert.ok(showOver.includes('bhp: boss ? evBhp(boss.hp, boss.max) : inSt && STAGES[curStage].boss && FX.clearDone ? 0 : -1'), 'a boss alive at the end: its HP; a boss stage won: 0 (the boss is gone); otherwise -1');
});

test('evAtt: a per-stage attempt counter on this device, bumped once per run_end, never mutating, garbage starts over', () => {
  const r0 = Object.freeze({ 0: 4 });
  assert.deepEqual(E.evAtt(null, 3), { 3: 1 }); assert.deepEqual(E.evAtt(r0, 0), { 0: 5 }); assert.deepEqual(E.evAtt(r0, 2), { 0: 4, 2: 1 });
  assert.deepEqual(r0, { 0: 4 }, 'the record given is untouched');
  assert.deepEqual(E.evAtt([1, 2], 1), { 1: 1 }); assert.deepEqual(E.evAtt({ 0: 'x' }, 0), { 0: 1 }); assert.deepEqual(E.evAtt({ 0: 1e9 }, 0), { 0: 1e6 });
  assert.ok(showOver.includes("const attRec = inSt ? evAtt(store.get('fw27_att', null), curStage) : null; if (attRec) store.set('fw27_att', attRec);"), 'bumped at the run end (a run that never reaches the result card is not an attempt the data sees)');
  const local = html.slice(html.indexOf('const FS_LOCAL'), html.indexOf(']);', html.indexOf('const FS_LOCAL')));
  assert.ok(local.includes("'fw27_att'"), 'device-only: never in the cloud save');
});

test('showOver: best0 is read before the stage best is raised, run_end goes through evRunProps with the live values, sn counts runs in the session', () => {
  const b0 = showOver.indexOf("const best0 = mode === 'endless' ? stg.gates[curStage] : 0;"), mx = showOver.indexOf('stg.gates[curStage] = Math.max(stg.gates[curStage], gatesPassed)');
  assert.ok(b0 >= 0 && mx > b0, 'best0 first, then the max');
  assert.ok(showOver.includes("evTrack('run_end', evRunProps({ mode, score, gates: gatesPassed, stage: inSt ? curStage + 1 : null, bird: B.id, goal: inSt ? stGoal(curStage) : 0, clr: inSt && FX.clearDone, cont: contSeen,"), 'the old five fields, then the funnel ones');
  assert.ok(showOver.includes("att: attRec ? attRec[curStage] : 0, best0, dur: (Date.now() - runAt) / 1000, sn: ++evRun }))"), 'dur is the wall clock since startGame; sn the run ordinal in the session');
  assert.ok(html.includes("if (evSt.sid !== was) evRun = 0;"), 'a new session (evShow after idleMs) restarts the run ordinal');
});

test('session_start: lvl, clr_n, plat, v — at boot and on every new session; evShow still queues null props when given none', () => {
  let st = E.evHide(E.evNew('a'.repeat(16), 0), 1000, BASE);
  assert.deepEqual(st.q.at(-1), { k: 'session_end', s: 'a'.repeat(16), p: { plat: 'web', v: '', dur: 1 } });
  const props = { plat: 'web', v: '', lvl: 7, clr_n: 3 };
  const back = E.evShow(st, 1000 + E.EV_CFG.idleMs, 'b'.repeat(16), props);
  assert.deepEqual(back.q.at(-1), { k: 'session_start', s: 'b'.repeat(16), p: props });
  assert.deepEqual(E.evShow(st, 1000 + E.EV_CFG.idleMs, 'c'.repeat(16)).q.at(-1).p, null, 'the three-argument call keeps its shape');
  assert.equal(E.evShow(st, 1000 + 5000, 'd'.repeat(16), props).q.length, st.q.length, 'a short absence adds nothing');
  assert.ok(html.includes("const evSess = () => ({ ...EV_BASE, lvl: W.lvl, clr_n: stg.clr.reduce((a, b) => a + b, 0) });"), 'the level and the cleared stage count, nothing else');
  assert.ok(html.includes("'session_start', evSess()), evLast"), 'at boot');
  assert.ok(html.includes("evShow(evSt, Date.now(), evSid(Math.random), evSess())"), 'on a new session');
});

test('daily_done: stk (the streak after today) and gap (UTC days since the last daily, 0 when first ever) — gap uses the dailyStreakNext arithmetic', () => {
  const today = '2026-10-30', at = d => `2026-10-${String(d).padStart(2, '0')}`;
  assert.equal(H.dailyGap(null, today), 0, 'first ever');
  assert.equal(H.dailyGap({ last: '', streak: 0 }, today), 0); assert.equal(H.dailyGap({ last: 'yesterday', streak: 2 }, today), 0, 'a bad record is a first');
  assert.equal(H.dailyGap({ last: today, streak: 2 }, today), 0, 'the same UTC day');
  for (const gap of [1, 2, 3, 4, 9]){
    const rec = { last: at(30 - gap), streak: 5 };
    assert.equal(H.dailyGap(rec, today), gap);
    assert.equal(H.dailyStreakNext(rec, today).streak, gap <= 2 ? 6 : 1, `gap ${gap}: one missed day forgiven, two reset`);
  }
  assert.equal(H.dailyGap({ last: '2026-11-02', streak: 1 }, today), 0, 'a clock set back never goes negative');
  assert.ok(html.includes("evTrack('daily_done', { score, streak: dStreak, stk: dStreak, gap: dGap })"));
  assert.ok(showOver.includes('dGap = dailyGap(rec, runDay);'), 'from the record before this run updated it');
});

test('size: the largest realistic run_end stays far under the 1 KB cap (the server renders jsonb with spaces: 2 more bytes a key)', () => {
  const big = E.evStamp(BASE, E.evRunProps({ mode: 'endless', score: 999999, gates: 400, stage: 50, bird: 'abcdefghijkl', goal: 100, clr: true, cont: 'coin', bhp: 100, att: 999999, best0: 400, dur: 99999, sn: 999 }));
  const n = JSON.stringify(big).length;
  assert.ok(n < 400, `run_end is ${n} bytes`);
  assert.ok(n + 2 * Object.keys(big).length < E.EV_CFG.propsMax / 2);
  assert.equal(E.evOk('run_end', big), true);
  assert.ok(Object.values(big).every(v => typeof v === 'number' || (typeof v === 'string' && v.length <= 12) || v === null), 'flat: numbers and short strings only');
});
