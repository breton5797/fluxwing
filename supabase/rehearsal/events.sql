-- Product events rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/events.sql).
-- public.track() stores a batch for the caller AS THE API ROLE (authenticated, not the superuser: a missing grant on the
-- private function answered 403 in production on 2026-10-20), skips malformed elements, drops oversized props, caps a
-- call at 50 and a player at 300 an hour, refuses a call without a user, and the rows go with the account.
\set ON_ERROR_STOP on
\pset footer off

\echo === grants: the API roles reach the public wrapper only ===
do $$ begin
  if not has_function_privilege('authenticated', 'public.track(jsonb, text)', 'execute') then raise exception 'authenticated must be able to call track'; end if;
  if has_function_privilege('anon', 'public.track(jsonb, text)', 'execute') then raise exception 'anon must not call track'; end if;
  if has_function_privilege('anon', 'private.fw_track(jsonb, text)', 'execute') then raise exception 'anon must not run the private function'; end if;
  if not has_function_privilege('authenticated', 'private.fw_track(jsonb, text)', 'execute') then raise exception 'the invoker wrapper needs execute on the private function (production answered 403 on 2026-10-20)'; end if;
  if has_table_privilege('authenticated', 'private.fw_events', 'select') or has_table_privilege('authenticated', 'private.fw_events', 'insert') then raise exception 'the table must not be reachable by the API roles'; end if;
end $$;

\echo === track as authenticated: stored, validated, capped ===
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000f1'), ('00000000-0000-4000-8000-0000000000f2');
set role authenticated;
do $$
declare r int; sid text := 'abcdefgh12345678';
begin
  perform set_config('request.jwt.claim.sub', '', true);
  r := public.track(jsonb_build_array(jsonb_build_object('k', 'session_start', 's', sid)), 'L1'); if r <> 0 then raise exception 'no user must store nothing, got %', r; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000f1', true);
  r := public.track(jsonb_build_array(
    jsonb_build_object('k', 'first_open', 's', sid, 'p', null),
    jsonb_build_object('k', 'session_start', 's', sid),
    jsonb_build_object('k', 'run_end', 's', sid, 'p', jsonb_build_object('mode', 'endless', 'score', 12, 'stage', 1)),
    jsonb_build_object('k', 'share', 's', sid, 'p', jsonb_build_object('big', repeat('z', 1100))),
    jsonb_build_object('k', 'share', 's', sid, 'p', '[1,2]'::jsonb),
    jsonb_build_object('k', 'hack', 's', sid),
    jsonb_build_object('k', 'run_end', 's', 'BAD SESSION'),
    jsonb_build_object('k', 'run_end'),
    '"not an object"'::jsonb), repeat('b', 80));
  if r <> 5 then raise exception 'five valid events of nine, got %', r; end if;
  r := public.track('{"k":"share"}'::jsonb, 'L1'); if r <> 0 then raise exception 'a non-array batch stores nothing'; end if;
  r := public.track(null, 'L1'); if r <> 0 then raise exception 'a null batch stores nothing'; end if;
  r := public.track((select jsonb_agg(jsonb_build_object('k', 'run_end', 's', sid)) from generate_series(1, 80)), 'L1');
  if r <> 50 then raise exception 'a call stores at most 50, got %', r; end if;
  for i in 1..5 loop r := public.track((select jsonb_agg(jsonb_build_object('k', 'run_end', 's', sid)) from generate_series(1, 50)), 'L1'); end loop;
  if r <> 45 then raise exception 'the hourly cap of 300 leaves 45 for the last call, got %', r; end if;
  r := public.track(jsonb_build_array(jsonb_build_object('k', 'share', 's', sid)), 'L1'); if r <> 0 then raise exception 'over the hourly cap nothing is stored'; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000f2', true);
  r := public.track(jsonb_build_array(jsonb_build_object('k', 'session_end', 's', sid, 'p', jsonb_build_object('dur', 91))), 'L1');
  if r <> 1 then raise exception 'the cap is per player'; end if;
end $$;
reset role;

\echo === stored rows, deletion with the account ===
do $$
declare n int; row private.fw_events;
begin
  select count(*) into n from private.fw_events where player_id = '00000000-0000-4000-8000-0000000000f1'; if n <> 300 then raise exception 'three hundred rows for the player, got %', n; end if;
  select * into row from private.fw_events where kind = 'run_end' and props is not null;
  if row.props <> '{"mode":"endless","score":12,"stage":1}'::jsonb or row.session <> 'abcdefgh12345678' or length(row.build) <> 40 then raise exception 'run_end row: props, session and a cut build'; end if;
  select count(*) into n from private.fw_events where kind = 'share' and props is null; if n <> 2 then raise exception 'oversized and array props are dropped, the events kept, got %', n; end if;
  select count(*) into n from private.fw_events where kind not in ('first_open', 'session_start', 'run_end', 'share', 'session_end'); if n <> 0 then raise exception 'an unknown kind is never stored'; end if;
  delete from auth.users where id = '00000000-0000-4000-8000-0000000000f1';
  select count(*) into n from private.fw_events where player_id = '00000000-0000-4000-8000-0000000000f1'; if n <> 0 then raise exception 'a deleted account takes its events with it'; end if;
  select count(*) into n from private.fw_events; if n <> 1 then raise exception 'the other player keeps theirs, got %', n; end if;
end $$;

\echo === the global hourly cap of 20,000 ===
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000f3');
insert into private.fw_events (player_id, kind, session) select '00000000-0000-4000-8000-0000000000f3', 'run_end', 'abcdefgh12345678' from generate_series(1, 19998);
set role authenticated;
do $$
declare r int;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000f2', true);
  r := public.track((select jsonb_agg(jsonb_build_object('k', 'share', 's', 'abcdefgh12345678')) from generate_series(1, 3)), 'L1');
  if r <> 1 then raise exception 'one slot left under the global cap, got %', r; end if;
  r := public.track(jsonb_build_array(jsonb_build_object('k', 'share', 's', 'abcdefgh12345678')), 'L1'); if r <> 0 then raise exception 'at the global cap nothing is stored'; end if;
end $$;
reset role;
delete from private.fw_events where player_id = '00000000-0000-4000-8000-0000000000f3';

\echo === kpi.sql on a seeded cohort: two installs 10 days ago (KST), one back on day 1 and day 7, sessions of 6 and 2 minutes ===
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000f4'), ('00000000-0000-4000-8000-0000000000f5');
insert into private.fw_events (player_id, kind, at, session, props)
select p::uuid, k, ((now() at time zone 'Asia/Seoul')::date - 10 + d + time '12:00') at time zone 'Asia/Seoul' + make_interval(secs => o), s, pr::jsonb
from (values
  ('00000000-0000-4000-8000-0000000000f4', 'first_open',    0, 0,   'aaaaaaaaaaaaaaa1', null),
  ('00000000-0000-4000-8000-0000000000f4', 'session_start', 0, 0,   'aaaaaaaaaaaaaaa1', null),
  ('00000000-0000-4000-8000-0000000000f4', 'tutorial_done', 0, 60,  'aaaaaaaaaaaaaaa1', '{"how":"tips"}'),
  ('00000000-0000-4000-8000-0000000000f4', 'run_end',       0, 90,  'aaaaaaaaaaaaaaa1', '{"mode":"endless","score":4,"stage":1}'),
  ('00000000-0000-4000-8000-0000000000f4', 'session_end',   0, 360, 'aaaaaaaaaaaaaaa1', '{"dur":360}'),
  ('00000000-0000-4000-8000-0000000000f4', 'session_start', 1, 0,   'aaaaaaaaaaaaaaa2', null),
  ('00000000-0000-4000-8000-0000000000f4', 'shop_buy',      1, 30,  'aaaaaaaaaaaaaaa2', '{"item":"g80","paid":false}'),
  ('00000000-0000-4000-8000-0000000000f4', 'session_start', 7, 0,   'aaaaaaaaaaaaaaa3', null),
  ('00000000-0000-4000-8000-0000000000f5', 'first_open',    0, 0,   'bbbbbbbbbbbbbbb1', null),
  ('00000000-0000-4000-8000-0000000000f5', 'session_start', 0, 0,   'bbbbbbbbbbbbbbb1', null),
  ('00000000-0000-4000-8000-0000000000f5', 'run_end',       0, 120, 'bbbbbbbbbbbbbbb1', '{"mode":"endless","score":1,"stage":1}')
) v(p, k, d, o, s, pr);
\ir ../checks/kpi.sql
select 'PASS events.sql' as result;
