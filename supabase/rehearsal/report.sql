-- Report rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/report.sql).
-- Walks public.report_player AS THE API ROLE (set role authenticated, the caller's id in request.jwt.claim.sub): the refusals
-- (no user, yourself, a bad reason / place / player), one report a target and reason a day ('dup'), the auto-hide after three
-- qualified 'name' reports of the same name (guests, fresh accounts, players without a best, other reasons and impersonation
-- reports, where the name seen is not the server's, do not count), the day cap, that anon cannot call it, and the cascade of an
-- account deletion (delete_me). Setup is done as the database owner.
\set ON_ERROR_STOP on
\pset footer off

-- Supabase's auth.users has is_anonymous (a guest); the shared stub does not, so this script adds it
alter table auth.users add column if not exists is_anonymous boolean not null default false;

-- ids: t = the reported player, r1..r5 = old signed-in players with a best, g = an old guest with a best, f = a fresh account
-- with a best, e = an old account without a best, x01..x20 = other targets for the day cap
create function pg_temp.u(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
insert into auth.users (id, created_at) values (pg_temp.u('7'), now() - interval '9 days'), (pg_temp.u('f'), now()), (pg_temp.u('e'), now() - interval '9 days');
insert into auth.users (id, created_at, is_anonymous) values (pg_temp.u('9'), now() - interval '9 days', true);
insert into auth.users (id, created_at) select pg_temp.u('1' || g), now() - interval '9 days' from generate_series(1, 5) g;
insert into auth.users (id) select pg_temp.u('20' || lpad(g::text, 2, '0')) from generate_series(1, 20) g;
insert into public.fw_scores (player_id, nick, best) values (pg_temp.u('7'), 'BadName', 50), (pg_temp.u('f'), 'Fresh', 10), (pg_temp.u('9'), 'Guest', 10);
insert into public.fw_scores (player_id, nick, best) select pg_temp.u('1' || g), 'R' || g, 10 + g from generate_series(1, 5) g;
insert into public.fw_versus (player_id, nick, rp, wins) values (pg_temp.u('7'), 'BadName', 30, 1);
grant execute on function pg_temp.u(text) to authenticated;

\echo === refusals and dup, as authenticated ===
set role authenticated;
do $$
declare
  T uuid := pg_temp.u('7'); R1 uuid := pg_temp.u('11'); r jsonb; ok boolean;
  sub constant text := 'request.jwt.claim.sub';
begin
  perform set_config(sub, '', true);
  ok := false; begin perform public.report_player(T, 'name', 'board', 'BadName'); exception when others then ok := sqlerrm like 'fw_auth%'; end;
  if not ok then raise exception 'no user must be refused with fw_auth'; end if;

  perform set_config(sub, T::text, true);
  ok := false; begin perform public.report_player(T, 'name', 'board', 'BadName'); exception when others then ok := sqlerrm like 'fw_report_self%'; end;
  if not ok then raise exception 'reporting yourself must be refused with fw_report_self'; end if;

  perform set_config(sub, R1::text, true);
  ok := false; begin perform public.report_player(T, 'rude', 'board', 'BadName'); exception when others then ok := sqlerrm like 'fw_bad_input%'; end;
  if not ok then raise exception 'an unknown reason must be refused with fw_bad_input'; end if;
  ok := false; begin perform public.report_player(T, 'name', 'lobby', 'BadName'); exception when others then ok := sqlerrm like 'fw_bad_input%'; end;
  if not ok then raise exception 'an unknown place must be refused with fw_bad_input'; end if;
  ok := false; begin perform public.report_player(gen_random_uuid(), 'name', 'board', 'x'); exception when others then ok := sqlerrm like 'fw_bad_input%'; end;
  if not ok then raise exception 'an unknown player must be refused with fw_bad_input'; end if;

  r := public.report_player(T, 'name', 'board', 'BadName');
  if r ->> 'status' <> 'ok' then raise exception 'first report: ok expected, got %', r; end if;
  r := public.report_player(T, 'name', 'versus', 'BadName');
  if r ->> 'status' <> 'dup' then raise exception 'the same reason again the same day: ''dup'' expected, got %', r; end if;
  r := public.report_player(T, 'cheat', 'versus', 'BadName');
  if r ->> 'status' <> 'ok' then raise exception 'another reason the same day is a new report, got %', r; end if;
end $$;
reset role;
do $$
begin
  if (select nick from private.fw_reports where reporter_id = pg_temp.u('11') and reason = 'name') <> 'BadName' then raise exception 'nick must be the server''s copy'; end if;
  if (select count(*) from private.fw_reports) <> 2 then raise exception 'two rows after the refusals and the dup'; end if;
end $$;

\echo === auto-hide: only qualified name reports of the name the server has count ===
set role authenticated;
do $$
declare T uuid := pg_temp.u('7'); sub constant text := 'request.jwt.claim.sub';
begin
  perform set_config(sub, pg_temp.u('f')::text, true); perform public.report_player(T, 'name', 'board', 'BadName');    -- fresh account
  perform set_config(sub, pg_temp.u('e')::text, true); perform public.report_player(T, 'name', 'friend', 'BadName');   -- no best
  perform set_config(sub, pg_temp.u('9')::text, true); perform public.report_player(T, 'name', 'board', 'BadName');    -- a guest (is_anonymous)
  perform set_config(sub, pg_temp.u('15')::text, true); perform public.report_player(T, 'name', 'versus', 'Rude!!');   -- impersonation: saw another name
  perform set_config(sub, pg_temp.u('13')::text, true); perform public.report_player(T, 'cheat', 'board', 'BadName');  -- another reason
  perform set_config(sub, pg_temp.u('12')::text, true); perform public.report_player(T, 'name', 'versus', 'BadName');  -- qualified #2
end $$;
reset role;
do $$
begin
  if (select hidden from public.fw_scores where player_id = pg_temp.u('7')) then raise exception 'two qualified name reports must not hide yet'; end if;
  if (select seen from private.fw_reports where reporter_id = pg_temp.u('15')) <> 'Rude!!' then raise exception 'the seen name is kept for review'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.u('14')::text, false);
select public.report_player(pg_temp.u('7'), 'name', 'board', 'BadName') ->> 'status' as third_qualified;
reset role;
do $$
begin
  if not (select hidden from public.fw_scores where player_id = pg_temp.u('7')) then raise exception 'three qualified name reports must hide the board row'; end if;
  if not (select hidden from public.fw_versus where player_id = pg_temp.u('7')) then raise exception 'three qualified name reports must hide the versus row'; end if;
  if (select hidden from public.fw_scores where player_id = pg_temp.u('11')) then raise exception 'nobody else is hidden'; end if;
end $$;

\echo === day cap: 20 reports a reporter a UTC day ===
set role authenticated;
do $$
declare ok boolean; sub constant text := 'request.jwt.claim.sub';
begin
  perform set_config(sub, pg_temp.u('11')::text, true);   -- already 2 reports today
  for g in 1..18 loop perform public.report_player(pg_temp.u('20' || lpad(g::text, 2, '0')), 'other', 'board', ''); end loop;
  ok := false; begin perform public.report_player(pg_temp.u('2020'), 'other', 'board', ''); exception when others then ok := sqlerrm like 'fw_rate_limited%'; end;
  if not ok then raise exception 'the 21st report of the day must be refused with fw_rate_limited'; end if;
end $$;
reset role;

\echo === grants: anon cannot call it, the private function and the table are out of reach ===
do $$
begin
  if has_function_privilege('anon', 'public.report_player(uuid, text, text, text)', 'execute') then raise exception 'anon must not run report_player'; end if;
  if not has_function_privilege('authenticated', 'public.report_player(uuid, text, text, text)', 'execute') then raise exception 'authenticated runs report_player'; end if;
  if has_function_privilege('authenticated', 'private.fw_rpt_cfg()', 'execute') then raise exception 'fw_rpt_cfg is internal'; end if;
  if has_table_privilege('authenticated', 'private.fw_reports', 'select') then raise exception 'reports are not readable by players'; end if;
end $$;

\echo === delete_me takes the reporter rows along ===
set role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.u('11')::text, false);
select public.delete_me() as deleted;
reset role;
do $$
begin
  if exists (select 1 from private.fw_reports where reporter_id = pg_temp.u('11')) then raise exception 'delete_me must remove the reporter rows'; end if;
  if not exists (select 1 from private.fw_reports where reporter_id = pg_temp.u('12')) then raise exception 'other reports stay'; end if;
end $$;
\echo === report rehearsal: all checks passed ===
