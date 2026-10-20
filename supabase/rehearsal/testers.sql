-- Tester flag rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/testers.sql).
-- public.tester_me() answers true only for a row in private.fw_testers that matches the caller's own id: another
-- player gets false, a call without a user gets false, and the API roles can reach the public wrapper only.
\set ON_ERROR_STOP on
\pset footer off

\echo === testers: the flag is a server row, not the nickname ===
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000a2');
insert into private.fw_testers (player_id, note) values ('00000000-0000-4000-8000-0000000000a1', 'rehearsal');
do $$
declare r boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  r := public.tester_me(); if r is not true then raise exception 'the flagged player should read true'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
  r := public.tester_me(); if r is not false then raise exception 'another player should read false'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  r := public.tester_me(); if r is not false then raise exception 'no user should read false'; end if;
  delete from private.fw_testers where player_id = '00000000-0000-4000-8000-0000000000a1';
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  r := public.tester_me(); if r is not false then raise exception 'a removed row should read false'; end if;
end $$;
select has_function_privilege('authenticated', 'public.tester_me()', 'execute') as authenticated_can_call,
       has_function_privilege('anon', 'public.tester_me()', 'execute') as anon_can_call,
       has_function_privilege('authenticated', 'private.fw_tester_me()', 'execute') as authenticated_can_run_private;
do $$ begin
  if not has_function_privilege('authenticated', 'public.tester_me()', 'execute') then raise exception 'authenticated must be able to call tester_me'; end if;
  if has_function_privilege('anon', 'public.tester_me()', 'execute') then raise exception 'anon must not call tester_me'; end if;
  if not has_function_privilege('authenticated', 'private.fw_tester_me()', 'execute') then raise exception 'the invoker wrapper needs execute on the private function (production answered 403 on 2026-10-20)'; end if;
end $$;
-- As the API role itself, not the superuser: the wrapper must run end to end (this is what the 403 broke)
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000a3');
insert into private.fw_testers (player_id, note) values ('00000000-0000-4000-8000-0000000000a3', 'rehearsal as authenticated');
set role authenticated;
do $$
declare r boolean;
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a3', true);
  r := public.tester_me(); if r is not true then raise exception 'as authenticated: the flagged player should read true'; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a2', true);
  r := public.tester_me(); if r is not false then raise exception 'as authenticated: another player should read false'; end if;
end $$;
reset role;
select 'PASS testers.sql' as result;
