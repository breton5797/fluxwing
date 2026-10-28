// Server integrity (owner's decisions 30, 15 and 32 of the 2026-10-28 audit):
//   30. referral farming: the invited player needs a real account, a real-play best, and a reward waits 24 h after the link;
//   15. the first season only: a rank needs 3 matches instead of 10, and a 1v1 against the AI counts for half RP;
//   32. collusion: the admin season view flags players whose wins come mostly from fewer than 3 rivals, and docs/admin.md
//       has the manual top-10 review before the first rollover.
// The behaviour is rehearsed by supabase/rehearsal/integrity.sql (and referral.sql); this file holds the wiring.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadReferral } from './helpers/referral.js';
import { loadI18NParts } from './helpers/i18n.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html'), sql = read('supabase/schema.sql'), admin = read('admin.html'), doc = read('docs/admin.md');
const body = name => { const i = sql.indexOf('create or replace function ' + name + '('); assert.ok(i >= 0, name); return sql.slice(i, sql.indexOf('$$;', sql.indexOf('$$', i) + 2)); };
const js = (a, b) => { const i = html.indexOf(a); assert.ok(i >= 0, a); return html.slice(i, html.indexOf(b, i)); };
const sel = name => { const m = body(name).match(/\$\$\s*select\s+([^;]+);/); assert.ok(m, name + ': a single select'); return m[1].replace(/\s+/g, ' ').trim(); };

// ---------- 30. referral farming ----------
test('30: referral_link and referral_progress refuse a guest first, before any quota or row is touched', () => {
  for (const f of ['private.fw_referral_link', 'private.fw_referral_progress']) {
    const b = body(f), k = b.indexOf('perform private.fw_need_account(v_me);');
    assert.ok(k > 0, `${f} calls fw_need_account`);
    assert.ok(k < b.indexOf("raise exception 'fw_bad_input"), `${f}: before the argument checks (a guest learns nothing)`);
    for (const later of ['pg_advisory_xact_lock', 'update private.fw_social', 'from private.fw_referrals'])
      if (b.includes(later)) assert.ok(k < b.indexOf(later), `${f}: before ${later}`);
  }
});

test('30: min_best is a real-play score (30), mirrored by the client', () => {
  const R = loadReferral();
  assert.equal(R.REF_CFG.minBest, 30);
  assert.match(sel('private.fw_ref_cfg'), /^3, 10, 30, /);
});

test('30: a counted friend is paid only 24 h after the link (claim and the ready count agree)', () => {
  assert.equal(sel('private.fw_ref_hold'), "interval '24 hours'");
  assert.match(body('private.fw_referral_claim'), /r\.linked_at <= now\(\) - private\.fw_ref_hold\(\)/);
  assert.match(body('private.fw_referral_me'), /'ready',\s+\(select count\(\*\) from private\.fw_referrals r where r\.inviter_id = v_me and r\.done_at is not null and not r\.held and r\.payout_id is null\s+and r\.linked_at <= now\(\) - private\.fw_ref_hold\(\)\)/);
  assert.match(sql, /revoke all on function private\.fw_ref_hold\(\)\s+from public, anon, authenticated;/);
});

test('30: the client does not send referral calls for a guest (the server refuses them)', () => {
  assert.match(js('async function refSync(', '\n}'), /if \(!sb \|\| !uid \|\| refBusy \|\| authAnon\(\)\) return;/);
});

// ---------- 15. the first season ----------
test('15: the first season is a season id in one config function, and its min_matches is 3', () => {
  assert.equal(sel('private.fw_vs_first_cfg'), "202611, 3, 50, 5, 40, interval '20 seconds'");
  assert.match(body('private.fw_vs_min_matches'), /when p_season <= f\.first_season then f\.min_matches else c\.min_matches end/);
  assert.match(sel('private.fw_vs_season_cfg'), /^'Asia\/Seoul', 10, /, 'every later season keeps 10');
  const t = body('private.fw_vs_tick');
  assert.match(t, /v_min := private\.fw_vs_min_matches\(v_cur\);/, 'the rollover ranks by the season it closes');
  assert.doesNotMatch(t, /select c\.min_matches into v_min/);
  assert.match(body('private.fw_versus_me'), /'need', private\.fw_vs_min_matches\(v_season\)/);
  assert.match(t, /set rp = 0, wins = 0, losses = 0, draws = 0, rivals = '\{\}', ai = 0/, 'the AI count resets with the season');
});

test('15: versus_ai counts a 1v1 against the AI for half RP, in the first season only, for accounts, with caps', () => {
  const b = body('private.fw_versus_ai');
  assert.match(b, /security definer\s+set search_path = ''/);
  const k = b.indexOf('perform private.fw_need_account(v_uid);');
  assert.ok(k > 0 && k < b.indexOf('private.fw_vs_tick()'), 'a guest is refused before the season gate');
  assert.ok(b.indexOf("raise exception 'fw_bad_input") < b.indexOf('private.fw_vs_tick()'), 'bad arguments are refused before the season gate');
  assert.match(b, /if v_season > f\.first_season then\s+return jsonb_build_object\('counted', false, 'why', 'season'\);/);
  for (const w of ["'cap'", "'soon'", "'full'"]) assert.ok(b.includes(w), w);
  assert.match(b, /round\(c\.rp_win \* f\.ai_pct \/ 100\.0\)/);
  assert.match(b, /pg_advisory_xact_lock\(hashtextextended\(v_uid::text, 0\)\)/, 'the settle lock (lock order d)');
  assert.doesNotMatch(b, /rivals = /, 'the AI is nobody: no rival is recorded');
  assert.match(sql, /alter table public\.fw_versus add column if not exists ai integer not null default 0;/);
  assert.match(sql, /grant select \(player_id, nick, cc, bird, rp, wins, losses, draws\) on table public\.fw_versus to authenticated;/, 'ai stays private');
  assert.match(sql, /function public\.versus_ai\(p_result text, p_nick text, p_cc text, p_bird text\) returns jsonb\s+language sql\s+security invoker/);
  for (const f of ['private.fw_versus_ai', 'public.versus_ai']) {   // as the other versus functions: the invoker wrapper needs its private target
    assert.match(sql, new RegExp(`revoke all on function ${f.replace('.', '\\.')}\\(text, text, text, text\\)\\s+from public, anon, authenticated;`), f);
    assert.match(sql, new RegExp(`grant execute on function ${f.replace('.', '\\.')}\\(text, text, text, text\\)\\s+to authenticated, service_role;`), f);
  }
  assert.match(body('private.fw_versus_me'), /'ai', private\.fw_vs_ai_state\(v_uid, v_season\)/);
});

test('15: the client reports a finished 1v1 AI match through versus_ai, never a 2v2 / FFA practice or a guest', () => {
  const f = js('function vsFinish(', '\n}');
  assert.match(f, /if \(!vs\.ai\) vsRankReport\(res\); else if \(vs\.sz === 1\) vsAiReport\(res\);/);
  const a = js('function vsAiReport(', '\n}');
  assert.match(a, /if \(!vsAiOn\(\) \|\| !sb \|\| !uid\) return;/);
  assert.match(a, /vsRpc\('versus_ai', \{p_result: res, p_nick: nick, p_cc: CC, p_bird: B\.id\}\)/);
  assert.match(html, /const vsAiOn = \(\) => !vsGuest\(\) && !!\(vsMe && vsMe\.ai && vsMe\.ai\.rp > 0\);/);
  assert.match(js('function vsRpNote(', '\nfunction vsBegin('), /if \(ai\) return rk && rk\.ai/);
  assert.match(html, /<div class="vsnote" id="vsRules" data-i18n="vsRules"><\/div>/);
  assert.match(js('function renderVsBadge(', '\n}'), /\$\('vsRules'\)\.dataset\.i18n = vsAiOn\(\) \? 'vsRulesS1' : 'vsRules';/);
});

test('15: vsRulesS1 in all 23 languages states the server numbers (±25 RP, 5 a day) next to the 20~80 range', () => {
  const P = loadI18NParts();
  assert.equal(Object.keys(P.I18N).length, 23);
  const [, , ai, perDay] = sel('private.fw_vs_first_cfg').split(', ').map(Number), rp = Math.round(50 * ai / 100);
  for (const [l, tb] of Object.entries(P.I18N)) {
    const s = tb.vsRulesS1;
    assert.ok(s && s.trim(), `${l} vsRulesS1`);
    assert.ok(/\+20~80 RP/.test(s) && /[−-]20~80 RP/.test(s), `${l}: the ranked range stays`);
    assert.ok(s.includes(`±${rp} RP`), `${l}: ±${rp} RP`);
    assert.ok(new RegExp(`(^|\\D)${perDay}(\\D|$)`).test(s.replace(/20~80|±\d+/g, '')), `${l}: ${perDay} a day`);
    if (l !== 'en') assert.notEqual(s, P.I18N.en.vsRulesS1, `${l} is translated`);
  }
  for (const [l, w] of Object.entries(P.I18N_W)) assert.ok(w.vsRulesS1, `${l}: world row`);
});

// ---------- 32. collusion ----------
test('32: settled wins are tallied per rival and season; the rollover keeps only the season just closed', () => {
  assert.match(sql, /create table if not exists private\.fw_vs_wins \(/);
  const tb = sql.match(/create table if not exists private\.fw_vs_wins \(([\s\S]*?)\n\);/)[1];
  assert.match(tb, /player_id\s+uuid\s+not null references auth\.users \(id\) on delete cascade/);
  assert.match(tb, /rival_id\s+uuid\s+not null references auth\.users \(id\) on delete cascade/);
  assert.match(sql, /revoke all on table private\.fw_vs_wins from public, anon, authenticated;/);
  for (const f of ['private.fw_vs_settle', 'private.fw_vs_settle_ffa'])
    assert.match(body(f), /if v_d > 0 then perform private\.fw_vs_tally\(r\.player_id, v_riv\); end if;/, f);
  assert.match(body('private.fw_vs_tick'), /delete from private\.fw_vs_wins w where w\.season < v_cur;/);
});

test('32: admin_season flags a player whose wins come mostly from fewer than 3 rivals (live and last season)', () => {
  assert.equal(sel('private.fw_vs_collude_cfg'), '5, 2, 0.66');
  const c = body('private.fw_vs_collusion');
  assert.match(c, /'flag', coalesce\(sum\(w\.n\), 0\) >= k\.min_wins/);
  const a = body('private.fw_admin_season');
  assert.match(a, /private\.fw_vs_collusion\(q\.prev, t\.player_id\)/, 'last season top 10');
  assert.match(a, /private\.fw_vs_collusion\(q\.season, x\.player_id\)/, 'this season live top 10');
  assert.match(a, /'ai', x\.ai/);
  assert.match(admin, /\['검토', r => r\.flag \?/);
  assert.match(doc, /## 6\. 첫 시즌 정산 전 상위 10명 수동 검토/);
  assert.match(doc, /12-01 00:00 KST/);
  assert.match(doc, /admin_set_hidden/);
});

test('15: seasonNoteS1 in all 23 languages prints the first season\'s min_matches (3) for the tier reward; shown while versus_me says first season', () => {
  const P = loadI18NParts(), min = Number(sel('private.fw_vs_first_cfg').split(', ')[1]);
  for (const [l, tb] of Object.entries(P.I18N)) {
    const s = tb.seasonNoteS1;
    assert.ok(s && /MONARCH/.test(s) && /10/.test(s), `${l}: the top 10 and MONARCH stay`);
    assert.ok(new RegExp(`(^|\\D)${min}(\\D|$)`).test(s), `${l}: ${min} matches`);
    assert.equal((s.match(/10/g) || []).length, 1, `${l}: 10 only for the top 10, no longer for the matches`);
    if (l !== 'en') assert.notEqual(s, P.I18N.en.seasonNoteS1, `${l} is translated`);
  }
  for (const [l, w] of Object.entries(P.I18N_W)) assert.ok(w.seasonNoteS1, `${l}: world row`);
  assert.match(html, /<div class="vsnote" id="vsSeaNote" data-i18n="seasonNote"><\/div>/);
  assert.match(html, /const vsFirst = \(\) => !!\(vsMe && vsMe\.ai\);/);
  assert.match(js('function renderVsBadge(', '\n}'), /\$\('vsSeaNote'\)\.dataset\.i18n = vsFirst\(\) \? 'seasonNoteS1' : 'seasonNote';/);
});
