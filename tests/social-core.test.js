// Pure social logic extracted from index.html's /* social-core */ block (same pattern as fx-core).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadSocial } from './helpers/social.js';
const S = loadSocial();

// ---------- Phase 1: friend codes ----------
test('SOC_ALPH is Crockford base32 (no I, L, O, U)', () => {
  assert.equal(S.SOC_ALPH, '0123456789ABCDEFGHJKMNPQRSTVWXYZ');
});

test('fcNorm uppercases, strips separators and maps look-alikes', () => {
  assert.equal(S.fcNorm(' ab2k-9mnp '), 'AB2K9MNP');
  assert.equal(S.fcNorm('o0Il-abcd'), '0011ABCD');        // O->0, I/L->1
  assert.equal(S.fcNorm('au!@#'), 'A');                   // U and junk dropped
  assert.equal(S.fcNorm(null), '');
});

test('fcOk accepts exactly 8 alphabet chars after normalising', () => {
  assert.equal(S.fcOk('AB2K-9MNP'), true);
  assert.equal(S.fcOk('ab2k9mnp'), true);
  assert.equal(S.fcOk('AB2K9MN'), false);
  assert.equal(S.fcOk('AB2K9MNPX'), false);
  assert.equal(S.fcOk(''), false);
});

test('fcFmt prints XXXX-XXXX', () => {
  assert.equal(S.fcFmt('AB2K9MNP'), 'AB2K-9MNP');
  assert.equal(S.fcFmt(''), '');
});

test('friendErrKey maps server errors to i18n keys', () => {
  assert.equal(S.friendErrKey('fw_friend_self: no'), 'frSelf');
  assert.equal(S.friendErrKey('fw_friend_dupe: already'), 'frDupe');
  assert.equal(S.friendErrKey('fw_friend_cap: full'), 'frCap');
  assert.equal(S.friendErrKey('fw_rate_limited: slow down'), 'frRate');
  assert.equal(S.friendErrKey('fw_bad_input: nope'), 'frBad');
  assert.equal(S.friendErrKey('boom'), 'frFail');
  assert.equal(S.friendErrKey(undefined), 'frFail');
});

test('socNorm sanitises the social_me payload and drops junk rows', () => {
  const u = '00000000-0000-4000-8000-00000000000a';
  const d = S.socNorm({ code: 'ab2k9mnp', friends: [
    { player_id: u, nick: 'Kim', cc: 'KR', bird: 'volt', best: 12, rp: 3, online: 1 },
    { player_id: 'nope' }, null,
  ], reqs: [{ from_id: u, nick: '<x>' }, { from_id: 'bad' }] });
  assert.equal(d.code, 'AB2K9MNP');
  assert.equal(d.friends.length, 1);
  assert.deepEqual(d.friends[0], { id: u, nick: 'Kim', cc: 'KR', bird: 'volt', best: 12, rp: 3, online: true });
  assert.equal(d.reqs.length, 1);
  assert.equal(d.reqs[0].id, u);
  const e = S.socNorm(null);
  assert.deepEqual(e, { code: '', friends: [], reqs: [] });
});

// ---------- Phase 3: 4-player FFA ----------
const U = ['00000000-0000-4000-8000-00000000000a', '00000000-0000-4000-8000-00000000000b',
  '00000000-0000-4000-8000-00000000000c', '00000000-0000-4000-8000-00000000000d'];

test('FFA_RP is the placement table +50/+20/-20/-50 (sums to zero)', () => {
  assert.deepEqual(S.FFA_RP, [50, 20, -20, -50]);
});

test('ffaPlaces: competition ranking by score, ties share a place', () => {
  assert.deepEqual(S.ffaPlaces([{sc: 9}, {sc: 30}, {sc: 12}, {sc: 9}]), [3, 1, 2, 3]);
  assert.deepEqual(S.ffaPlaces([{sc: 5}, {sc: 5}, {sc: 5}, {sc: 5}]), [1, 1, 1, 1]);
  assert.deepEqual(S.ffaPlaces([{sc: 4}, {sc: 3}, {sc: 2}, {sc: 1}]), [1, 2, 3, 4]);
});

test('ffaRp: tie groups average their span toward zero', () => {
  assert.deepEqual(S.ffaRp([1, 2, 3, 4]), [50, 20, -20, -50]);
  assert.deepEqual(S.ffaRp([1, 1, 3, 4]), [35, 35, -20, -50]);   // (50+20)/2
  assert.deepEqual(S.ffaRp([3, 1, 2, 3]), [-35, 50, 20, -35]);   // (-20-50)/2
  assert.deepEqual(S.ffaRp([1, 1, 1, 1]), [0, 0, 0, 0]);
  assert.deepEqual(S.ffaRp([1, 2, 2, 4]), [50, 0, 0, -50]);
});

test('ffaMatchId: sorted uids, my seat, mode ffa; bad input gives null', () => {
  const m = S.ffaMatchId(36, [U[2], U[0], U[3], U[1]], U[2]);
  assert.deepEqual(m, { id: '10.' + U.join('+'), team: 2, mode: 'ffa' });
  assert.equal(S.ffaMatchId(1, [U[0], U[0], U[1], U[2]], U[0]), null);   // dupe
  assert.equal(S.ffaMatchId(1, [U[0], U[1], U[2]], U[0]), null);         // 3 players
  assert.equal(S.ffaMatchId(1, [U[0], U[1], U[2], 'x'], U[0]), null);    // bad uuid
  assert.equal(S.ffaMatchId(1, U, 'not-there'), null);                    // me not in it
});

test('ffaPlaceFinal: my place is certain once no live player can pass me', () => {
  // I died at 10; one rival alive at 4 -> places not final
  assert.equal(S.ffaPlaceFinal({ sc: 10, al: false }, [{ sc: 4, al: true }, { sc: 20, al: false }, { sc: 1, al: false }]), 0);
  // everyone dead -> place from scores (I am 2nd)
  assert.equal(S.ffaPlaceFinal({ sc: 10, al: false }, [{ sc: 4, al: false }, { sc: 20, al: false }, { sc: 1, al: false }]), 2);
});

// ---------- Phase 2: friend alerts + toggle ----------
test('notifyRoute truth table: master off or kind off silences everything', () => {
  const st = (o = {}) => ({ on: true, kinds: { on: true, best: true }, perm: 'granted', hidden: false, art: false, ...o });
  assert.equal(S.notifyRoute('on', st({ on: false })), 'none');
  assert.equal(S.notifyRoute('best', st({ kinds: { on: true, best: false } })), 'none');
  assert.equal(S.notifyRoute('on', st()), 'toast');                                   // visible tab -> in-app toast
  assert.equal(S.notifyRoute('on', st({ hidden: true })), 'os');                      // hidden + granted -> OS notification
  assert.equal(S.notifyRoute('on', st({ hidden: true, perm: 'denied' })), 'none');
  assert.equal(S.notifyRoute('on', st({ hidden: true, art: true })), 'none');         // artifact: never OS
  assert.equal(S.notifyRoute('on', st({ art: true })), 'toast');
  assert.equal(S.notifyRoute('junk', st()), 'none');
});

test('notifText picks the i18n key and fills nick / value', () => {
  assert.deepEqual(S.notifText('on', 'Kim', 0), { k: 'ntOn', v: { n: 'Kim' } });
  assert.deepEqual(S.notifText('best', 'Kim', 42), { k: 'ntBest', v: { n: 'Kim', s: 42 } });
  assert.equal(S.notifText('junk', 'Kim', 1), null);
});

test('feedMerge keeps the cursor moving and drops duplicate ids', () => {
  const a = S.feedMerge(0, [{ id: 3, kind: 'on', nick: 'A' }, { id: 5, kind: 'best', nick: 'B', val: 9 }]);
  assert.equal(a.since, 5);
  assert.equal(a.rows.length, 2);
  const b = S.feedMerge(a.since, [{ id: 5, kind: 'best', nick: 'B', val: 9 }, { id: 7, kind: 'on', nick: 'C' }]);
  assert.equal(b.since, 7);
  assert.deepEqual(b.rows.map(r => r.id), [7]);
  assert.deepEqual(S.feedMerge(9, null), { since: 9, rows: [] });
  assert.deepEqual(S.feedMerge(9, [{ id: 'x' }]), { since: 9, rows: [] });
});
