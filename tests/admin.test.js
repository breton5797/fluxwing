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
  return new Function(`${m[0]}\nreturn {ADM_TABS, ADM_REASONS, ADM_AUTH_ERR, admRole, admOwnerTab, admAal, admOwnerReady, admNeedMfa, admMfaCode, admQrSrc, admAuthErr, admTabs, admCan, admUuid, admInt, admEmail, admCode, admDeleteOk, admCanDelete, admArgs, admErr, admErrText, admCallback, admDate, admNum, admSeason, admPct, admBar, admMax, admYes, admJson, admReason, admProvider, admPage};`)();
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
