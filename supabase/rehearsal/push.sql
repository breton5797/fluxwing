-- Push rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/push.sql).
-- As the API role: register / move / cap / unregister device tokens, the refusals (no user, a bad token), that a player cannot drop
-- tokens (push_drop is the function's), that the feed still works with a device registered when pg_net is absent (the hook stays
-- quiet), and that deleting the account takes the tokens along. Setup is done as the database owner.
\set ON_ERROR_STOP on
\pset footer off

create function pg_temp.u(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.tok(p text) returns text language sql immutable as $$ select repeat(p, 64) $$;
insert into auth.users (id, created_at) values (pg_temp.u('a'), now() - interval '9 days'), (pg_temp.u('b'), now() - interval '9 days');
insert into public.fw_scores (player_id, nick, best) values (pg_temp.u('a'), 'Ann', 10), (pg_temp.u('b'), 'Bob', 20);
insert into public.fw_friends (a, b) values (pg_temp.u('a'), pg_temp.u('b'));
grant execute on function pg_temp.u(text) to authenticated;
grant execute on function pg_temp.tok(text) to authenticated;

\echo === register, refusals, cap, move, unregister, as authenticated ===
set role authenticated;
do $$
declare ok boolean; sub constant text := 'request.jwt.claim.sub';
begin
  perform set_config(sub, '', true);
  ok := false; begin perform public.push_register(pg_temp.tok('1'), '{}', 'ko'); exception when others then ok := sqlerrm like 'fw_auth%'; end;
  if not ok then raise exception 'no user must be refused with fw_auth'; end if;

  perform set_config(sub, pg_temp.u('b')::text, true);
  ok := false; begin perform public.push_register('not-a-token', '{}', 'ko'); exception when others then ok := sqlerrm like 'fw_bad_input%'; end;
  if not ok then raise exception 'a bad token must be refused with fw_bad_input'; end if;
  if not public.push_register(pg_temp.tok('1'), '{"on": false, "best": true}', 'ko') then raise exception 'register must answer true'; end if;
  if not public.push_register(pg_temp.tok('1'), '{"on": false}', 'xx-bad') then raise exception 'registering again updates'; end if;
  for g in 2..7 loop perform public.push_register(pg_temp.tok(g::text), '{}', 'en'); end loop;   -- 7 devices registered, 5 kept

  ok := false; begin perform public.push_drop(array[pg_temp.tok('2')]); exception when others then ok := sqlstate = '42501'; end;
  if not ok then raise exception 'a player must not reach push_drop'; end if;

  perform set_config(sub, pg_temp.u('a')::text, true);
  perform public.push_register(pg_temp.tok('7'), '{}', 'ja');   -- the same device signs in as another player: it moves
  if public.push_unregister(pg_temp.tok('6')) then raise exception 'a player cannot remove another player''s token'; end if;
end $$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from private.fw_push where player_id = pg_temp.u('b');
  if n <> 4 then raise exception 'b keeps the newest 5 minus the one that moved, got %', n; end if;
  if (select player_id from private.fw_push where token = pg_temp.tok('7')) <> pg_temp.u('a') then raise exception 'the token moved to a'; end if;
  if exists (select 1 from private.fw_push where token = pg_temp.tok('1')) then raise exception 'the oldest device left over the cap'; end if;
  if (select lang from private.fw_push where token = pg_temp.tok('7')) <> 'ja' then raise exception 'lang is stored'; end if;
end $$;

\echo === the feed keeps working with devices registered and no pg_net (the hook stays quiet) ===
set role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.u('a')::text, false);
select (public.social_hello(0) ->> 'max') is not null as hello_ok;
reset role;
do $$
begin
  if not exists (select 1 from private.fw_social_feed where to_id = pg_temp.u('b') and from_id = pg_temp.u('a') and kind = 'on') then
    raise exception 'the hello must still write the feed row for b';
  end if;
end $$;

\echo === unregister, then delete_me takes the rest along ===
set role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.u('a')::text, false);
select public.push_unregister(pg_temp.tok('7')) as unregistered;
select set_config('request.jwt.claim.sub', pg_temp.u('b')::text, false);
select public.delete_me() as deleted;
reset role;
do $$
begin
  if exists (select 1 from private.fw_push) then raise exception 'no tokens may remain'; end if;
  if has_function_privilege('authenticated', 'public.push_drop(text[])', 'execute') then raise exception 'push_drop is the function''s'; end if;
  if has_function_privilege('anon', 'public.push_register(text, jsonb, text)', 'execute') then raise exception 'anon must not register'; end if;
end $$;
\echo === push rehearsal: all checks passed ===
