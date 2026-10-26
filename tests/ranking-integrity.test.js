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
