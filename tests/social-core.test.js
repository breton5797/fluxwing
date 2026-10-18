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
