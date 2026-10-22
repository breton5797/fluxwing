// admin.html: the operator page (docs/admin.md). The pure block (admin:start … admin:end) is loaded the way tests/helpers/report.js
// loads blocks out of index.html; the page checks hold the security rules of docs/admin.md §1 (noindex, the game's SDK + SRI,
// no markup from data, no guest sign-in, only contract rpc names) and keep the page out of the app and portal builds.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { IOS_ASSETS } from '../scripts/ios-build.mjs';
import { ASSETS } from '../scripts/portal-build.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const page = read('admin.html'), index = read('index.html'), spec = read('docs/admin.md');

function loadAdmin(html = page){
  const m = html.match(/\/\* admin:start[\s\S]*?\/\* admin:end \*\//);
  if (!m) throw new Error('admin block not found in admin.html');
  return new Function(`${m[0]}\nreturn {ADM_TABS, ADM_REASONS, ADM_AUTH_ERR, admRole, admOwnerTab, admAal, admOwnerReady, admNeedMfa, admMfaCode, admQrSrc, admAuthErr, admTabs, admCan, admUuid, admInt, admEmail, admCode, admDeleteOk, admCanDelete, admArgs, admErr, admErrText, admCallback, admDate, admNum, admSeason, admPct, admBar, admMax, admYes, admJson, admReason, admProvider, admPage,
    admFin, admSeries, admNiceCeil, admTicks, admTick, admScale, admPath, admArea, admSpark, admCol, admHBar, admNearest, admLabelsFit, admDayAdd, admHeroCompare, admHeroText, admHero, admShare, admCronState, ADM_HIDE_AT, admByTarget, admClip, admPct1, admSegs};`)();
}
const A = loadAdmin();
const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
// The contract table of docs/admin.md §2: every `admin_*` name in its first column
const CONTRACT = [...spec.split('## 3.')[0].matchAll(/^\| `(admin_[a-z_]+)` \|/gm)].map(m => m[1]);

test('the contract table is read from docs/admin.md', () => {
  assert.equal(CONTRACT.length, 18);
  assert.ok(CONTRACT.includes('admin_me') && CONTRACT.includes('admin_log'));
});

test('admin block: role from admin_me, owner-only tabs hidden for mod and for no role', () => {
  assert.equal(A.admRole({admin: true, role: 'owner'}), 'owner');
  assert.equal(A.admRole({admin: true, role: 'mod'}), 'mod');
  for (const bad of [null, undefined, {}, {admin: false, role: 'owner'}, {admin: 'true', role: 'owner'}, {admin: true, role: 'root'}, {admin: true, role: null}, 'owner'])
    assert.equal(A.admRole(bad), null, JSON.stringify(bad));
  const ids = r => A.admTabs(r).map(t => t.id);
  assert.deepEqual(ids('owner'), ['overview', 'kpi', 'players', 'reports', 'season', 'errors', 'testers', 'referrals', 'log']);
  assert.deepEqual(ids('mod'), ['overview', 'kpi', 'players', 'reports', 'season', 'errors']);
  assert.deepEqual(ids(null), []);
  assert.deepEqual(A.admTabs('owner').map(t => t.label), ['개요', '지표', '플레이어', '신고', '시즌', '오류', '테스터', '추천', '기록']);
  for (const t of ['testers', 'referrals', 'log']){ assert.equal(A.admCan('mod', t), false, t); assert.equal(A.admCan('owner', t), true, t); }
  assert.equal(A.admCan('mod', 'players'), true);
  assert.equal(A.admCan(null, 'overview'), false);
  A.admTabs('owner').pop();
  assert.equal(A.admTabs('owner').length, 9, 'admTabs hands out a copy');
});

test('admin block: uuid, limits, email and code checks', () => {
  assert.equal(A.admUuid(ID), ID);
  assert.equal(A.admUuid('  ' + ID.toUpperCase() + ' '), ID);
  for (const bad of ['', 'x', ID.slice(1), ID + 'a', ID.replace(/-/g, ''), null, 42, `${ID}' or 1=1`]) assert.equal(A.admUuid(bad), '', String(bad));
  assert.equal(A.admInt(500, 1, 200, 50), 200);
  assert.equal(A.admInt(0, 1, 200, 50), 1);
  assert.equal(A.admInt('20', 1, 200, 50), 20);
  assert.equal(A.admInt(7.9, 1, 120, 30), 7);
  for (const bad of ['', 'abc', null, undefined, NaN, Infinity, {}]) assert.equal(A.admInt(bad, 1, 200, 50), 50, String(bad));
  assert.equal(A.admEmail(' Boss@Example.com '), 'boss@example.com');
  assert.equal(A.admEmail('nope'), '');
  assert.equal(A.admCode(' 123 456 '), '123456');
  assert.equal(A.admCode('12345'), '');
  assert.equal(A.admCode('abcdef'), '');
});

test('admin block: rpc arguments follow the contract names and limits', () => {
  assert.deepEqual(A.admArgs.kpi(), {p_days: 30});
  assert.deepEqual(A.admArgs.kpi(999), {p_days: 120});
  assert.deepEqual(A.admArgs.kpi(0), {p_days: 1});
  assert.deepEqual(A.admArgs.players('  ace ', 999, -5), {p_q: 'ace', p_limit: 200, p_offset: 0});
  assert.deepEqual(A.admArgs.players(undefined, undefined, undefined), {p_q: '', p_limit: 50, p_offset: 0});
  assert.equal(A.admArgs.players('x'.repeat(300), 10, 0).p_q.length, 64, 'the server caps the search at 64');
  assert.deepEqual(A.admArgs.player(ID.toUpperCase()), {p_id: ID});
  assert.equal(A.admArgs.player('nope'), null);
  assert.deepEqual(A.admArgs.hidden(ID, true), {p_id: ID, p_hidden: true});
  assert.deepEqual(A.admArgs.hidden(ID, 'yes'), {p_id: ID, p_hidden: false}, 'only a real true hides');
  assert.deepEqual(A.admArgs.resetNick(ID), {p_id: ID});
  assert.deepEqual(A.admArgs.reports(), {p_limit: 100});
  for (const r of ['name', 'cheat', 'other', 'all']) assert.deepEqual(A.admArgs.reportsClear(ID, r), {p_target: ID, p_reason: r});
  assert.equal(A.admArgs.reportsClear(ID, 'spam'), null);
  assert.equal(A.admArgs.reportsClear('x', 'all'), null);
  assert.deepEqual(A.admArgs.testerSet(ID, true, ' qa '), {p_id: ID, p_on: true, p_note: 'qa'});
  assert.equal(A.admArgs.testerSet(ID, true, 'n'.repeat(150)).p_note.length, 100);
  assert.equal(A.admArgs.testerSet('bad', true, ''), null);
  assert.deepEqual(A.admArgs.errors(), {p_limit: 50});
  assert.deepEqual(A.admArgs.referralRelease(ID), {p_inviter: ID});
  assert.deepEqual(A.admArgs.log(1000), {p_limit: 200});
  // every argument name a builder sends is one the contract table lists
  const argNames = new Set([...spec.split('## 3.')[0].matchAll(/`?(p_[a-z]+)\b/g)].map(m => m[1]));
  const built = [A.admArgs.kpi(), A.admArgs.players(), A.admArgs.player(ID), A.admArgs.hidden(ID, true), A.admArgs.reportsClear(ID, 'all'), A.admArgs.testerSet(ID, true, ''), A.admArgs.referralRelease(ID), A.admArgs.deletePlayer(ID, ID), A.admArgs.log()];
  for (const o of built) for (const k of Object.keys(o)) assert.ok(argNames.has(k), k);
});

test('admin block: deletion needs the exact id retyped, and never oneself or an admin', () => {
  assert.equal(A.admDeleteOk(ID, ID), true);
  assert.equal(A.admDeleteOk(` ${ID} `, ID), true);
  for (const bad of ['', ID.slice(0, -1), ID.toUpperCase(), 'yes', null]) assert.equal(A.admDeleteOk(bad, ID), false, String(bad));
  assert.equal(A.admDeleteOk('x', 'x'), false, 'not a uuid');
  assert.deepEqual(A.admArgs.deletePlayer(ID, ID), {p_id: ID, p_confirm: ID});
  assert.equal(A.admArgs.deletePlayer(ID, 'nope'), null);
  const p = {id: ID, admin_role: null};
  assert.equal(A.admCanDelete('owner', p, 'someone-else'), true);
  assert.equal(A.admCanDelete('mod', p, 'someone-else'), false);
  assert.equal(A.admCanDelete('owner', p, ID), false, 'not oneself');
  assert.equal(A.admCanDelete('owner', {id: ID, admin_role: 'mod'}, 'x'), false, 'not another admin');
  assert.equal(A.admCanDelete('owner', null, 'x'), false);
});

test('admin block: server errors read as Korean lines', () => {
  assert.equal(A.admErr({code: '42501', message: 'fw_admin: not allowed'}), '권한 없음');
  assert.equal(A.admErr({code: '42501', message: 'fw_admin_mfa: second factor required'}), '2단계 인증 필요');
  assert.equal(A.admErr({message: 'fw_admin_mfa'}), '2단계 인증 필요');
  assert.equal(A.admErr({message: 'fw_admin: not allowed'}), '권한 없음');
  assert.equal(A.admErr({code: '22023', message: 'fw_bad_input'}), '입력 오류');
  assert.equal(A.admErr({message: 'fw_bad_input: limit'}), '입력 오류');
  assert.match(A.admErr({status: 401, message: 'JWT expired'}), /로그인/);
  assert.match(A.admErr({code: 'PGRST202', message: 'Could not find the function'}), /함수/);
  assert.equal(A.admErr({name: 'TypeError', message: 'Failed to fetch'}), '네트워크 오류');
  assert.equal(A.admErr({message: 'boom'}), '서버 오류');
  assert.equal(A.admErr(null), '서버 오류');
  assert.equal(A.admErrText({code: '42501', message: 'fw_admin: not allowed'}), '권한 없음 (fw_admin: not allowed)');
  assert.equal(A.admErrText({}), '서버 오류');
  assert.ok(A.admErrText({message: 'x'.repeat(500)}).length < 230);
});

test('admin block: a sign-in error is shown as a fixed line, never the URL\'s own text', () => {
  assert.deepEqual(A.admCallback('https://swishby.com/admin.html'), {err: '', clean: ''});
  assert.deepEqual(A.admCallback('https://swishby.com/admin.html#access_token=abc&type=bearer'), {err: '', clean: ''}, 'a success hash is the SDK\'s');
  const q = A.admCallback('https://swishby.com/admin.html?error=access_denied&error_code=403&error_description=Denied+by+user');
  assert.deepEqual(q, {err: A.ADM_AUTH_ERR.access_denied, clean: 'https://swishby.com/admin.html'});
  const h = A.admCallback('https://swishby.com/admin.html#error=server_error&error_code=bad_oauth_state&error_description=Oops');
  assert.deepEqual(h, {err: A.ADM_AUTH_ERR.bad_oauth_state, clean: 'https://swishby.com/admin.html'});
  const evil = A.admCallback('https://swishby.com/admin.html#error=x&error_description=' + encodeURIComponent('관리자에게 비밀번호를 보내세요 evil.example'));
  assert.equal(evil.err, '로그인에 실패했습니다');
  assert.ok(!evil.err.includes('evil'));
  assert.equal(A.admCallback('https://swishby.com/admin.html#error=constructor').err, '로그인에 실패했습니다', 'no prototype keys');
  assert.equal(A.admAuthErr({code: 'otp_expired'}), A.ADM_AUTH_ERR.otp_expired);
  assert.equal(A.admAuthErr({code: 'weird', message: 'raw text'}, '코드 오류'), '코드 오류');
  assert.equal(A.admAuthErr(null), '로그인에 실패했습니다');
  for (const v of Object.values(A.ADM_AUTH_ERR)) assert.match(v, /[가-힣]/);
});

test('admin block: second factor — an owner below aal2 keeps the mod tabs, owner tabs wait', () => {
  assert.equal(A.admAal({admin: true, role: 'owner', aal: 'aal2'}), 'aal2');
  assert.equal(A.admAal({aal: 'aal1'}), 'aal1');
  for (const bad of [null, {}, {aal: 'aal3'}, {aal: true}]) assert.equal(A.admAal(bad), null, JSON.stringify(bad));
  assert.equal(A.admOwnerReady('owner', 'aal2'), true);
  assert.equal(A.admOwnerReady('owner', 'aal1'), false);
  assert.equal(A.admOwnerReady('owner', null), false);
  assert.equal(A.admOwnerReady('mod', 'aal2'), false);
  assert.equal(A.admNeedMfa('owner', 'aal1'), true);
  assert.equal(A.admNeedMfa('owner', null), true);
  assert.equal(A.admNeedMfa('owner', 'aal2'), false);
  assert.equal(A.admNeedMfa('mod', 'aal1'), false, 'mod calls need no second factor');
  assert.deepEqual(['testers', 'referrals', 'log'].map(A.admOwnerTab), [true, true, true]);
  assert.deepEqual(['overview', 'players', 'mfa'].map(A.admOwnerTab), [false, false, false]);
  assert.equal(A.admMfaCode(' 123 456 '), '123456');
  for (const bad of ['12345', '1234567', 'abcdef', null]) assert.equal(A.admMfaCode(bad), '', String(bad));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><path d="M0 0h10v10z" fill="#000"/></svg>';
  const src = A.admQrSrc('data:image/svg+xml;utf-8,' + svg);
  assert.equal(src, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), 're-encoded (a raw # would cut the URL)');
  for (const bad of ['', null, 'javascript:alert(1)', 'https://evil.example/qr.svg', 'data:text/html,<svg>', 'data:image/svg+xml;utf-8,<script>1</script>'])
    assert.equal(A.admQrSrc(bad), '', String(bad));
});

test('admin block: dates in Korea time, numbers, percents, bars', () => {
  assert.equal(A.admDate('2026-10-22T15:30:00Z'), '2026-10-23 00:30');
  assert.equal(A.admDate('2026-10-22T15:30:00+00:00', false), '2026-10-23');
  assert.equal(A.admDate('2026-10-22'), '2026-10-22');
  for (const bad of [null, '', 'soon', 123]) assert.equal(A.admDate(bad), '—', String(bad));
  assert.equal(A.admNum(1234567), '1,234,567');
  assert.equal(A.admNum(-1234.5), '-1,234.5');
  assert.equal(A.admNum('42'), '42');
  assert.equal(A.admNum(0), '0');
  for (const bad of [null, undefined, '', 'x', true, NaN]) assert.equal(A.admNum(bad), '—', String(bad));
  // season ids are YYYYMM (private.fw_vs_season_of), not amounts: never a thousands separator
  assert.equal(A.admSeason(202610), '2026-10');
  assert.equal(A.admSeason('202701'), '2027-01');
  for (const bad of [null, '', 2026, 202613, 'x', 12345678]) assert.equal(A.admSeason(bad), '—', String(bad));
  assert.ok(!/admNum\((s|d|r)\.(season|prev)\)/.test(page), 'season ids are shown with admSeason');
  assert.equal(A.admPct(12.5), '12.5%');
  assert.equal(A.admPct(0), '0%');
  assert.equal(A.admPct(null), '—', 'a day not yet ended');
  assert.equal(A.admBar(5, 10), 50);
  assert.equal(A.admBar(20, 10), 100);
  assert.equal(A.admBar(5, 0), 0);
  assert.equal(A.admBar(null, 10), 0);
  assert.equal(A.admMax([{dau: 3}, {dau: 9}, {dau: null}], 'dau'), 9);
  assert.equal(A.admMax(null, 'dau'), 0);
  assert.equal(A.admYes(true), '예'); assert.equal(A.admYes(false), '아니오'); assert.equal(A.admYes(null), '—');
  assert.equal(A.admJson({a: 1}), '{"a":1}');
  assert.equal(A.admJson('<b>'), '<b>');
  assert.equal(A.admJson(null), '');
  assert.equal(A.admJson({s: 'x'.repeat(1000)}).length, 300);
  assert.equal(A.admReason('cheat'), '부정행위');
  assert.equal(A.admReason('zzz'), 'zzz');
  assert.equal(A.admProvider('google', false), 'google');
  assert.equal(A.admProvider('anonymous', true), '게스트');
  assert.deepEqual(A.admPage(120, 50, 50), {from: 51, to: 100, prev: true, next: true, prevOffset: 0, nextOffset: 100});
  assert.deepEqual(A.admPage(0, 0, 50), {from: 0, to: 0, prev: false, next: false, prevOffset: 0, nextOffset: 50});
  assert.equal(A.admPage(30, 0, 50).next, false);
});

test('charts: series oldest first with nulls kept, three ticks from 0, compact tick text', () => {
  const rows = [{day: '2026-10-03', dau: 5}, {day: '2026-10-01', dau: '7'}, {day: '2026-10-02', dau: null}, {day: 7, dau: 1}, null];
  assert.deepEqual(A.admSeries(rows, 'dau'), [{day: '2026-10-01', v: 7}, {day: '2026-10-02', v: null}, {day: '2026-10-03', v: 5}]);
  assert.deepEqual(A.admSeries(null, 'dau'), []);
  for (const bad of [null, undefined, '', true, 'x', NaN, Infinity]) assert.equal(A.admFin(bad), null, String(bad));
  assert.equal(A.admFin('0'), 0);
  assert.deepEqual(A.admTicks([12, null, 140, 90]), [0, 80, 160], 'domain covers the max with 3 gridlines');
  assert.deepEqual(A.admTicks([5]), [0, 2.5, 5]);
  assert.deepEqual(A.admTicks([0.7, 1.3]), [0, 0.8, 1.6]);
  assert.deepEqual(A.admTicks([1480]), [0, 800, 1600]);
  assert.deepEqual(A.admTicks([null, null]), [0, 0.5, 1], 'all-null still gets an axis');
  assert.deepEqual(A.admTicks([]), [0, 0.5, 1]);
  assert.deepEqual(A.admTicks([-3]), [0, 0.5, 1]);
  for (const v of [0.01, 3, 47, 999, 12345]){ const t = A.admTicks([v]); assert.ok(t[2] >= v && t[2] <= v * 2.5 + 1, `${v} → ${t}`); }
  assert.deepEqual(A.admTicks([5], true), [0, 3, 6], 'a count never gets 2.5');
  assert.deepEqual(A.admTicks([1], true), [0, 1, 2]);
  assert.deepEqual(A.admTicks([3], true), [0, 2, 4]);
  assert.deepEqual(A.admTicks([null], true), [0, 1, 2]);
  assert.deepEqual(A.admTicks([1480], true), [0, 800, 1600]);
  for (let v = 1; v <= 60; v++) for (const t of A.admTicks([v], true)) assert.ok(Number.isInteger(t), `${v} → ${t}`);
  assert.equal(A.admPct1(34.78), '34.8%');
  assert.equal(A.admPct1(5), '5%');
  assert.equal(A.admPct1('1.25'), '1.3%');
  assert.equal(A.admPct1(null), '—');
  assert.deepEqual(A.admSegs(2, 5), {solid: 2, rest: 3});
  assert.deepEqual(A.admSegs(9, 5), {solid: 5, rest: 0}, 'counted never exceeds the bar');
  assert.deepEqual(A.admSegs(null, 4), {solid: 0, rest: 4});
  assert.deepEqual(A.admSegs(-1, null), {solid: 0, rest: 0});
  assert.equal(A.admNiceCeil(0), 1);
  assert.equal(A.admNiceCeil(7.2), 8);
  assert.equal(A.admTick(0), '0');
  assert.equal(A.admTick(2.5), '2.5');
  assert.equal(A.admTick(1600), '1.6K');
  assert.equal(A.admTick(2000), '2K');
  assert.equal(A.admTick(3200000), '3.2M');
  assert.equal(A.admTick(1 / 3), '0.33');
  assert.equal(A.admTick(null), '—');
});

test('charts: scales, line and area paths break at missing days, sparkline, columns and bars', () => {
  const s = A.admScale(0, 10, 100, 0);
  assert.equal(s(0), 100); assert.equal(s(10), 0); assert.equal(s(5), 50);
  assert.equal(A.admScale(3, 3, 0, 10)(3), 5, 'a flat domain sits in the middle');
  assert.equal(A.admPath([[0, 10], [10, 20], [20, null], [30, 5], [40, 6]]), 'M0 10L10 20M30 5L40 6', 'a null lifts the pen');
  assert.equal(A.admPath([[0, null]]), '');
  assert.equal(A.admPath([[1.234, 5.678]]), 'M1.2 5.7');
  assert.equal(A.admArea([[0, 10], [10, 20], [20, null], [30, 5]], 50), 'M0 50L0 10L10 20L10 50ZM30 50L30 5L30 50Z');
  assert.equal(A.admArea([], 50), '');
  assert.equal(A.admSpark([1, 2, 3], 102, 32), 'M2 30L51 16L100 2');
  assert.equal(A.admSpark([4, 4], 102, 32), 'M2 16L100 16', 'flat mid-height');
  assert.equal(A.admSpark([1, null, 3], 102, 32), 'M2 30M100 2');
  assert.equal(A.admSpark([null], 102, 32), '');
  assert.equal(A.admSpark('x', 102, 32), '');
  assert.equal(A.admCol(10, 20, 30, 100), 'M10 100V34Q10 30 14 30H26Q30 30 30 34V100Z', '4px rounded top, square base');
  assert.equal(A.admCol(10, 20, 100, 100), '', 'zero height draws nothing');
  assert.equal(A.admCol(0, 4, 99, 100), 'M0 100V100Q0 99 1 99H3Q4 99 4 100V100Z', 'the radius shrinks to fit');
  assert.equal(A.admHBar(100, 10, 50, 18), 'M100 10H146Q150 10 150 14V24Q150 28 146 28H100Z', 'rounded at the data end only');
  assert.equal(A.admHBar(100, 10, 0, 18), '');
  assert.equal(A.admNearest(55, 0, 100, 11), 6);
  assert.equal(A.admNearest(-20, 0, 100, 11), 0);
  assert.equal(A.admNearest(500, 0, 100, 11), 10);
  assert.equal(A.admNearest(50, 0, 100, 1), 0);
  assert.equal(A.admLabelsFit([10, 40, null, 80]), true);
  assert.equal(A.admLabelsFit([10, 20]), false);
  assert.equal(A.admLabelsFit([]), true);
});

test('hero comparison: yesterday against the 7 complete days before it, never today, only with all 8 days', () => {
  const NOW = Date.parse('2026-10-22T03:00:00Z');   // 12:00 in Seoul on 10-22: today is partial, yesterday is 10-21
  // n days ending at `end` (newest first, as the server sends them), DAU from f(i), i = 0 for `end`
  const days = (n, end, f) => Array.from({length: n}, (_, i) => ({day: A.admDayAdd(end, -i), dau: f(i)}));
  const withToday = (rows, v = 7) => [{day: '2026-10-22', dau: v}, ...rows];
  assert.equal(A.admDayAdd('2026-10-01', -1), '2026-09-30');
  assert.equal(A.admDayAdd('2024-02-28', 1), '2024-02-29');
  assert.equal(A.admDayAdd('2026-12-31', 1), '2027-01-01');
  const off = {ready: false};
  assert.deepEqual(A.admHeroCompare([], NOW), off, '0 days');
  assert.deepEqual(A.admHeroCompare(withToday([]), NOW), off, '1 day: today only');
  assert.deepEqual(A.admHeroCompare(withToday(days(1, '2026-10-21', () => 9)), NOW), off, '2 days: today and yesterday (the live case of 10-22)');
  assert.deepEqual(A.admHeroCompare(days(7, '2026-10-21', () => 100), NOW), off, '7 complete days: yesterday has only 6 before it');
  const eight = days(8, '2026-10-21', i => i === 0 ? 105 : 100);
  assert.deepEqual(A.admHeroCompare(eight, NOW), {ready: true, day: '2026-10-21', dau: 105, pct: 5, kind: 'up'}, '8 days');
  assert.deepEqual(A.admHeroCompare(withToday(eight, 3), NOW), A.admHeroCompare(eight, NOW), 'a partial today changes nothing');
  assert.deepEqual(A.admHeroCompare(withToday(eight, 3000), NOW), A.admHeroCompare(eight, NOW));
  const thirty = days(30, '2026-10-21', i => i === 0 ? 128 : i <= 7 ? 100 : 1);
  assert.equal(A.admHeroCompare(thirty, NOW).pct, 28, 'only the 7 days right before yesterday count');
  assert.deepEqual(A.admHeroCompare(days(8, '2026-10-21', i => i === 3 ? null : 100), NOW), off, 'a missing day in the base');
  assert.deepEqual(A.admHeroCompare(days(8, '2026-10-20', () => 100), NOW), off, 'no row for yesterday');
  assert.deepEqual(A.admHeroCompare(days(8, '2026-10-21', i => i ? 0 : 5), NOW), off, 'no comparison against a zero base');
  const k = v => A.admHeroCompare(days(8, '2026-10-21', i => i ? 100 : v), NOW);
  assert.deepEqual([k(95).kind, k(95).pct], ['down', 5]);
  assert.deepEqual([k(100).kind, k(100.9).kind, k(99.1).kind], ['same', 'same', 'same'], '|change| under 1% is the same');
  assert.deepEqual([k(101).kind, k(101).pct, k(99).kind, k(99).pct], ['up', 1, 'down', 1]);
  // the Seoul day boundary: 16:00 UTC is already the next day in Korea
  assert.equal(A.admHeroCompare(days(8, '2026-10-21', () => 50), Date.parse('2026-10-21T16:00:00Z')).day, '2026-10-21');
  assert.deepEqual(A.admHeroCompare(days(8, '2026-10-21', () => 50), Date.parse('2026-10-21T14:59:00Z')), off, 'still 10-21 in Seoul: yesterday is 10-20');
  assert.equal(A.admHeroText(k(105)), '어제는 105명으로 그 전 7일 평균보다 5% 많음');
  assert.equal(A.admHeroText(k(95)), '어제는 95명으로 그 전 7일 평균보다 5% 적음');
  assert.equal(A.admHeroText(k(100.4)), '어제는 100.4명으로 그 전 7일 평균과 같음');
  assert.equal(A.admHeroText({ready: true, dau: 1280, pct: 3, kind: 'up'}), '어제는 1,280명으로 그 전 7일 평균보다 3% 많음');
  assert.equal(A.admHeroText(off), '비교는 기록이 8일 쌓이면 보입니다');
  assert.equal(A.admHeroText(null), '비교는 기록이 8일 쌓이면 보입니다');
});

test('hero number: today so far, or the latest day with a value', () => {
  const daily = Array.from({length: 9}, (_, i) => ({day: `2026-10-${String(22 - i).padStart(2, '0')}`, dau: i === 0 ? 7 : 100}));
  assert.deepEqual(A.admHero(daily, Date.parse('2026-10-22T03:00:00Z')), {day: '2026-10-22', dau: 7, live: true});
  assert.equal(A.admHero(daily, Date.parse('2026-10-23T03:00:00Z')).live, false, 'a finished day');
  assert.equal(A.admHero([{day: '2026-10-22', dau: null}, {day: '2026-10-21', dau: 80}], 0).day, '2026-10-21', 'the latest day with a value');
  assert.equal(A.admHero([], 0), null);
});

test('charts: shares, cron states', () => {
  assert.deepEqual(A.admShare(900, 334), [72.9, 27.1]);
  assert.deepEqual(A.admShare(0, 0), [0, 0]);
  assert.deepEqual(A.admShare(null, 5), [0, 100]);
  assert.deepEqual(A.admCronState({active: true, last_status: 'succeeded'}), {k: 'good', glyph: '✓', label: '성공'});
  assert.deepEqual(A.admCronState({active: true, last_status: 'failed'}), {k: 'crit', glyph: '!', label: '실패'});
  assert.equal(A.admCronState({active: true, last_status: 'running'}).k, 'warn');
  assert.equal(A.admCronState({active: false, last_status: 'failed'}).label, '꺼짐');
  assert.equal(A.admCronState({active: true, last_status: null}).label, '기록 없음');
  assert.equal(A.admCronState({active: true, last_status: '<b>x'}).label, '알 수 없음', 'unknown server text is never shown');
  for (const c of [{}, null, {last_status: 'succeeded'}]) assert.ok(A.admCronState(c).glyph && A.admCronState(c).label, 'always a glyph and a word');
});

test('charts: reports per target, hot at the auto-hide line, labels clipped by code point', () => {
  const T1 = ID, T2 = '1f8fad5b-d9cb-469f-a165-70867728950e';
  const rows = [{target: T1, nick: 'A', reason: 'name', n: 2, counted: 3, hidden: false}, {target: T1, nick: 'A', reason: 'cheat', n: 4, counted: 0, hidden: false},
    {target: T2, nick: 'B', reason: 'other', n: 5, counted: 9, hidden: true}, {target: 'nope', n: 99}, null];
  const t = A.admByTarget(rows);
  assert.deepEqual(t.map(x => [x.target, x.n, x.counted, x.hot]), [[T1, 6, 3, true], [T2, 5, 0, true]], 'summed, counted only from name reports, hidden is hot');
  assert.deepEqual(t[0].reasons, ['닉네임', '부정행위']);
  assert.equal(A.ADM_HIDE_AT, 3);
  assert.equal(A.admByTarget([{target: T1, reason: 'name', n: 1, counted: 2}])[0].hot, false);
  assert.equal(A.admByTarget(Array.from({length: 15}, (_, i) => ({target: ID.replace(/^0/, i.toString(16)), n: i}))).length, 10, 'top 10');
  assert.equal(A.admClip('<img src=x onerror=1>', 8), '<img sr…');
  assert.equal(A.admClip('하늘다람쥐', 5), '하늘다람쥐');
  assert.equal(A.admClip('하늘다람쥐야', 5), '하늘다람…');
  assert.equal(A.admClip('😀😀😀', 2), '😀…', 'never splits a surrogate pair');
  assert.equal(A.admClip(null, 3), '');
});

test('admin.html charts are built node by node: SVG through createElementNS, server text as text nodes', () => {
  assert.match(page, /document\.createElementNS\(SVGNS, tag\)/);
  assert.match(page, /document\.createTextNode\(String\(c\)\)/);
  assert.match(page, /new ResizeObserver/);
  assert.ok(!/setAttribute\(\s*['"]on/i.test(page), 'no event-handler attributes');
  assert.match(page, /prefers-reduced-motion:reduce/);
  for (const hex of ['#1ea2b6', '#8b6cf2', '#b9842a', '#4fd69c', '#ffd25a', '#ff4f8b', '#140c2b']) assert.ok(page.includes(hex), `validated palette ${hex}`);
});

test('admin.html is noindex, Korean, mobile-ready', () => {
  assert.match(page, /^<!doctype html>/i);
  assert.match(page, /<html lang="ko">/);
  assert.match(page, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(page, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
});

test('admin.html loads the same Supabase SDK file with the same SRI hash as the game', () => {
  const src = index.match(/const SDK_SRC = '([^']+)'/)[1], sri = index.match(/const SDK_SRI = '([^']+)'/)[1];
  const tags = [...page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)];
  assert.equal(tags.length, 1, 'exactly one external script');
  assert.equal(tags[0][1], src);
  assert.ok(tags[0][0].includes(`integrity="${sri}"`), 'integrity');
  assert.ok(tags[0][0].includes('crossorigin="anonymous"'), 'crossorigin');
});

test('admin.html talks to the game\'s project with the publishable key only', () => {
  const cfg = index.match(/supabaseUrl: '([^']+)', supabaseAnonKey: '([^']+)'/);
  assert.ok(page.includes(`url: '${cfg[1]}'`) && page.includes(`key: '${cfg[2]}'`));
  assert.match(cfg[2], /^sb_publishable_/);
  assert.doesNotMatch(page, /service_role|sb_secret_/);
});

test('admin.html never builds markup from strings and never signs in a guest', () => {
  for (const bad of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'signInAnonymously', 'window.confirm', 'window.alert', 'alert(', 'confirm(', 'srcdoc'])
    assert.ok(!page.includes(bad), bad);
  assert.match(page, /shouldCreateUser: false/);
  assert.match(page, /redirectTo: back\(\)/);
  assert.match(page, /const back = \(\) => location\.origin \+ location\.pathname/);
});

test('admin.html calls only the rpc names of the contract, and every one of them', () => {
  const used = new Set([...page.matchAll(/'(admin_[a-z_]+)'/g)].map(m => m[1]));
  for (const n of used) assert.ok(CONTRACT.includes(n), `${n} is not in docs/admin.md §2`);
  for (const n of CONTRACT) assert.ok(used.has(n), `${n} is never called`);
  const other = [...page.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)].map(m => m[1]).filter(n => !n.startsWith('admin_'));
  assert.deepEqual(other, [], 'no game rpc from the admin page');
  assert.doesNotMatch(page, /\.from\(\s*'/, 'no direct table reads');
});

test('admin.html CSP: no inline-script allowance, the inline script is pinned by its hash, the SDK by its exact URL', () => {
  const csp = page.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)[1];
  const dir = name => (csp.split(';').map(d => d.trim()).find(d => d.startsWith(name + ' ')) || '').split(/\s+/).slice(1);
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, 'one inline script');
  const h = createHash('sha256').update(scripts[0][1], 'utf8').digest('base64');
  const src = index.match(/const SDK_SRC = '([^']+)'/)[1];
  assert.deepEqual(dir('script-src').sort(), [`'sha256-${h}'`, src].sort(), 'script-src = the inline hash + the SDK file (rerun the hash after editing the script)');
  assert.deepEqual(dir('default-src'), ["'none'"]);
  assert.deepEqual(dir('connect-src'), [index.match(/supabaseUrl: '([^']+)'/)[1]]);
  assert.deepEqual(dir('img-src').sort(), ["'self'", 'data:'].sort(), 'data: for the TOTP QR');
  assert.deepEqual(dir('base-uri'), ["'none'"]);
  assert.deepEqual(dir('form-action'), ["'none'"]);
  assert.deepEqual(dir('style-src').sort(), ["'unsafe-inline'", 'https://fonts.googleapis.com'].sort(), 'inline styles + the Google Fonts stylesheet, nothing else');
  assert.deepEqual(dir('font-src'), ['https://fonts.gstatic.com'], 'font files only from Google Fonts');
  const fonts = [...page.matchAll(/https:\/\/fonts\.googleapis\.com\/css2\?[^'"]+/g)].map(m => m[0]);
  assert.equal(fonts.length, 1, 'one font stylesheet');
  assert.match(fonts[0], /family=Bungee&family=Chakra\+Petch:wght@400;600&display=swap$/);
  assert.ok(!/<link[^>]+fonts\.googleapis/.test(page), 'never a render-blocking <link>: added at boot, after the frame check');
  assert.ok(!/\son[a-z]+\s*=/i.test(page.replace(/<script>[\s\S]*?<\/script>/, '')), 'no inline event handler attributes');
});

test('admin.html refuses to run inside a frame', () => {
  const boot = page.slice(page.indexOf('function boot(){'));
  const frame = boot.indexOf('window.top !== window.self'), client = boot.indexOf('createClient(');
  assert.ok(frame > 0 && client > frame, 'the frame check comes before the client is created');
  assert.match(boot.slice(frame, client), /return;/);
});

test('admin.html is shipped by neither the iOS app nor the portal builds', () => {
  assert.ok(!IOS_ASSETS.some(f => /admin/.test(f)), 'IOS_ASSETS');
  assert.ok(!ASSETS.some(f => /admin/.test(f)), 'portal ASSETS');
  assert.ok(!index.includes('admin.html'), 'the game does not link it');
});
