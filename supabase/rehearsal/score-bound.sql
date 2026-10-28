-- Backend hardening rehearsal, 2026-10-28 (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/score-bound.sql).
-- As the API role: the 400-gate cap, the 4 gates/s time budget, the soft limit (a score above 0.4 of the endless bound is stored
-- hidden), units of a rank not released yet (refused for players, allowed for a tester, no share of the bound), 'purchase'
-- refused from clients, and the small telemetry caps of guest accounts younger than 10 minutes, whose rows stay out of the
-- global hourly counts. Setup and the checks of stored rows are done as the database owner.
\set ON_ERROR_STOP on
\pset footer off
-- Supabase's auth.users has is_anonymous (a guest); the shared stub does not, so this script adds it
alter table auth.users add column if not exists is_anonymous boolean not null default false;

create function pg_temp.u(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
-- one submit as p_uid: 'accepted' or 'refused: <message>'
create function pg_temp.try(p_uid uuid, p_score int, p_gates int, p_bird text default 'volt', p_mode text default 'endless') returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform public.submit_score(p_score, p_gates, p_mode, to_char(now() at time zone 'utc', 'YYYY-MM-DD'), p_bird, 'Tester', 'KR', 'ko');
  return 'accepted';
exception when others then return 'refused: ' || sqlerrm;
end $$;
create function pg_temp.must(p_got text, p_want text, p_what text) returns void language plpgsql as $$
begin
  if p_got not like p_want then raise exception '%: want %, got %', p_what, p_want, p_got; end if;
end $$;
grant execute on function pg_temp.u(text), pg_temp.try(uuid, int, int, text, text), pg_temp.must(text, text, text) to authenticated;

insert into auth.users (id, created_at, is_anonymous) values
  (pg_temp.u('a1'), now() - interval '10 minutes', false),   -- a real player, one run after sign-in
  (pg_temp.u('a2'), now() - interval '2 days',     false),   -- an old account, plenty of time budget
  (pg_temp.u('a3'), now() - interval '2 days',     false),   -- a tester (the owner's QA account)
  (pg_temp.u('a4'), now() - interval '2 days',     false),   -- a forger inside a realistic gate count
  (pg_temp.u('a5'), now() - interval '2 days',     false),   -- a player sending an unreleased unit
  (pg_temp.u('a6'), now() - interval '30 seconds', false),   -- a new account: 30 + 30 s x 4 = 150 gates of budget
  (pg_temp.u('a7'), now() - interval '2 days',     false),   -- a long real run near the cap
  (pg_temp.u('c1'), now() - interval '1 minute',   true),    -- a fresh guest
  (pg_temp.u('c2'), now() - interval '1 hour',     true),    -- a guest older than 10 minutes
  (pg_temp.u('c3'), now() - interval '2 minutes',  true),    -- another fresh guest
  (pg_temp.u('b1'), now() - interval '2 days',     false);   -- an aged account that fills the global caps
insert into private.fw_testers (player_id, note) values (pg_temp.u('a3'), 'rehearsal');

\echo === 1. server constants: open rank 4, unreleased ranks get no share of the bound ===
do $$ begin
  if private.fw_tier_open() <> 4 then raise exception 'fw_tier_open must be 4 (TIER_OPEN in index.html)'; end if;
  if private.fw_unit_rank('omega') <> 9 or private.fw_unit_rank('seraph') <> 5 or private.fw_unit_rank('pulsar') <> 0 then raise exception 'fw_unit_rank'; end if;
  if private.fw_bound_mul('omega') <> 1 or private.fw_bound_mul('seraph') <> 1 or private.fw_bound_mul('volt') <> 1 then raise exception 'fw_bound_mul: x1 while the rank is closed'; end if;
end $$;

set role authenticated;
\echo === 2. the gate cap: 1,500 gates refused even with days of time budget, 400 accepted ===
select pg_temp.try(pg_temp.u('a2'), 1000, 1500) as gates_1500;
select pg_temp.must(pg_temp.try(pg_temp.u('a2'), 1000, 1500), 'refused: fw_bad_input%', '1500 gates');
select pg_temp.must(pg_temp.try(pg_temp.u('a2'), 1000, 401), 'refused: fw_bad_input%', '401 gates');
select pg_temp.must(pg_temp.try(pg_temp.u('a7'), 9000, 400), 'accepted', '400 gates, a long real run');

\echo === 3. the time budget: 4 gates a second plus 30 ===
select pg_temp.must(pg_temp.try(pg_temp.u('a6'), 500, 175), 'refused: fw_implausible: more gates than the time%', '175 gates 30 s after sign-in');
select pg_temp.must(pg_temp.try(pg_temp.u('a6'), 500, 140), 'accepted', '140 gates 30 s after sign-in');

\echo === 4. a realistic run (112 gates, 2,500 points) is accepted and public ===
select pg_temp.try(pg_temp.u('a1'), 2500, 112) as real_run;
select pg_temp.must(pg_temp.try(pg_temp.u('a1'), 2500, 112), 'refused: %', 'the same 112 gates again at once (no time since the last submit)');

\echo === 5. the soft limit: 112 gates, 20,000 points (0.43 of the bound 46,032) is stored hidden ===
select pg_temp.must(pg_temp.try(pg_temp.u('a4'), 20000, 112), 'accepted', 'over the soft limit, under the hard bound');
select pg_temp.must(pg_temp.try(pg_temp.u('a2'), 46033, 112), 'refused: fw_implausible: score too high%', 'over the hard bound');
select pg_temp.must(pg_temp.try(pg_temp.u('a2'), 18412, 112), 'accepted', 'just under the soft limit (0.4 x 46,032 = 18,412.8)');

\echo === 6. unreleased units: omega refused for a player, allowed for a tester at the x1 bound ===
select pg_temp.try(pg_temp.u('a5'), 2500, 112, 'omega') as omega_player;
select pg_temp.must(pg_temp.try(pg_temp.u('a5'), 2500, 112, 'omega'), 'refused: fw_bad_input: unit not released', 'omega, not a tester');
select pg_temp.must(pg_temp.try(pg_temp.u('a5'), 2500, 112, 'seraph', 'daily'), 'refused: fw_bad_input: unit not released', 'seraph in daily, not a tester');
select pg_temp.must(pg_temp.try(pg_temp.u('a3'), 50000, 112, 'omega'), 'refused: fw_implausible%', 'tester: the x1.9 share is closed (50,000 > 46,032)');
select pg_temp.must(pg_temp.try(pg_temp.u('a3'), 2500, 112, 'omega'), 'accepted', 'tester flying omega');
reset role;

\echo === 7. what other players see ===
do $$
declare n int;
begin
  if (select hidden from public.fw_scores where player_id = pg_temp.u('a1')) then raise exception 'the realistic run must not be hidden'; end if;
  if not (select hidden from public.fw_scores where player_id = pg_temp.u('a4')) then raise exception 'the soft-limit row must be hidden'; end if;
  if (select hidden from public.fw_scores where player_id = pg_temp.u('a2')) then raise exception 'just under the soft limit: visible'; end if;
  if (select best from public.fw_scores where player_id = pg_temp.u('a4')) <> 20000 then raise exception 'the hidden row keeps its score for review'; end if;
  if exists (select 1 from public.fw_scores where player_id = pg_temp.u('a5')) then raise exception 'a refused unit leaves no row'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.u('a1')::text, false) \g /dev/null
select nick, best from public.fw_scores order by best desc;   -- what player a1 sees: no 20,000
do $$ begin
  if not exists (select 1 from public.fw_scores where player_id = pg_temp.u('a1')) then raise exception 'a1 sees its own realistic run'; end if;
  if exists (select 1 from public.fw_scores where best = 20000) then raise exception 'the soft-limit row must not be public'; end if;
end $$;
select set_config('request.jwt.claim.sub', pg_temp.u('a4')::text, false) \g /dev/null
do $$ begin
  if not exists (select 1 from public.fw_scores where player_id = pg_temp.u('a4')) then raise exception 'a hidden player still sees its own row'; end if;
end $$;
-- a later honest submit does not un-hide it
reset role;
update public.fw_scores set last_submit_at = now() - interval '1 hour' where player_id = pg_temp.u('a4');
set role authenticated;
select pg_temp.must(pg_temp.try(pg_temp.u('a4'), 300, 50), 'accepted', 'an honest run after the soft-limit one');
reset role;
do $$ begin
  if not (select hidden from public.fw_scores where player_id = pg_temp.u('a4')) then raise exception 'still hidden after an honest run'; end if;
end $$;

\echo === 8. track: purchase is refused from clients ===
set role authenticated;
do $$
declare r int; sid text := 'abcdefgh12345678';
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a1')::text, true);
  r := public.track(jsonb_build_array(jsonb_build_object('k', 'purchase', 's', sid, 'p', jsonb_build_object('sku', 'x')),
                                      jsonb_build_object('k', 'run_end', 's', sid)), 'L1');
  if r <> 1 then raise exception 'purchase dropped, run_end kept: got %', r; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from private.fw_events where kind = 'purchase') then raise exception 'a client purchase event must not be stored'; end if;
end $$;

\echo === 9. fresh guests: 60 events and 3 errors an hour; older guests the normal caps ===
set role authenticated;
do $$
declare r int; b boolean; sid text := 'abcdefgh12345678';
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('c1')::text, true);
  r := public.track((select jsonb_agg(jsonb_build_object('k', 'run_end', 's', sid)) from generate_series(1, 50)), 'L1');
  if r <> 50 then raise exception 'fresh guest: first 50, got %', r; end if;
  r := public.track((select jsonb_agg(jsonb_build_object('k', 'run_end', 's', sid)) from generate_series(1, 50)), 'L1');
  if r <> 10 then raise exception 'fresh guest: 60 an hour leaves 10, got %', r; end if;
  for i in 1..3 loop b := public.report_error('g' || i, null, 'L1', '/', 'ua', null); if b is not true then raise exception 'fresh guest error % stored', i; end if; end loop;
  b := public.report_error('g4', null, 'L1', '/', 'ua', null); if b is not false then raise exception 'fresh guest: the 4th error of the hour is refused'; end if;

  perform set_config('request.jwt.claim.sub', pg_temp.u('c2')::text, true);
  for i in 1..2 loop r := public.track((select jsonb_agg(jsonb_build_object('k', 'run_end', 's', sid)) from generate_series(1, 50)), 'L1'); end loop;
  if r <> 50 then raise exception 'an older guest has the normal cap of 300, got %', r; end if;
  for i in 1..4 loop b := public.report_error('o' || i, null, 'L1', '/', 'ua', null); end loop;
  if b is not true then raise exception 'an older guest has the normal error cap of 10'; end if;
end $$;
reset role;

\echo === 10. the global caps: full of aged rows, a fresh guest still reports; fresh-guest rows are not counted ===
-- g1's 60 events and 3 errors are already in the hour; fill the rest with an aged account's rows
insert into private.fw_events (player_id, kind, session)
select pg_temp.u('b1'), 'run_end', 'abcdefgh12345678' from generate_series(1, 20000 - (select count(*)::int from private.fw_events e where e.player_id <> pg_temp.u('c1')));
insert into private.fw_client_errors (player_id, build, msg)
select pg_temp.u('b1'), 'L1', 'fill' from generate_series(1, 500 - (select count(*)::int from private.fw_client_errors e where e.player_id is distinct from pg_temp.u('c1')));
set role authenticated;
do $$
declare r int; b boolean; sid text := 'abcdefgh12345678';
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a2')::text, true);
  r := public.track(jsonb_build_array(jsonb_build_object('k', 'share', 's', sid)), 'L1');
  if r <> 0 then raise exception 'at the global cap (20,000 counted rows) nothing is stored, got %', r; end if;
  b := public.report_error('over', null, 'L1', '/', 'ua', null); if b is not false then raise exception 'at the global error cap (500) nothing is stored'; end if;

  perform set_config('request.jwt.claim.sub', pg_temp.u('c3')::text, true);
  r := public.track((select jsonb_agg(jsonb_build_object('k', 'first_open', 's', sid)) from generate_series(1, 5)), 'L1');
  if r <> 5 then raise exception 'a fresh guest does not wait on the global cap, got %', r; end if;
  b := public.report_error('fresh', null, 'L1', '/', 'ua', null); if b is not true then raise exception 'a fresh guest error is stored at the global cap'; end if;
end $$;
reset role;
delete from private.fw_events where id in (select id from private.fw_events where player_id = pg_temp.u('b1') limit 10);
set role authenticated;
do $$
declare r int;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a2')::text, true);
  r := public.track((select jsonb_agg(jsonb_build_object('k', 'share', 's', 'abcdefgh12345678')) from generate_series(1, 50)), 'L1');
  if r <> 10 then raise exception '10 slots free: the 65 fresh-guest rows are not counted, got %', r; end if;
end $$;
reset role;

\echo === 11. grants: the new helpers are not callable by the API roles ===
do $$ begin
  if has_function_privilege('authenticated', 'private.fw_tier_open()', 'execute') or has_function_privilege('authenticated', 'private.fw_unit_rank(text)', 'execute')
     or has_function_privilege('authenticated', 'private.fw_fresh_guest(uuid)', 'execute') or has_function_privilege('anon', 'private.fw_fresh_guest(uuid)', 'execute') then
    raise exception 'helpers must not be executable by the API roles';
  end if;
end $$;
select 'PASS score-bound.sql' as result;
