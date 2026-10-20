-- Account deletion rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/delete-me.sql).
-- public.delete_me() removes the caller's own auth.users row and nothing else: the game rows go with it by cascade,
-- another player's rows stay, a call without a user does nothing, and the API roles can reach the public wrapper only.
\set ON_ERROR_STOP on
\pset footer off

\echo === delete_me: the caller and their rows go, the neighbour stays ===
insert into auth.users (id) values ('00000000-0000-4000-8000-0000000000d1'), ('00000000-0000-4000-8000-0000000000d2');
insert into public.fw_scores (player_id, nick, best) values ('00000000-0000-4000-8000-0000000000d1', 'gone', 10), ('00000000-0000-4000-8000-0000000000d2', 'stays', 20);
insert into public.fw_saves (player_id, rev, data) values ('00000000-0000-4000-8000-0000000000d1', 1, '{}'), ('00000000-0000-4000-8000-0000000000d2', 1, '{}');
insert into private.fw_testers (player_id, note) values ('00000000-0000-4000-8000-0000000000d1', 'rehearsal');
do $$
declare r boolean; n int;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  r := public.delete_me(); if r is not false then raise exception 'no user: nothing to delete, must read false'; end if;
  select count(*) into n from auth.users; if n <> 2 then raise exception 'no user: nothing may be deleted'; end if;

  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000d1', true);
  r := public.delete_me(); if r is not true then raise exception 'the caller should read true'; end if;
  select count(*) into n from auth.users where id = '00000000-0000-4000-8000-0000000000d1'; if n <> 0 then raise exception 'the auth row must be gone'; end if;
  select count(*) into n from public.fw_scores where player_id = '00000000-0000-4000-8000-0000000000d1'; if n <> 0 then raise exception 'scores must cascade'; end if;
  select count(*) into n from public.fw_saves where player_id = '00000000-0000-4000-8000-0000000000d1'; if n <> 0 then raise exception 'the save must cascade'; end if;
  select count(*) into n from private.fw_testers where player_id = '00000000-0000-4000-8000-0000000000d1'; if n <> 0 then raise exception 'the tester row must cascade'; end if;
  select count(*) into n from public.fw_scores where player_id = '00000000-0000-4000-8000-0000000000d2'; if n <> 1 then raise exception 'the neighbour must keep their score'; end if;
  select count(*) into n from auth.users where id = '00000000-0000-4000-8000-0000000000d2'; if n <> 1 then raise exception 'the neighbour must keep their account'; end if;

  r := public.delete_me(); if r is not false then raise exception 'a second call for a gone account must read false'; end if;
end $$;
select has_function_privilege('authenticated', 'public.delete_me()', 'execute') as authenticated_can_call,
       has_function_privilege('anon', 'public.delete_me()', 'execute') as anon_can_call,
       has_function_privilege('authenticated', 'private.fw_delete_me()', 'execute') as private_reachable_directly;
do $$ begin
  if not has_function_privilege('authenticated', 'public.delete_me()', 'execute') then raise exception 'authenticated must be able to call delete_me'; end if;
  if has_function_privilege('anon', 'public.delete_me()', 'execute') then raise exception 'anon must not call delete_me'; end if;
  if has_function_privilege('authenticated', 'private.fw_delete_me()', 'execute') then raise exception 'the private function must not be reachable directly'; end if;
end $$;
select 'PASS delete-me.sql' as result;
