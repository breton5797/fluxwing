// Friend invites ("play together and earn"): the pure client rules of the referral block in index.html, the numbers it
// shares with the server (private.fw_ref_cfg in supabase/schema.sql), and the wiring the server design depends on.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadReferral } from './helpers/referral.js';
import { loadI18N } from './helpers/i18n.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html'), sql = read('supabase/schema.sql');
const R = loadReferral();
const CODE = '7K3M9QXZ';

test('refParse: ?r= carries a friend code, in any case and with the printed dash; anything else reads as none', () => {
  assert.equal(R.refParse('?r=' + CODE), CODE);
  assert.equal(R.refParse('?r=7k3m-9qxz'), CODE);
  assert.equal(R.refParse('?c=120&r=7K3M-9QXZ&d=2026-10-21'), CODE);
  assert.equal(R.refParse('?r=7K3M%2D9QXZ'), CODE);
  for (const s of ['', '?', '?c=12', '?r=', '?r=7K3M9QX', '?r=7K3M9QXZ1', '?r=<script>', '?r=7K3M 9QXZ!', '?r=' + 'A'.repeat(200), null, undefined])
    assert.equal(R.refParse(s), '', String(s));
});

test('refStrip: the address bar loses r and keeps the rest; null when there was nothing to strip', () => {
  assert.equal(R.refStrip('?r=' + CODE), '');
  assert.equal(R.refStrip('?c=12&r=' + CODE + '&d=2026-10-21'), '?c=12&d=2026-10-21');
  assert.equal(R.refStrip('?c=12'), null);
  assert.equal(R.refStrip(''), null);
});

test('refUrl: the invite link is the game address with the code; no code, no parameter', () => {
  assert.equal(R.refUrl('https://swishby.com/', CODE), 'https://swishby.com/?r=' + CODE);
  assert.equal(R.refUrl('https://swishby.com/', '7k3m-9qxz'), 'https://swishby.com/?r=' + CODE);
  assert.equal(R.refUrl('https://swishby.com/', ''), 'https://swishby.com/');
  assert.equal(R.refUrl('https://swishby.com/', 'nope'), 'https://swishby.com/');
});

test('refNorm: a stored record is rebuilt field by field; junk becomes an empty record', () => {
  const E = { code: '', at: '', st: '', day: '', stage: 0 };
  for (const v of [null, 7, 'x', [], { st: 'paid' }]) assert.deepEqual(R.refNorm(v), E, JSON.stringify(v));
  assert.deepEqual(R.refNorm({ code: 'abcd-efgh', at: '2026-10-21', st: 'open', day: '2026-10-21', stage: 99, x: 1 }),
    { code: 'ABCDEFGH', at: '2026-10-21', st: 'open', day: '2026-10-21', stage: 50 });
  assert.equal(R.refNorm({ stage: -3 }).stage, 0);
  assert.equal(R.refNorm({ at: 'yesterday' }).at, '');
});

test('refSeen / refLinkDue: a link waits until it is sent; a newer link replaces an unsent one; a sent one is final', () => {
  let r = R.refSeen(null, CODE, '2026-10-21');
  assert.deepEqual(r, { code: CODE, at: '2026-10-21', st: '', day: '', stage: 0 });
  assert.equal(R.refLinkDue(r, '2026-10-21'), true);
  assert.equal(R.refSeen(r, 'ABCDEFGH', '2026-10-22').code, 'ABCDEFGH', 'a newer link, not sent yet, wins');
  assert.equal(R.refSeen(r, '', '2026-10-22').code, CODE, 'no link: the pending one stays');
  const sent = R.refLinked(r, 'linked');
  assert.equal(sent.st, 'open');
  assert.equal(R.refSeen(sent, 'ABCDEFGH', '2026-10-22').code, CODE, 'after the server answered, a new link changes nothing');
  assert.equal(R.refLinkDue(sent, '2026-10-21'), false);
  assert.equal(R.refLinkDue(R.refNorm(null), '2026-10-21'), false, 'nothing pending');
  assert.equal(R.refLinkDue(r, '2026-10-28'), true, 'kept for a week');
  assert.equal(R.refLinkDue(r, '2026-10-29'), false, 'an old pending link is dropped: the server would refuse an old account anyway');
});

test('refLinked: the server answer decides whether this device reports progress', () => {
  const r = R.refSeen(null, CODE, '2026-10-21');
  assert.equal(R.refLinked(r, 'linked').st, 'open');
  assert.equal(R.refLinked(r, 'already').st, 'open', 'bound before (another device): progress reports tell the rest');
  for (const s of ['unknown', 'self', 'old']) assert.equal(R.refLinked(r, s).st, 'none', s);
  assert.deepEqual(R.refLinked(r, undefined), r, 'no answer (offline): try again later');
  assert.deepEqual(R.refLinked(r, 'weird'), r);
});

test('refReportDue / refReported: one report per UTC day, or sooner when the stage reached went up; stops once done', () => {
  let r = R.refLinked(R.refSeen(null, CODE, '2026-10-21'), 'linked');
  assert.equal(R.refReportDue(r, '2026-10-21', 1), true);
  r = R.refReported(r, '2026-10-21', 1, 'open');
  assert.deepEqual([r.day, r.stage, r.st], ['2026-10-21', 1, 'open']);
  assert.equal(R.refReportDue(r, '2026-10-21', 1), false, 'same day, same stage');
  assert.equal(R.refReportDue(r, '2026-10-21', 4), true, 'a higher stage reports at once');
  assert.equal(R.refReportDue(r, '2026-10-22', 1), true, 'a new day');
  assert.equal(R.refReported(r, '2026-10-22', 0, 'open').stage, 1, 'the stage never goes down');
  assert.equal(R.refReported(r, '2026-10-23', 10, 'done').st, 'done');
  assert.equal(R.refReportDue(R.refReported(r, '2026-10-23', 10, 'done'), '2026-10-24', 11), false);
  assert.equal(R.refReported(r, '2026-10-23', 3, 'none').st, 'none', 'the server knows no invite: stop asking');
  assert.deepEqual(R.refReported(r, '2026-10-23', 3, undefined), r, 'no answer: unchanged, asked again next time');
  assert.equal(R.refReportDue(R.refNorm(null), '2026-10-21', 5), false, 'not invited');
});

test('refMs / refPayGems: milestones at 3, 10 and 25 friends, each paid once, on top of the per-friend gems', () => {
  const C = R.REF_CFG;
  assert.deepEqual(R.refMs(0).map(x => [x.m, x.n, x.ok]), [[3, 0, false], [10, 0, false], [25, 0, false]]);
  assert.deepEqual(R.refMs(4).map(x => [x.n, x.ok]), [[3, true], [4, false], [4, false]]);
  assert.deepEqual(R.refMs(30).map(x => [x.n, x.ok]), [[3, true], [10, true], [25, true]]);
  assert.equal(R.refPayGems(0, 0), 0);
  assert.equal(R.refPayGems(1, 0), C.gems);
  assert.equal(R.refPayGems(1, 2), C.gems + C.msGems[0], 'the third friend crosses the first milestone');
  assert.equal(R.refPayGems(3, 0), 3 * C.gems + C.msGems[0]);
  assert.equal(R.refPayGems(1, 3), C.gems, 'a milestone already passed is not paid again');
  assert.equal(R.refPayGems(25, 0), 25 * C.gems + C.msGems[0] + C.msGems[1] + C.msGems[2], 'all three in one claim');
  assert.equal(R.refPayGems(5, 25), 5 * C.gems);
});

test('refView: the referral_me answer, normalised for the friends screen', () => {
  const v = R.refView({ code: '7k3m9qxz', paid: 4, month: 2, cap: 25, ready: 1, held: 2, open: 3,
    friends: [{ nick: 'Mina', days: 2, stage: 7, done: false }, { nick: '<b>', days: 9, stage: 77, done: true }, 'junk'],
    payouts: [{ id: 12, gems: 80, invites: 1, ms: [3] }, { id: 'x', gems: 5 }, { id: 13, gems: -4 }] });
  assert.equal(v.code, CODE);
  assert.deepEqual([v.paid, v.month, v.cap, v.ready, v.held, v.open], [4, 2, 25, 1, 2, 3]);
  assert.deepEqual(v.friends, [{ nick: 'Mina', days: 2, stage: 7, done: false }, { nick: '<b>', days: 3, stage: 10, done: true }],
    'progress is shown against the goal (n/3 days, n/10 stage), never past it');
  assert.deepEqual(v.payouts, [{ id: 12, gems: 80 }], 'a payout needs an integer id and a positive amount');
  assert.equal(R.refView(null), null);
  assert.equal(R.refView({ code: 'bad' }), null, 'no code: the server answer is not usable');
});

test('refToGrant / refPaidAdd: a payout is granted on this device once, whatever the server repeats', () => {
  const pays = [{ id: 5, gems: 30 }, { id: 6, gems: 80 }];
  assert.deepEqual(R.refToGrant(pays, []), { gems: 110, ids: [5, 6] });
  assert.deepEqual(R.refToGrant(pays, [5]), { gems: 80, ids: [6] }, 'an answer lost before the ack: only the new one');
  assert.deepEqual(R.refToGrant(pays, [5, 6]), { gems: 0, ids: [] });
  assert.deepEqual(R.refToGrant(null, null), { gems: 0, ids: [] });
  assert.deepEqual(R.refPaidAdd([1, 2], [2, 3]), [1, 2, 3]);
  const many = Array.from({ length: 80 }, (_, i) => i);
  assert.equal(R.refPaidAdd(many, [100]).length, R.REF_CFG.paidMax, 'bounded');
  assert.equal(R.refPaidAdd(many, [100]).at(-1), 100, 'the newest kept');
  assert.deepEqual(R.refPaidAdd('junk', [7]), [7]);
});

test('refNudgeDue: after a new best or a finished daily, at most once a UTC day', () => {
  assert.equal(R.refNudgeDue('', '2026-10-21', 'best'), true);
  assert.equal(R.refNudgeDue('', '2026-10-21', 'daily'), true);
  assert.equal(R.refNudgeDue('2026-10-21', '2026-10-21', 'best'), false, 'once a day');
  assert.equal(R.refNudgeDue('2026-10-20', '2026-10-21', 'daily'), true);
  assert.equal(R.refNudgeDue('', '2026-10-21', ''), false, 'any other run end: no nudge');
  assert.equal(R.refNudgeDue('', '2026-10-21', 'versus'), false);
});

// ---------- the server: same numbers, same anti-abuse rules, the grants the invoker wrappers need ----------
test('private.fw_ref_cfg holds the client numbers (REF_CFG)', () => {
  const m = sql.match(/function private\.fw_ref_cfg\([\s\S]*?\$\$\s*select\s+([^;]+);\s*\$\$/);
  assert.ok(m, 'fw_ref_cfg with a single select');
  const v = m[1].replace(/\s+/g, ' ');
  const C = R.REF_CFG;
  assert.equal(v, `${C.days}, ${C.stage}, ${C.minBest}, ${C.gems}, array[${C.ms.join(',')}], array[${C.msGems.join(',')}], ${C.cap}, interval '24 hours', 5, interval '1 hour'`);
});

test('the stage goal: minBest is the gate goal of the stage before the target (a run that reached it scored at least that)', () => {
  const g0 = html.match(/ST_G0 = \[(\d+),/)[1] | 0, first = html.match(/ST_FIRST = \[(\d+),(\d+),/);
  const i = R.REF_CFG.stage - 2;   // the 0-based index of the stage that must be cleared to reach the target
  assert.ok(i < (first[2] | 0), 'still in the first tier');
  assert.equal(R.REF_CFG.minBest, g0 + (i >> 1));   // stGoal(i) for tier 0
});

test('referral tables reference auth.users on delete cascade (delete_me takes them along) and are not exposed', () => {
  for (const t of ['fw_referrals', 'fw_ref_inviter', 'fw_ref_payouts']) {
    assert.match(sql, new RegExp(`create table if not exists private\\.${t} \\(`));
    assert.match(sql, new RegExp(`alter table private\\.${t} enable row level security;`));
    assert.match(sql, new RegExp(`revoke all on table private\\.${t} from public, anon, authenticated;`));
  }
  const tbl = sql.match(/create table if not exists private\.fw_referrals \(([\s\S]*?)\n\);/)[1];
  assert.match(tbl, /invitee_id\s+uuid\s+primary key references auth\.users \(id\) on delete cascade/, 'one inviter per invitee');
  assert.match(tbl, /inviter_id\s+uuid\s+not null references auth\.users \(id\) on delete cascade/);
  assert.match(tbl, /check \(invitee_id <> inviter_id\)/, 'no self-invite, even by hand');
});

test('referral RPCs: definer functions pin search_path; the invoker wrappers and their private targets are granted to authenticated', () => {
  const fns = [['fw_referral_link', 'referral_link', 'text'], ['fw_referral_progress', 'referral_progress', 'integer'],
    ['fw_referral_me', 'referral_me', ''], ['fw_referral_claim', 'referral_claim', 'text'], ['fw_referral_ack', 'referral_ack', 'bigint']];
  for (const [p, w, a] of fns) {
    assert.match(sql, new RegExp(`function private\\.${p}\\([^)]*\\)[\\s\\S]*?security definer set search_path = ''`), p);
    assert.match(sql, new RegExp(`function public\\.${w}\\([^)]*\\)[\\s\\S]*?security invoker set search_path = ''`), w);
    const ps = `private\\.${p}\\(${a}\\)`, ws = `public\\.${w}\\(${a}\\)`;
    assert.match(sql, new RegExp(`revoke all on function ${ps}\\s+from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function ${ps}\\s+to authenticated, service_role;`), `${p}: the invoker wrapper needs this (production 403 on 2026-10-20)`);
    assert.match(sql, new RegExp(`revoke all on function ${ws}\\s+from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function ${ws}\\s+to authenticated;`));
  }
  assert.match(sql, /revoke all on function private\.fw_ref_cfg\(\)\s+from public, anon, authenticated;/);
});

test('the rehearsal walks the whole flow as the API role', () => {
  const r = read('supabase/rehearsal/referral.sql');
  assert.match(r, /set role authenticated;/);
  for (const w of ['referral_link', 'referral_progress', 'referral_claim', 'referral_ack', 'referral_me', 'submit_score'])
    assert.match(r, new RegExp(`public\\.${w}\\(`), w);
  for (const s of ["'self'", "'old'", "'already'", 'month', 'held']) assert.ok(r.includes(s), s);
});

// ---------- the client wiring ----------
test('index.html reads ?r= at start-up, strips it from the address bar, and talks to the server only when signed in', () => {
  assert.match(html, /refParse\(location\.search\)/);
  assert.match(html, /refStrip\(location\.search\)/);
  for (const fn of ['referral_link', 'referral_progress', 'referral_me', 'referral_claim', 'referral_ack'])
    assert.match(html, new RegExp(`'${fn}'`), fn);
  assert.match(html, /id="frRef"[^>]*hidden/, 'the invite box starts hidden (offline: it stays hidden)');
  assert.match(html, /id="oRef"[^>]*hidden/, 'the nudge starts hidden');
});

test('the copy says play together, never download or install', () => {
  const I = loadI18N();
  const keys = Object.keys(I.en).filter(k => /^ref/.test(k));
  assert.ok(keys.length >= 10, 'referral strings exist');
  for (const k of keys) assert.doesNotMatch(I.en[k], /download|install/i, k);
  for (const k of keys) assert.doesNotMatch(I.ko[k], /다운|설치/, k);
});
