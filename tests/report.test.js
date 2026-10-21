// Report and block (Google Play UGC policy): the pure client rules of the report block in index.html, the numbers it shares
// with the server (private.fw_rpt_cfg in supabase/schema.sql), the server design, and the wiring on the screens that show names.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadReport } from './helpers/report.js';
import { loadI18N } from './helpers/i18n.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html'), sql = read('supabase/schema.sql');
const R = loadReport();
const A = '00000000-0000-4000-8000-00000000000a', B = '00000000-0000-4000-8000-00000000000b', C = '00000000-0000-4000-8000-00000000000c';

test('blkNorm: a stored block list is rebuilt entry by entry; junk and repeats are dropped', () => {
  for (const v of [null, 7, 'x', {}, [null, 3, 'x', { id: 'nope' }]]) assert.deepEqual(R.blkNorm(v), [], JSON.stringify(v));
  assert.deepEqual(R.blkNorm([{ id: A, n: 'Ann' }, { id: A, n: 'again' }, { id: B, n: 7, x: 1 }]), [{ id: A, n: 'Ann' }, { id: B, n: '' }]);
  assert.equal(R.blkNorm([{ id: A, n: '<b>' + 'x'.repeat(40) }])[0].n, 'bxxxxxxxxxxxxx', 'a stored name is cleaned and cut to 14');
  const many = Array.from({ length: R.RPT_CFG.max + 5 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, n: '' }));
  const kept = R.blkNorm(many);
  assert.equal(kept.length, R.RPT_CFG.max);
  assert.equal(kept[0].id, many[5].id, 'over the cap, the oldest go first');
});

test('blkAdd / blkDel / blkHas: a new list every time, the old one untouched', () => {
  const e = [];
  const one = R.blkAdd(e, A, 'Ann');
  assert.deepEqual(e, [], 'immutable');
  assert.deepEqual(one, [{ id: A, n: 'Ann' }]);
  assert.equal(R.blkAdd(one, A, 'Other'), one, 'already blocked: unchanged');
  assert.equal(R.blkAdd(one, 'nope', 'x'), one, 'not a player id: unchanged');
  const two = R.blkAdd(one, B, 'Bob');
  assert.equal(R.blkHas(two, A), true); assert.equal(R.blkHas(two, B), true); assert.equal(R.blkHas(two, C), false);
  assert.equal(R.blkHas(two, ''), false); assert.equal(R.blkHas(null, A), false);
  const back = R.blkDel(two, A);
  assert.deepEqual(back, [{ id: B, n: 'Bob' }]);
  assert.equal(two.length, 2, 'immutable');
  let full = [];
  for (let i = 0; i < R.RPT_CFG.max; i++) full = R.blkAdd(full, `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, '');
  const over = R.blkAdd(full, C, 'new');
  assert.equal(over.length, R.RPT_CFG.max);
  assert.equal(over[over.length - 1].id, C);
  assert.equal(R.blkHas(over, full[0].id), false, 'the oldest block makes room');
});

test('blkNick: a blocked player is drawn as Pilot; anyone else keeps their name', () => {
  const L = [{ id: A, n: 'Ann' }];
  assert.equal(R.blkNick(L, A, 'Ann'), 'Pilot');
  assert.equal(R.blkNick(L, B, 'Bob'), 'Bob');
  assert.equal(R.blkNick(L, '', 'Bob'), 'Bob', 'no id (an AI, an old client): the name stays');
});

test('rptOkKey / rptErrKey: every server answer has its own message', () => {
  assert.equal(R.rptOkKey({ status: 'ok' }), 'rpSent');
  assert.equal(R.rptOkKey({ status: 'dup' }), 'rpDup');
  assert.equal(R.rptOkKey(null), 'rpFail');
  assert.equal(R.rptErrKey('fw_report_self: you'), 'rpSelf');
  assert.equal(R.rptErrKey('fw_rate_limited: 20 a day'), 'rpRate');
  assert.equal(R.rptErrKey('fw_bad_input: reason'), 'rpFail');
  assert.equal(R.rptErrKey(undefined), 'rpFail');
});

test('rptCands: the other human players of a match, once each; AIs and players without an id are left out', () => {
  const pl = [{ uid: A, nick: 'Ann' }, { uid: '', nick: 'AI 1', ai: true }, { uid: B, nick: 'Bob' }, { uid: A, nick: 'Ann' }, { uid: 'x', nick: 'old' }];
  assert.deepEqual(R.rptCands(pl, B), [{ id: A, nick: 'Ann' }], 'not myself either');
  assert.deepEqual(R.rptCands(pl, C), [{ id: A, nick: 'Ann' }, { id: B, nick: 'Bob' }]);
  assert.deepEqual(R.rptCands(null, C), []);
});

// ---------- the server ----------
test('private.fw_rpt_cfg holds the client lists (RPT_CFG)', () => {
  const f = sql.match(/function private\.fw_rpt_cfg\(\)[\s\S]*?\$\$;/)[0];
  assert.match(f, new RegExp(`'reasons',\\s*array\\[${R.RPT_CFG.reasons.map(r => `'${r}'`).join(',\\s*')}\\]`));
  assert.match(f, new RegExp(`'places',\\s*array\\[${R.RPT_CFG.places.map(r => `'${r}'`).join(',\\s*')}\\]`));
  assert.match(f, /'hide_at',\s*3\b/, 'three different players hide a name');
  assert.match(f, /'day_cap',\s*20\b/);
  assert.match(sql, /revoke all on function private\.fw_rpt_cfg\(\)\s+from public, anon, authenticated;/);
});

test('fw_reports references auth.users on delete cascade (delete_me takes it along), is not exposed, and refuses self-reports', () => {
  assert.match(sql, /create table if not exists private\.fw_reports \(/);
  assert.match(sql, /alter table private\.fw_reports enable row level security;/);
  assert.match(sql, /revoke all on table private\.fw_reports from public, anon, authenticated;/);
  const tbl = sql.match(/create table if not exists private\.fw_reports \(([\s\S]*?)\n\);/)[1];
  assert.match(tbl, /reporter_id\s+uuid\s+not null references auth\.users \(id\) on delete cascade/);
  assert.match(tbl, /target_id\s+uuid\s+not null references auth\.users \(id\) on delete cascade/);
  assert.match(tbl, /check \(reporter_id <> target_id\)/);
  assert.match(tbl, /unique \(reporter_id, target_id, reason, day\)/, 'one report per player, target and reason a day');
  assert.match(tbl, /seen\s+text/, 'the name the reporter saw is kept next to the server\'s');
  assert.match(sql, /fw_testers, fw_events, fw_referrals, fw_ref_inviter, fw_ref_payouts, fw_reports\)/, 'the delete_me comment lists it');
});

test('report_player: definer function pins search_path; the invoker wrapper and its private target are granted to authenticated', () => {
  assert.match(sql, /function private\.fw_report\(p_target uuid, p_reason text, p_place text, p_seen text\)[\s\S]*?security definer set search_path = ''/);
  assert.match(sql, /function public\.report_player\(p_target uuid, p_reason text, p_place text, p_seen text\)[\s\S]*?security invoker set search_path = ''/);
  const ps = 'private\\.fw_report\\(uuid, text, text, text\\)', ws = 'public\\.report_player\\(uuid, text, text, text\\)';
  assert.match(sql, new RegExp(`revoke all on function ${ps}\\s+from public, anon;`));
  assert.match(sql, new RegExp(`grant execute on function ${ps}\\s+to authenticated, service_role;`));
  assert.match(sql, new RegExp(`revoke all on function ${ws}\\s+from public, anon;`));
  assert.match(sql, new RegExp(`grant execute on function ${ws}\\s+to authenticated;`));
  const body = sql.match(/function private\.fw_report\([\s\S]*?end \$\$;/)[0];
  for (const e of ['fw_auth', 'fw_report_self', 'fw_rate_limited', 'fw_bad_input']) assert.ok(body.includes(e), e);
  assert.match(body, /set hidden = true/, 'the auto-hide');
  assert.match(body, /not u\.is_anonymous/, 'guests (free, unlimited accounts) never count toward a hide');
  assert.match(body, /r\.seen = r\.nick/, 'only a report of the name the server has counts (a peer can claim any player id in a match)');
  assert.match(body, /pg_advisory_xact_lock\(hashtext\('fw_report_t:'/, 'the count is serialised per target');
});

test('the rehearsal walks the whole flow as the API role', () => {
  const r = read('supabase/rehearsal/report.sql');
  assert.match(r, /set role authenticated;/);
  assert.match(r, /public\.report_player\(/);
  for (const s of ['fw_report_self', 'fw_rate_limited', 'fw_bad_input', "'dup'", 'hidden', 'delete_me', 'is_anonymous', 'impersonat']) assert.ok(r.includes(s), s);
});

// ---------- the client wiring ----------
test('index.html: the list lives on this device, the report goes to the server, every name screen offers the menu', () => {
  assert.match(html, /store\.get\('fw27_block', \[\]\)/);
  assert.match(html, /'report_player'/);
  assert.match(html, /id="plScr"[^>]*hidden/, 'the menu starts hidden');
  assert.match(html, /id="oRpt"[^>]*hidden/, 'the game-over report button starts hidden');
  assert.match(html, /id="frBlk"[^>]*hidden/, 'the block list section starts hidden');
  const lb = html.match(/function renderLB\(\)[\s\S]*?\n}\n/)[0];
  assert.match(lb, /blkHas\(blocked, r\.id\)/, 'the boards drop blocked players');
  assert.match(lb, /plOpen\(/, 'a name on the boards opens the menu');
  const fr = html.match(/function renderFr\(\)[\s\S]*?\n}\n/)[0];
  assert.match(fr, /blkHas\(blocked, q\.id\)/, 'requests from a blocked player are not shown');
  assert.match(fr, /blkHas\(blocked, f\.id\)/, 'a blocked friend is not shown, even when the removal did not reach the server');
  assert.match(html, /p_seen: /, 'the client sends the name it showed');
  assert.match(html, /if \(!\$\('plScr'\)\.hidden\)\{ if \(e\.code === 'Escape'\) plClose\(\); return; \}/, 'Escape closes the menu; no game key goes through it');
  assert.match(fr, /plOpen\(/);
  assert.ok((html.match(/blkNick\(blocked, /g) || []).length >= 3, 'every versus name goes through blkNick');
});

test('the copy exists in every language and never threatens or promises a ban', () => {
  const I = loadI18N();
  const keys = Object.keys(I.en).filter(k => /^(rp|blk)/.test(k));
  for (const k of ['rpTitle', 'rpName', 'rpCheat', 'rpOther', 'rpSent', 'rpDup', 'rpSelf', 'rpRate', 'rpFail', 'rpOff', 'blkDo', 'blkUndo', 'blkDone', 'blkHead'])
    assert.ok(keys.includes(k), k);
  for (const l of ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi'])
    for (const k of keys) assert.ok(typeof I[l][k] === 'string' && I[l][k] && (l === 'en' || I[l][k] !== I.en[k]), `${l}.${k}`);
  for (const k of keys) assert.doesNotMatch(I.en[k], /\bban/i, k);
});
