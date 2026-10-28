// Admin page backend (docs/admin.md, sections 1 and 2): the ADMIN section of supabase/schema.sql. Every admin function is a
// definer function in the unexposed schema behind an invoker wrapper, checks the caller with fw_admin_gate before anything else,
// and every write leaves a row in the audit log. The behaviour itself is rehearsed by supabase/rehearsal/admin.sql.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const sql = read('supabase/schema.sql');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// name -> [argument types, role, writes]   (the RPC contract table of docs/admin.md)
const RPC = {
  me:               ['',                        null,    false],
  overview:         ['',                        'mod',   false],
  kpi:              ['integer',                 'mod',   false],
  players:          ['text, integer, integer',  'mod',   false],
  player:           ['uuid',                    'mod',   true],    // an owner's read is logged (view_player: it shows the e-mail)
  set_hidden:       ['uuid, boolean',           'mod',   true],
  reset_nick:       ['uuid',                    'mod',   true],
  reports:          ['integer',                 'mod',   false],
  reports_clear:    ['uuid, text',              'mod',   true],
  testers:          ['',                        'owner', false],
  tester_set:       ['uuid, boolean, text',     'owner', true],
  errors:           ['integer',                 'mod',   false],
  referrals_held:   ['',                        'owner', false],
  referral_release: ['uuid',                    'owner', true],
  season:           ['',                        'mod',   false],
  season_tick:      ['',                        'owner', true],
  delete_player:    ['uuid, text',              'owner', true],
  log:              ['integer',                 'owner', false],
};
const body = name => {
  const m = sql.match(new RegExp(`create or replace function private\\.fw_admin_${name}\\(([^)]*)\\)[\\s\\S]*?\\n(?:end )?\\$\\$;`));
  assert.ok(m, `private.fw_admin_${name} exists`);
  return m[0];
};
const firstStatement = b => b.slice(b.indexOf('\nbegin') + '\nbegin'.length).trim().split(/;\s/)[0];

test('the admin tables: RLS on, no policy, out of reach of the API roles; fw_admins cascades, the log keeps its rows', () => {
  const adm = sql.match(/create table if not exists private\.fw_admins \(([\s\S]*?)\n\);/)[1];
  assert.match(adm, /user_id\s+uuid\s+primary key references auth\.users \(id\) on delete cascade/);
  assert.match(adm, /role\s+text\s+not null check \(role in \('owner', 'mod'\)\)/);
  assert.match(adm, /note\s+text/);
  assert.match(adm, /added_at\s+timestamptz/);
  const log = sql.match(/create table if not exists private\.fw_admin_log \(([\s\S]*?)\n\);/)[1];
  assert.match(log, /id\s+bigserial\s+primary key/);
  assert.match(log, /at\s+timestamptz\s+not null default now\(\)/);
  assert.match(log, /admin_id\s+uuid\s+references auth\.users \(id\) on delete set null/, 'the log outlives the admin account');
  assert.match(log, /target\s+uuid,/);
  assert.doesNotMatch(log, /target\s+uuid\s+references/, 'target has no FK: a deleted player stays in the log');
  for (const t of ['fw_admins', 'fw_admin_log']) {
    assert.match(sql, new RegExp(`alter table private\\.${t} enable row level security;`), t);
    assert.match(sql, new RegExp(`revoke all on table private\\.${t} from public, anon, authenticated(, service_role)?;`), t);
    assert.doesNotMatch(sql, new RegExp(`create policy \\w+ on private\\.${t}\\b`), t);
    assert.doesNotMatch(sql, new RegExp(`grant [^;]* on (table )?private\\.${t}\\b[^;]* to [^;]*\\b(anon|authenticated)\\b`), `${t} is not granted to an API role`);
  }
  assert.match(sql, /fw_reports, fw_push\) references\s+-- auth\.users \(id\) on delete cascade, and so does fw_admins/, 'the delete_me comment lists fw_admins among the cascades');
  assert.match(sql, /fw_admin_log keeps its rows/);
  assert.match(sql, /grant select on table private\.fw_admin_log to service_role;/, 'the log is read-only outside the admin functions');
  assert.doesNotMatch(sql, /grant [^;]*\b(update|delete)\b[^;]* on table private\.fw_admin_log\b/, 'nobody updates or deletes log rows');
});

test('the gate: definer, pinned search_path, refuses guests by the JWT claim and by auth.users, and is not callable by clients', () => {
  const g = sql.match(/create or replace function private\.fw_admin_gate\(p_role text\) returns uuid[\s\S]*?\nend \$\$;/);
  assert.ok(g, 'private.fw_admin_gate(p_role text) returns uuid');
  assert.match(g[0], /security definer set search_path = ''/);
  assert.match(g[0], /coalesce\(\(select auth\.jwt\(\)\) ->> 'is_anonymous', 'false'\) = 'true'/);
  assert.match(g[0], /'is_anonymous'/);
  assert.match(g[0], /from auth\.users/);
  assert.match(g[0], /from private\.fw_admins/);
  assert.match(g[0], /raise exception 'fw_admin: not allowed' using errcode = '42501'/);
  assert.match(g[0], /if coalesce\(\(select auth\.jwt\(\)\) ->> 'aal', ''\) <> 'aal2' then\s+raise exception 'fw_admin_mfa: second factor required' using errcode = '42501'/, 'every admin call needs MFA (owner and mod)');
  assert.match(sql, /revoke all on function private\.fw_adm_is_owner\(uuid\)\s+from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function private\.fw_admin_gate\(text\)\s+from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant execute on function private\.fw_admin_gate/);
});

test('every admin function: definer + search_path in private, the gate first (admin_me excepted), the right role', () => {
  const found = [...sql.matchAll(/create or replace function private\.fw_admin_(\w+)\(/g)].map(m => m[1]).filter(n => n !== 'gate');
  assert.deepEqual([...new Set(found)].sort(), Object.keys(RPC).sort(), 'exactly the contract functions');
  for (const [name, [, role]] of Object.entries(RPC)) {
    const b = body(name);
    assert.match(b, /returns jsonb\s+language plpgsql security definer set search_path = ''/, name);
    if (role) assert.match(firstStatement(b), new RegExp(`private\\.fw_admin_gate\\('${role}'\\)`), `${name}: the gate('${role}') is the first statement`);
    assert.doesNotMatch(b, /\bfrom (fw_|users\b)/, `${name}: references are schema-qualified`);
  }
  assert.match(body('me'), /exception when others/, 'admin_me answers instead of raising');
  assert.match(body('me'), /'aal', v_aal\)/, 'admin_me tells the page the session\'s aal');
  assert.match(body('me'), /if sqlerrm like 'fw_admin_mfa:%' then v_uid := \(select auth\.uid\(\)\);/, 'an admin on aal1 still learns its role (the page then asks for the TOTP code)');
});

test('every admin function has its public invoker wrapper with the exact revoke / grant lines', () => {
  for (const [name, [args]] of Object.entries(RPC)) {
    const w = sql.match(new RegExp(`create or replace function public\\.admin_${name}\\([^)]*\\) returns jsonb\\s+language sql security invoker set search_path = '' as \\$\\$ select private\\.fw_admin_${name}\\([^)]*\\); \\$\\$;`));
    assert.ok(w, `public.admin_${name} wraps private.fw_admin_${name}`);
    const p = esc(`private.fw_admin_${name}(${args})`), q = esc(`public.admin_${name}(${args})`);
    assert.match(sql, new RegExp(`revoke all on function ${p}\\s+from public, anon;`), `${name} private revoke`);
    assert.match(sql, new RegExp(`grant execute on function ${p}\\s+to authenticated, service_role;`), `${name} private grant`);
    assert.match(sql, new RegExp(`revoke all on function ${q}\\s+from public, anon;`), `${name} public revoke`);
    assert.match(sql, new RegExp(`grant execute on function ${q}\\s+to authenticated;`), `${name} public grant`);
    assert.doesNotMatch(sql, new RegExp(`grant execute on function (${p}|${q})\\s+to [^;]*\\banon\\b`), `${name}: never anon`);
  }
});

test('every write function logs; the reads do not', () => {
  for (const [name, [, , writes]] of Object.entries(RPC)) {
    const logs = /insert into private\.fw_admin_log \(admin_id, action, target, detail\)/.test(body(name));
    assert.equal(logs, writes, `${name} ${writes ? 'must' : 'must not'} write the audit log`);
  }
  for (const a of ['hide', 'unhide', 'reset_nick', 'reports_clear', 'tester_on', 'tester_off', 'ref_release', 'season_tick', 'delete_player', 'view_player'])
    assert.ok(sql.includes(`'${a}'`), `log action ${a}`);
});

test('the destructive and the owner-only parts', () => {
  const d = body('delete_player');
  assert.match(d, /p_confirm is distinct from p_id::text/, 'the typed id must match');
  assert.match(d, /p_id = v_me/, 'never yourself');
  assert.match(d, /from private\.fw_admins/, 'never another admin');
  assert.match(d, /delete from auth\.users/);
  assert.match(body('player'), /v_owner := private\.fw_adm_is_owner\(v_me\)/, 'owner = owner row and aal2');
  assert.match(body('player'), /'email', case when v_owner then to_jsonb\(u\) -> 'email' end/, 'the e-mail only for owners');
  assert.match(body('player'), /'admin_role', case when v_owner then/, 'admin roles only for owners');
  assert.match(body('player'), /if v_owner then[\s\S]*?'view_player'/, 'an owner\'s view is logged');
  for (const n of ['set_hidden', 'reset_nick'])
    assert.match(body(n), /exists \(select 1 from private\.fw_admins a where a\.user_id = p_id\) and not private\.fw_adm_is_owner\(v_me\)/, `${n}: an admin is not a mod's target`);
  assert.match(body('overview'), /to_regclass\('cron\.job'\)/, 'works without pg_cron');
  assert.match(body('overview'), /execute /, 'cron is read with dynamic SQL so the function compiles without the extension');
  assert.match(body('season_tick'), /private\.fw_vs_tick\(\)/);
  const r = body('reports');
  for (const c of [/r\.seen = r\.nick/, /'is_anonymous'/, /min_age_h/, /s\.best > 0/, /count\(distinct r\.reporter_id\)/])
    assert.match(r, c, `counted uses fw_report's condition ${c}`);
  assert.match(body('kpi'), /'Asia\/Seoul'/);
  assert.match(body('reports_clear'), /'name', 'cheat', 'other', 'all'/);
});

test('the rehearsal exists and calls everything as the API role', () => {
  assert.ok(existsSync(new URL('supabase/rehearsal/admin.sql', root)));
  const r = read('supabase/rehearsal/admin.sql');
  assert.match(r, /set role authenticated;/);
  for (const name of Object.keys(RPC)) assert.ok(r.includes(`admin_${name}(`), `rehearses admin_${name}`);
  for (const s of ['is_anonymous', 'fw_admin: not allowed', 'fw_admin_mfa', 'aal2', 'view_player', 'fw_bad_input', 'fw_admin_log', 'admin rehearsal: all checks passed']) assert.ok(r.includes(s), s);
  assert.match(read('supabase/rehearsal/stub.sql'), /function auth\.jwt\(\)/, 'the stub has auth.jwt() as Supabase does');
});
