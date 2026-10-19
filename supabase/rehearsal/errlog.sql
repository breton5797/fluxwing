-- Client error reports rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/errlog.sql).
-- public.report_error() stores a capped row for the caller, truncates what it stores, refuses the 11th report of an
-- hour from one player and anything without a user, and the API roles can reach the public wrapper only.
\set ON_ERROR_STOP on
\pset footer off

\echo === report_error: stored, truncated, capped ===
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000e1'), ('00000000-0000-4000-8000-0000000000e2');
do $$
declare r boolean; n int; row private.fw_client_errors;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  r := public.report_error('boom', null, 'L1', '/', 'ua', null); if r is not false then raise exception 'no user must read false'; end if;
  select count(*) into n from private.fw_client_errors; if n <> 0 then raise exception 'no user must store nothing'; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e1', true);
  r := public.report_error(repeat('m', 400) || E'\n\n  tail', repeat('s', 3000), repeat('b', 80), '/' || repeat('p', 300), repeat('u', 300), '{"state":"menu"}'::jsonb);
  if r is not true then raise exception 'a signed-in report must read true'; end if;
  select * into row from private.fw_client_errors order by id desc limit 1;
  if row.player_id <> '00000000-0000-4000-8000-0000000000e1' then raise exception 'the row carries the caller'; end if;
  if length(row.msg) <> 300 or row.msg like '%  %' then raise exception 'msg must be whitespace-collapsed and cut to 300, got %', length(row.msg); end if;
  if length(row.stack) <> 2000 or length(row.build) <> 40 or length(row.url) <> 200 or length(row.ua) <> 200 then raise exception 'stack/build/url/ua must be cut'; end if;
  if row.extra <> '{"state":"menu"}'::jsonb then raise exception 'a small object is kept as extra'; end if;

  r := public.report_error('', 'x', 'L1', '/', 'ua', null); if r is not false then raise exception 'an empty message must read false'; end if;
  r := public.report_error('arr', null, 'L1', '/', 'ua', '[1,2]'::jsonb); if r is not true then raise exception 'array extra: still stored'; end if;
  select * into row from private.fw_client_errors order by id desc limit 1;
  if row.extra is not null then raise exception 'a non-object extra is dropped'; end if;
  r := public.report_error('big', null, 'L1', '/', 'ua', jsonb_build_object('k', repeat('z', 600))); if r is not true then raise exception 'big extra: still stored'; end if;
  select * into row from private.fw_client_errors order by id desc limit 1;
  if row.extra is not null then raise exception 'an oversized extra is dropped'; end if;

  for i in 1..7 loop r := public.report_error('n' || i, null, 'L1', '/', 'ua', null); if r is not true then raise exception 'report % within the hourly cap must be stored', i; end if; end loop;
  r := public.report_error('eleventh', null, 'L1', '/', 'ua', null); if r is not false then raise exception 'the 11th report of the hour must read false'; end if;
  select count(*) into n from private.fw_client_errors where player_id = '00000000-0000-4000-8000-0000000000e1'; if n <> 10 then raise exception 'ten rows for the player, got %', n; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000e2', true);
  r := public.report_error('other player', null, 'L1', '/', 'ua', null); if r is not true then raise exception 'the cap is per player'; end if;

  delete from auth.users where id = '00000000-0000-4000-8000-0000000000e2';
  select * into row from private.fw_client_errors order by id desc limit 1;
  if row.player_id is not null then raise exception 'a deleted account leaves the report without a player'; end if;
end $$;
select has_function_privilege('authenticated', 'public.report_error(text, text, text, text, text, jsonb)', 'execute') as authenticated_can_call,
       has_function_privilege('anon', 'public.report_error(text, text, text, text, text, jsonb)', 'execute') as anon_can_call,
       has_function_privilege('authenticated', 'private.fw_report_error(text, text, text, text, text, jsonb)', 'execute') as private_reachable_directly,
       has_table_privilege('authenticated', 'private.fw_client_errors', 'select') as authenticated_reads_table;
do $$ begin
  if not has_function_privilege('authenticated', 'public.report_error(text, text, text, text, text, jsonb)', 'execute') then raise exception 'authenticated must be able to call report_error'; end if;
  if has_function_privilege('anon', 'public.report_error(text, text, text, text, text, jsonb)', 'execute') then raise exception 'anon must not call report_error'; end if;
  if has_function_privilege('authenticated', 'private.fw_report_error(text, text, text, text, text, jsonb)', 'execute') then raise exception 'the private function must not be reachable directly'; end if;
  if has_table_privilege('authenticated', 'private.fw_client_errors', 'select') then raise exception 'the table must not be readable by the API roles'; end if;
end $$;
select 'PASS errlog.sql' as result;
