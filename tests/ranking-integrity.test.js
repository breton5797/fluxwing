// Ranking integrity (2026-10 review): ranked versus and season rewards need an account, a season rank needs several rivals,
// a reward is granted once across devices (claim nonce), a name change goes through its own RPC, names cannot carry
// bidi / zero-width tricks, and an endless score always comes with its gates.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadI18NParts } from './helpers/i18n.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html'), sql = read('supabase/schema.sql');
const body = name => { const i = sql.indexOf('create or replace function ' + name + '('); assert.ok(i >= 0, name); return sql.slice(i, sql.indexOf('$$;', sql.indexOf('$$', i) + 2)); };
const js = (a, b) => { const i = html.indexOf(a); assert.ok(i >= 0, a); return html.slice(i, html.indexOf(b, i)); };

// ---------- 1. ranked versus and season rewards: accounts only, and several rivals ----------
test('server: a guest cannot start, report or claim a ranked match; versus_me still answers', () => {
  const g = body('private.fw_need_account');
  assert.match(g, /\(select auth\.jwt\(\)\) ->> 'is_anonymous'/, 'the token claim');
  assert.match(g, /to_jsonb\(u\) ->> 'is_anonymous' from auth\.users u/, 'and the auth.users row');
  assert.match(g, /raise exception 'fw_need_account/);
  assert.match(sql, /revoke all on function private\.fw_need_account\(uuid\)\s+from public, anon, authenticated;/);
  for (const f of ['private.fw_versus_start', 'private.fw_versus_report', 'private.fw_versus_claim']) {
    const b = body(f), k = b.indexOf('perform private.fw_need_account(v_uid);');
    assert.ok(k > 0, f);
    assert.ok(k < b.indexOf('private.fw_vs_tick()'), `${f}: refused before the season gate (a refused call never pays for a rollover)`);
  }
  assert.doesNotMatch(body('private.fw_versus_me'), /fw_need_account/);
});

test('server: settlement records distinct rivals; the rollover ranks only accounts with min_matches and 3 rivals', () => {
  assert.match(sql, /alter table public\.fw_versus add column if not exists rivals uuid\[\] not null default '\{\}';/);
  assert.match(sql, /grant select \(player_id, nick, cc, bird, rp, wins, losses, draws\) on table public\.fw_versus to authenticated;/, 'rivals stay private');
  assert.match(body('private.fw_vs_min_rivals'), /when p_season >= 202611 then 3 else 0/, 'from the first season tracked in full');
  const r = body('private.fw_vs_rivals');
  assert.match(r, /select distinct/); assert.match(r, /limit 16/);
  for (const f of ['private.fw_vs_settle', 'private.fw_vs_settle_ffa']) {
    const b = body(f);
    assert.match(b, /q\.team <> r\.team/, `${f}: the other team (FFA: every other seat)`);
    assert.match(b, /rivals = private\.fw_vs_rivals\(rivals, v_riv\)/, f);
  }
  const t = body('private.fw_vs_tick');
  assert.match(t, /cardinality\(v\.rivals\) >= v_riv/);
  assert.match(t, /v_riv := private\.fw_vs_min_rivals\(v_cur\)/);
  assert.match(t, /is_anonymous/, 'a guest row is archived without a rank');
  assert.match(t, /set rp = 0, wins = 0, losses = 0, draws = 0, rivals = '\{\}'/);
});

test('client: a guest plays versus as practice, sees why, and is never offered a season claim', () => {
  const st = js('function vsRankStart(', '\nfunction vsRankShow(');
  assert.ok(st.indexOf("why: 'guest'") > 0 && st.indexOf("why: 'guest'") < st.indexOf("vsRpc('versus_start'"), 'no versus_start call for a guest');
  assert.match(js('function vsRpNote(', '\nfunction vsBegin('), /rk\.why === 'guest' \? 'vsGuest'/);
  assert.match(js('function seaCheck(', '\nfunction seaPills('), /authAnon\(\)/);
  assert.match(html, /<div class="vsseason" id="vsGuest" data-i18n="vsGuest" hidden><\/div>/);
  assert.match(js('function renderVsBadge(', '\n}'), /\$\('vsGuest'\)\.hidden = !vsGuest\(\);/);
  assert.match(html, /const vsGuest = \(\) => backend === 'supa' && !!sb && authAnon\(\);/);
  assert.match(js('function renderLB(', '\nfunction openLB('), /vsGuest\(\) \? t\('vsGuest'\)/);
  assert.match(js('function seaOpen(', '\nfunction seaClose('), /t\('seaRiv', \{n: \(vsMe && vsMe\.need_rivals\) \| 0 \|\| 3\}\)/);
  assert.match(body('private.fw_versus_me'), /'need_rivals', private\.fw_vs_min_rivals\(v_season\)/);
});

test('every language has the guest hint and the rival rule', () => {
  const P = loadI18NParts();
  assert.equal(Object.keys(P.I18N).length, 23);
  for (const [l, tb] of Object.entries(P.I18N)) {
    assert.ok(tb.vsGuest && tb.vsGuest.trim(), `${l} vsGuest`);
    assert.ok(tb.seaRiv && tb.seaRiv.includes('{n}'), `${l} seaRiv`);
    if (l !== 'en') assert.notEqual(tb.vsGuest, P.I18N.en.vsGuest, `${l} vsGuest is translated`);
  }
  for (const [l, w] of Object.entries(P.I18N_W)) { assert.ok(w.vsGuest, `${l}: world row`); assert.ok(w.seaRiv, `${l}: world row`); }
});

// ---------- 2. one grant per reward across devices: the claim nonce ----------
const claimBlock = html.match(/\/\* claim:start \*\/[\s\S]*?\/\* claim:end \*\//);
const C = claimBlock ? new Function(`const crypto = globalThis.crypto;\n${claimBlock[0]}\nreturn {rndNonce, nonceGet, nonceDrop, claimGrant};`)() : {};

test('claim block: a random nonce per claim, kept until the grant is saved; grant on a first claim or a matching nonce only', () => {
  assert.ok(claimBlock, 'a pure claim block');
  const a = C.rndNonce(), b = C.rndNonce();
  assert.match(a, /^[0-9a-f]{32}$/); assert.notEqual(a, b);
  const m1 = C.nonceGet({}, 'k1', () => 'f'.repeat(32));
  assert.deepEqual(m1, { k1: 'f'.repeat(32) });
  assert.equal(C.nonceGet(m1, 'k1', () => 'e'.repeat(32)), m1, 'kept: a retry sends the same nonce');
  assert.deepEqual(C.nonceGet({ k1: 'junk' }, 'k1', () => 'e'.repeat(32)), { k1: 'e'.repeat(32) }, 'a broken one is replaced');
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => ['s' + i, 'a'.repeat(32)]));
  const big = C.nonceGet(many, 'new', () => 'b'.repeat(32));
  assert.ok(Object.keys(big).length <= 9, 'bounded'); assert.equal(big.new, 'b'.repeat(32));
  assert.deepEqual(C.nonceDrop({ k1: 'x', k2: 'y' }, 'k1'), { k2: 'y' });
  assert.equal(C.claimGrant({ already: false }), true, 'first claim');
  assert.equal(C.claimGrant({ already: true, same: true }), true, 'this device claimed it, the answer was lost');
  assert.equal(C.claimGrant({ already: true, same: false }), false, 'another device claimed it');
  assert.equal(C.claimGrant({ already: true }), false, 'no nonce answer: never grant a repeat');
  assert.equal(C.claimGrant(null), false);
});

test('server: versus_claim stores the first nonce and says whether a repeat is the same claim; old clients keep working', () => {
  assert.match(sql, /alter table public\.fw_vs_standing add column if not exists claim_nonce text;/);
  assert.match(sql, /grant select \(season, player_id, rank, rp, tier, wins, losses, draws, nick, cc, bird\) on table public\.fw_vs_standing to authenticated;/, 'the nonce stays private');
  assert.match(sql, /drop function if exists public\.versus_claim\(integer\);/);
  assert.match(sql, /drop function if exists private\.fw_versus_claim\(integer\);/);
  assert.match(sql, /function public\.versus_claim\(p_season integer, p_nonce text default null\)/, 'one argument still calls it');
  const b = body('private.fw_versus_claim');
  assert.match(b, /p_nonce !~ '\^\[0-9a-f\]\{32\}\$'/);
  assert.match(b, /set claimed_at = now\(\), claim_nonce = p_nonce/);
  assert.match(b, /'same', v_at is null or \(p_nonce is not null and v_nonce = p_nonce\)/);
  assert.match(sql, /grant execute on function public\.versus_claim\(integer, text\)\s+to authenticated, service_role;/);
  assert.match(sql, /grant execute on function private\.fw_versus_claim\(integer, text\)\s+to authenticated, service_role;/);
});

test('server: referral payouts are stamped with the claiming device nonce', () => {
  assert.match(sql, /alter table private\.fw_ref_payouts add column if not exists nonce text;/);
  assert.match(sql, /drop function if exists public\.referral_claim\(\);/);
  assert.match(sql, /drop function if exists private\.fw_referral_claim\(\);/);
  assert.match(sql, /drop function if exists private\.fw_ref_unacked\(uuid\);/);
  const b = body('private.fw_referral_claim');
  assert.match(b, /set nonce = p_nonce where p\.inviter_id = v_me and p\.acked_at is null and p\.nonce is null/);
  assert.match(b, /private\.fw_ref_unacked\(v_me, p_nonce\)/);
  assert.match(body('private.fw_ref_unacked'), /'same', p\.nonce = p_nonce/);
});

test('client: both claims send a nonce kept on this device only and grant through claimGrant', () => {
  assert.match(html, /'fw27_nonce'/);
  assert.ok(html.slice(html.indexOf('const FS_LOCAL'), html.indexOf(']);', html.indexOf('const FS_LOCAL'))).includes("'fw27_nonce'"), 'never synced to the account');
  const sea = js("$('seaBtn').addEventListener('click'", '\n});');
  assert.match(sea, /vsRpc\('versus_claim', \{p_season: r\.season, p_nonce: nc\}\)/);
  assert.match(sea, /!claimGrant\(a\.data\)/);
  assert.match(sea, /drop = \(\) => \{[^}]*nonceDrop\(ncMap\(\), key\)/, 'dropping a claim drops its nonce');
  assert.match(sea, /saveW\(\); drop\(\);/, 'the nonce goes only after the wallet is saved');
  assert.ok(sea.indexOf('!claimGrant(a.data)') < sea.indexOf('W.dia += g.dia'), 'checked before the grant');
  const ref = js('async function refClaim(', '\nfunction renderRef(');
  assert.match(ref, /socRpc\('referral_claim', \{p_nonce: n\}\)/);
  assert.match(ref, /p\.same === true/);
});
