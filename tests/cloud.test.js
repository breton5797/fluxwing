import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadCloud } from './helpers/cloud.js';

const C = loadCloud(), html = readIndex();
const S = o => C.fsNorm({ v: 1, ...o });
const getOf = m => (k, d) => (Object.hasOwn(m, k) ? m[k] : d);
const UID = '11111111-1111-4111-8111-111111111111', OTHER = '22222222-2222-4222-8222-222222222222';

test('every fw27_ key index.html stores is classified as synced or device-only', () => {
  const keys = new Set([...html.matchAll(/store\.(?:get|set)\('(fw27_[a-z0-9_]+)/g)].map(m => m[1]));
  const local = k => C.FS_LOCAL.some(p => p.endsWith('_') ? k.startsWith(p) : k === p);
  for (const k of keys) assert.ok(C.FS_KEYS.includes(k) || local(k), `classify ${k} in FS_KEYS or FS_LOCAL`);
  for (const k of C.FS_KEYS) assert.ok(keys.has(k), `${k} is in FS_KEYS but index.html never stores it`);
  assert.equal(C.FS_KEYS.filter(k => local(k)).length, 0);
});

test('FS_CFG.stN follows ST_N', () => {
  assert.equal(C.FS_CFG.stN, Number(html.match(/const ST_N = (\d+)/)[1]));
});

test('fsNorm refuses non-objects and other versions, clamps the rest', () => {
  for (const raw of [null, 7, 'x', [], { v: 2 }, { v: '1' }]) assert.equal(C.fsNorm(raw), null);
  const s = C.fsNorm({ v: 1, w: { coins: 1e30, xp: 500, lvl: -3, dia: 'x', gems: 2.7 }, owned: ['zero', 'BAD', '__proto__', 7, 'zero'],
    best: -5, stg: { gates: [3, 'x'], clr: [5], open: 999 }, nick: 'x'.repeat(40), bird: '<b>', ds: { last: 'nope', streak: 3 }, vsg: ['202610:' + UID, 'junk'] });
  assert.deepEqual(s.w, { xp: 99, lvl: 1, coins: 5e7, dia: 0, gems: 2 });
  assert.deepEqual(s.owned, ['blitz', 'nimbus', 'titan', 'volt', 'zero']);   // starters always kept, sorted, unique
  assert.equal(s.best, 0); assert.equal(s.stg.gates.length, 50); assert.equal(s.stg.gates[0], 3); assert.equal(s.stg.clr[0], 1);
  assert.equal(s.stg.open, 49); assert.equal(s.nick.length, 14); assert.equal(s.bird, 'volt'); assert.equal(s.ds, null);
  assert.deepEqual(s.vsg, ['202610:' + UID]);
});

test('fsSnap reads the game keys with the game defaults; fsWrites writes every synced key once and keeps pending claims', () => {
  const fresh = C.fsSnap(getOf({}));
  assert.ok(C.fsEmpty(fresh));
  const m = { fw27_wallet2: { coins: 500, lvl: 3, xp: 40, dia: 2, gems: 1 }, fw27_owned: ['volt', 'zero'], fw27_best: 88, fw27_bestg: 30,
    fw27_vsclaim: { g: ['202609:' + UID], p: { k: 1 } } };
  const s = C.fsSnap(getOf(m));
  assert.equal(s.w.coins, 500); assert.ok(s.owned.includes('zero')); assert.equal(s.best, 88); assert.deepEqual(s.vsg, ['202609:' + UID]);
  assert.equal(C.fsEmpty(s), false);
  const w = C.fsWrites(s, getOf(m));
  assert.deepEqual(w.map(x => x[0]).sort(), [...C.FS_KEYS].sort());
  assert.deepEqual(Object.fromEntries(w).fw27_vsclaim, { g: ['202609:' + UID], p: { k: 1 } });
  assert.ok(C.fsSame(C.fsSnap(getOf(Object.fromEntries(w))), s));   // round trip
});

test('three-way merge: currencies add what each side earned or spent since the base', () => {
  const b = S({ w: { coins: 100, gems: 10, lvl: 2, xp: 50 } });
  const l = S({ w: { coins: 150, gems: 10, lvl: 2, xp: 90 } });            // +50 coins, +40 xp here
  const r = S({ w: { coins: 80, gems: 15, lvl: 3, xp: 10 } });             // -20 coins, +5 gems, +60 xp there
  const m = C.fsMerge(l, r, b);
  assert.equal(m.w.coins, 130); assert.equal(m.w.gems, 15);
  assert.deepEqual([m.w.lvl, m.w.xp], [3, 50]);                           // 150 + 40 + 60 = 250 total xp = lvl 3 (level 1 is 0 xp)
  assert.equal(C.fsMerge(S({ w: { coins: 0 } }), S({ w: { coins: 10 } }), S({ w: { coins: 100 } })).w.coins, 0);   // never below 0
});

test('first merge on a device (no base): currencies add up, xp takes the higher, prefs come from the account', () => {
  const l = S({ w: { coins: 300, dia: 5, lvl: 5, xp: 0 }, nick: 'Phone', bird: 'zero' });
  const r = S({ w: { coins: 200, dia: 1, lvl: 2, xp: 0 }, nick: 'Main', bird: 'volt' });
  const m = C.fsMerge(l, r, null);
  assert.equal(m.w.coins, 500); assert.equal(m.w.dia, 6); assert.equal(m.w.lvl, 5);
  assert.equal(m.nick, 'Main'); assert.equal(m.bird, 'volt');
});

test('monotonic fields: union of units and claims, OR of flags, max of bests and stages, later daily streak', () => {
  const l = S({ owned: ['zero'], pass: true, best: 50, bestg: 20, stg: { gates: [9, 1], score: [1], clr: [1, 0], open: 4 }, tut: 1,
    ds: { last: '2026-10-16', streak: 9 }, dbonus: '2026-10-16', vsg: ['202609:' + UID] });
  const r = S({ owned: ['pixel'], starter: true, best: 70, bestg: 25, stg: { gates: [2, 5], score: [8], clr: [0, 1], open: 2 },
    ds: { last: '2026-10-17', streak: 1 }, dbonus: '2026-10-17', vsg: ['202608:' + UID] });
  const m = C.fsMerge(l, r, null);
  assert.ok(m.owned.includes('zero') && m.owned.includes('pixel'));
  assert.equal(m.pass && m.starter, true); assert.deepEqual([m.best, m.bestg], [70, 25]);
  assert.deepEqual(m.stg.gates.slice(0, 2), [9, 5]); assert.deepEqual(m.stg.clr.slice(0, 2), [1, 1]); assert.equal(m.stg.open, 4);
  assert.equal(m.tut, 1); assert.deepEqual(m.ds, { last: '2026-10-17', streak: 1 }); assert.equal(m.dbonus, '2026-10-17');
  assert.deepEqual([...m.vsg].sort(), ['202608:' + UID, '202609:' + UID]);
});

test('three-way prefs: the side that changed since the base wins', () => {
  const b = S({ nick: 'A', bird: 'volt' }), l = S({ nick: 'B', bird: 'volt' }), r = S({ nick: 'A', bird: 'zero' });
  const m = C.fsMerge(l, r, b);
  assert.deepEqual([m.nick, m.bird], ['B', 'zero']);
});

test('fsPlan: adopt, merge3, pull, ask', () => {
  const full = S({ w: { coins: 9 } }), empty = S({}), remote = { rev: 3, data: S({ w: { coins: 1 } }) };
  assert.equal(C.fsPlan(null, UID, null, full), 'adopt');                                  // new account / upgraded anonymous player
  assert.equal(C.fsPlan({ uid: UID, rev: 2, base: empty }, UID, remote, full), 'merge3');
  assert.equal(C.fsPlan(null, UID, remote, empty), 'pull');                                // nothing on this device worth asking about
  assert.equal(C.fsPlan(null, UID, remote, full), 'ask');                                  // one-time choice
  assert.equal(C.fsPlan({ uid: OTHER, rev: 5, base: full }, UID, remote, full), 'pull');   // another account's progress: never handed over
  assert.equal(C.fsPlan({ uid: OTHER, rev: 5, base: full }, UID, null, full), 'pull');
});

test('authUrl: errors are taken out of the URL, other parameters stay, tokens are left to the SDK', () => {
  const base = 'https://breton5797.github.io/fluxwing/';
  assert.deepEqual(C.authUrl(base), { cb: false, err: '', clean: base });
  assert.deepEqual(C.authUrl(base + '#dev'), { cb: false, err: '', clean: base + '#dev' });
  const t = C.authUrl(base + '?c=abc#error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked');
  assert.deepEqual(t, { cb: true, err: 'taken', clean: base + '?c=abc' });
  assert.deepEqual(C.authUrl(base + '?error=access_denied&error_description=x&c=1'), { cb: true, err: 'other', clean: base + '?c=1' });
  assert.equal(C.authUrl(base + '#access_token=a&refresh_token=b&type=magiclink').err, '');   // success: the SDK reads the hash
  assert.equal(C.authUrl(base + '#access_token=a&refresh_token=b').cb, true);
});

test('authErr reads codes, then messages', () => {
  assert.equal(C.authErr({ code: 'identity_already_exists' }), 'taken');
  assert.equal(C.authErr({ code: 'email_exists' }), 'taken');
  assert.equal(C.authErr({ status: 429, message: 'x' }), 'rate');
  assert.equal(C.authErr({ code: 'over_email_send_rate_limit' }), 'rate');
  assert.equal(C.authErr({ code: 'otp_expired' }), 'code');
  assert.equal(C.authErr({ code: 'email_address_invalid' }), 'email');
  assert.equal(C.authErr(null), 'other'); assert.equal(C.authErr({ message: 'boom' }), 'other');
});

test('authUi: hidden without Supabase or on a portal; Apple only when switched on; no Google inside in-app browsers', () => {
  const on = { supabaseUrl: 'u', supabaseAnonKey: 'k' }, ua = 'Mozilla/5.0 (iPhone) Safari/604.1';
  assert.deepEqual(C.authUi(on, ua), { show: true, google: true, apple: false, email: true, inApp: false });
  assert.equal(C.authUi({}, ua).show, false);
  assert.equal(C.authUi({ ...on, ads: 'poki' }, ua).show, false);
  assert.equal(C.authUi({ ...on, ads: 'crazygames' }, ua).show, false);
  assert.equal(C.authUi({ ...on, ads: 'stub' }, ua).show, true);
  assert.equal(C.authUi({ ...on, auth: { apple: true } }, ua).apple, true);
  assert.equal(C.authUi({ ...on, auth: { apple: 'yes' } }, ua).apple, false);
  const k = C.authUi(on, 'Mozilla/5.0 (iPhone) KAKAOTALK 10.0');
  assert.deepEqual([k.google, k.email, k.inApp], [false, true, true]);
  assert.equal(C.authUi(on, undefined).show, true);
});

test('authEmail and authCodeOk', () => {
  assert.equal(C.authEmail('  Me@Example.COM '), 'me@example.com');
  for (const bad of ['', 'a@b', 'no at', 'a@b.c', null, 'x'.repeat(250) + '@a.com']) assert.equal(C.authEmail(bad), '');
  assert.equal(C.authCodeOk(' 123 456 '), '123456');
  for (const bad of ['12345', 'abcdef', '', null, '12345678901']) assert.equal(C.authCodeOk(bad), '');
});

test('a cloud save is applied and pushed only from the menu with nothing open', () => {
  assert.equal(C.fsCanApply('menu', false), true);
  for (const s of ['play', 'dying', 'over', 'paused', 'countdown']) assert.equal(C.fsCanApply(s, false), false);
  assert.equal(C.fsCanApply('menu', true), false);
});

test('fsSummary is what the merge question shows', () => {
  assert.deepEqual(C.fsSummary(C.fsNorm({ v: 1, w: { lvl: 7, coins: 1234 }, owned: ['zero', 'pixel'] })), { l: 7, c: 1234, u: 6 });
});

test('a deferred merged save is re-merged with what the run earned meanwhile before it is applied', () => {
  const atDefer = S({ w: { coins: 100 } });                       // the device when the apply was put off
  const merged = S({ w: { coins: 500 }, owned: ['zero'] });       // what the account agreed on back then
  const now = S({ w: { coins: 160 }, best: 30 });                 // the run since then: +60 coins, best 30
  const m = C.fsLater({ s: merged, local: atDefer }, now);
  assert.equal(m.w.coins, 560); assert.equal(m.best, 30); assert.ok(m.owned.includes('zero'));
  const idle = S({ w: { coins: 160 } });                          // nothing of its own beyond the coins already counted
  assert.ok(C.fsSame(C.fsLater({ s: merged, local: idle }, idle), merged));   // nothing happened since the defer: apply as agreed
});

test('the account modal stacks above the leaderboard it is opened from', () => {
  // authScr sits before lbScr in the DOM, so without an explicit z-index the
  // leaderboard card paints over the account modal and taps look dead.
  assert.match(html, /#authScr\{z-index:/);
});

test('fsNorm clamps the wallet to the server caps and drops units nobody can earn', () => {
  const n = C.fsNorm({ v: 1, w: { coins: 9e9, dia: 9e9, gems: 9e9, lvl: 9e9, xp: 0 }, owned: ['volt', 'aurora', 'mochi'] });
  assert.deepEqual(n.w, { xp: 0, lvl: 1e5, coins: 5e7, dia: 1e7, gems: 1e5 });
  assert.ok(!n.owned.includes('aurora')); assert.ok(n.owned.includes('mochi'));
});

test('unit evolution syncs: normalized, written as fw27_evo, merged as a union per unit', () => {
  const s = S({ evo: { volt: [3, 1, 1, 99], BAD: [1] } });
  assert.deepEqual(s.evo, { volt: [1, 3] });
  assert.deepEqual(S({}).evo, {});
  const m = { fw27_evo: { zero: [0, 2] } };
  assert.deepEqual(C.fsSnap(getOf(m)).evo, { zero: [0, 2] });
  assert.deepEqual(Object.fromEntries(C.fsWrites(C.fsSnap(getOf(m)), getOf(m))).fw27_evo, { zero: [0, 2] });
  const l = S({ evo: { volt: [0, 1] } }), r = S({ evo: { volt: [1, 5], pixel: [2] } });
  assert.deepEqual(C.fsMerge(l, r, null).evo, { pixel: [2], volt: [0, 1, 5] });
  assert.deepEqual(C.fsMerge(l, r, S({})).evo, { pixel: [2], volt: [0, 1, 5] });
});
