// Backend hardening (2026-10-28 audit): the leaderboard bound and caps, unreleased units, telemetry caps and the admin
// second factor. String-level checks on supabase/schema.sql; the behaviour is rehearsed by supabase/rehearsal/score-bound.sql
// (bash supabase/rehearsal/run.sh supabase/rehearsal/score-bound.sql).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html'), sql = read('supabase/schema.sql');
const body = name => { const i = sql.indexOf('create or replace function ' + name + '('); assert.ok(i >= 0, name); return sql.slice(i, sql.indexOf('$$;', sql.indexOf('$$', i) + 2)); };
const num = (src, name) => { const m = src.match(new RegExp(name + '\\s+constant\\s+\\w+\\s*:=\\s*([\\d.]+)')); assert.ok(m, name); return +m[1]; };

test('submit_score: the gate cap is about 3x the best real run (112 gates), the time budget is a measured ceiling', () => {
  const f = body('private.fw_submit_score');
  assert.ok(num(f, 'c_max_gates') <= 400, 'c_max_gates <= 400');
  assert.ok(num(f, 'c_max_gates') >= 300, 'still well above the best real run');
  const r = num(f, 'c_gates_per_s');
  assert.ok(r >= 3 && r <= 4, `c_gates_per_s = ceil(measured 2.57 gates/s x 1.5) = 4, never below 3 (got ${r})`);
  assert.equal(num(f, 'c_gate_grace'), 30, 'the 30-gate grace stays');
});

test('submit_score: a score above 0.4 of the endless bound is stored hidden; the hard bound is unchanged', () => {
  const f = body('private.fw_submit_score');
  assert.match(f, /else ceil\(\(3 \* p_gates::bigint \* p_gates \+ 75 \* p_gates\) \* private\.fw_bound_mul\(p_bird\)\)::bigint end;/);
  assert.match(f, /c_soft\s+constant numeric\s*:= 0\.4;/);
  assert.match(f, /v_soft := p_mode = 'endless' and p_score > c_soft \* v_bound;/);
  assert.match(f, /hidden = hidden or v_soft/, 'the row is hidden for review, never un-hidden by a later submit');
});

test('unreleased units: the server open rank matches TIER_OPEN in index.html, and a non-tester cannot submit above it', () => {
  const open = +html.match(/const TIER_OPEN = (\d+);/)[1];
  assert.match(body('private.fw_tier_open'), new RegExp(`select ${open}\\b`), 'private.fw_tier_open() = TIER_OPEN');
  const rk = body('private.fw_unit_rank');
  for (const [r, ids] of [[5, ['seraph', 'halcyon']], [6, ['quasar', 'eclipse']], [7, ['singular', 'entropy']], [8, ['archon', 'garuda']], [9, ['aeon', 'omega']]])
    for (const id of ids) assert.match(rk, new RegExp(`'${id}'[^\\n]*\\]\\) then ${r}\\b`), `${id}: rank ${r}`);
  assert.match(rk, /else 0 end/, 'every other unit is released');
  const f = body('private.fw_submit_score');
  assert.match(f, /private\.fw_unit_rank\(p_bird\) > private\.fw_tier_open\(\)\s+and not exists \(select 1 from private\.fw_testers t where t\.player_id = v_uid\)/);
  assert.match(f, /fw_bad_input: unit not released/);
  assert.match(body('private.fw_bound_mul'), /when r > private\.fw_tier_open\(\) then 1/, 'an unreleased rank gets no share of the bound');
  for (const fn of ['fw_tier_open()', 'fw_unit_rank(text)']) assert.match(sql, new RegExp(`revoke all on function private\\.${fn.replace(/[()]/g, '\\$&')} from public, anon, authenticated;`));
});

test('telemetry: purchase is not client-callable; fresh guests get small caps and stay out of the global count', () => {
  const t = body('private.fw_track');
  const kinds = t.match(/x\.e->>'k' in \(([^)]*)\)/);
  assert.ok(kinds, 'the kind whitelist');
  assert.doesNotMatch(kinds[1], /'purchase'/);
  assert.match(kinds[1], /'shop_buy'/);
  assert.match(t, /v_cap_guest\s+constant int := 60;/);
  assert.match(body('private.fw_report_error'), /c_cap_guest\s+constant int := 3;/);
  for (const f of [t, body('private.fw_report_error')]){
    assert.match(f, /private\.fw_fresh_guest\(v_uid\)/);
    assert.match(f, /not exists \(select 1 from auth\.users u where u\.id = e\.player_id and e\.at < u\.created_at \+ interval '10 minutes'/, 'the global count skips rows sent while the account was a fresh guest');
  }
  const g = body('private.fw_fresh_guest');
  assert.match(g, /interval '10 minutes'/);
  assert.match(g, /to_jsonb\(u\) ->> 'is_anonymous'/);
  assert.match(sql, /revoke all on function private\.fw_fresh_guest\(uuid\) from public, anon, authenticated;/);
});

test('admin: every role needs the second factor (aal2)', () => {
  const g = sql.match(/create or replace function private\.fw_admin_gate\(p_role text\) returns uuid[\s\S]*?\nend \$\$;/)[0];
  assert.match(g, /if coalesce\(\(select auth\.jwt\(\)\) ->> 'aal', ''\) <> 'aal2' then\s+raise exception 'fw_admin_mfa: second factor required'/);
  assert.doesNotMatch(g, /p_role = 'owner' and coalesce\(\(select auth\.jwt\(\)\) ->> 'aal'/);
});

test('the rehearsal covers the acceptance cases', () => {
  assert.ok(existsSync(new URL('supabase/rehearsal/score-bound.sql', root)));
  const r = read('supabase/rehearsal/score-bound.sql');
  for (const s of ['1500', 'omega', 'hidden', '112', "'purchase'", 'fw_testers', 'set role authenticated;', 'PASS score-bound.sql']) assert.ok(r.includes(s), s);
});
