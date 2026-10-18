-- Friends assertions — run in the Supabase SQL editor AS service_role (dashboard editor runs as postgres, fine).
-- Creates two throwaway auth users, exercises the RPCs via the private definer functions with a forged
-- auth.uid() (request.jwt.claim.sub), and raises on any wrong answer. Prints PASS at the end. Rolls back.
begin;
do $$
declare
  u1 uuid := gen_random_uuid();
  u2 uuid := gen_random_uuid();
  r jsonb; c1 text; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  insert into public.fw_scores (player_id, nick, best, gates, bird) values (u2, 'Bravo', 10, 5, 'volt');

  -- u1: code issued, self request refused
  perform set_config('request.jwt.claim.sub', u1::text, true); perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  r := private.fw_social_me();
  c1 := r->>'code';
  if c1 !~ '^[0-9A-HJKMNP-TV-Z]{8}$' then raise exception 'code shape: %', c1; end if;
  ok := false; begin perform private.fw_friend_request(c1, null); exception when others then ok := sqlerrm like 'fw_friend_self%'; end;
  if not ok then raise exception 'self request not refused'; end if;

  -- u1 -> u2 by uuid, then u2 sees the request and accepts
  r := private.fw_friend_request(null, u2);
  if r->>'status' <> 'sent' then raise exception 'send: %', r; end if;
  ok := false; begin perform private.fw_friend_request(null, u2); exception when others then ok := sqlerrm like 'fw_friend_dupe%'; end;
  if not ok then raise exception 'duplicate request not refused'; end if;

  perform set_config('request.jwt.claim.sub', u2::text, true); perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  r := private.fw_social_me();
  if jsonb_array_length(r->'reqs') <> 1 then raise exception 'u2 should see 1 request: %', r; end if;
  r := private.fw_friend_respond(u1, true);
  if r->>'status' <> 'friends' then raise exception 'accept: %', r; end if;
  r := private.fw_social_me();
  if jsonb_array_length(r->'friends') <> 1 then raise exception 'u2 friends: %', r; end if;

  -- symmetric view + dupe refused both ways
  perform set_config('request.jwt.claim.sub', u1::text, true); perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  r := private.fw_social_me();
  if jsonb_array_length(r->'friends') <> 1 or (r->'friends'->0->>'nick') <> 'Bravo' then raise exception 'u1 friends: %', r; end if;
  ok := false; begin perform private.fw_friend_request(null, u2); exception when others then ok := sqlerrm like 'fw_friend_dupe%'; end;
  if not ok then raise exception 'friend dupe not refused'; end if;

  -- remove is mutual
  perform private.fw_friend_remove(u2);
  if (select count(*) from public.fw_friends where u1 in (a,b)) <> 0 then raise exception 'remove failed'; end if;
  perform set_config('request.jwt.claim.sub', u2::text, true); perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  r := private.fw_social_me();
  if jsonb_array_length(r->'friends') <> 0 then raise exception 'remove not mutual'; end if;

  -- unknown code refused
  ok := false; begin perform private.fw_friend_request('ZZZZZZZZ', null); exception when others then ok := sqlerrm like 'fw_bad_input%'; end;
  if not ok then raise exception 'unknown code not refused'; end if;

  -- alerts: befriend again (as u1 — the previous check left us as u2), then hello fans out exactly one 'on' row
  perform set_config('request.jwt.claim.sub', u1::text, true); perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  r := private.fw_friend_request(null, u2);
  perform set_config('request.jwt.claim.sub', u2::text, true); perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  r := private.fw_friend_respond(u1, true);
  r := private.fw_social_hello(0);   -- u2 comes online
  if (select count(*) from private.fw_social_feed where to_id = u1 and kind = 'on') <> 1 then raise exception 'hello fan-out'; end if;
  update private.fw_social set hello_at = hello_at - interval '16 minutes' where player_id = u2;   -- gap passed but still online (last_seen fresh)
  r := private.fw_social_hello(0);
  if (select count(*) from private.fw_social_feed where to_id = u1 and kind = 'on') <> 1 then raise exception 'staying online must not repeat the alert'; end if;
  update private.fw_social set hello_at = hello_at - interval '16 minutes', last_seen = last_seen - interval '10 minutes' where player_id = u2;
  r := private.fw_social_hello(0);   -- actually came back
  if (select count(*) from private.fw_social_feed where to_id = u1 and kind = 'on') <> 2 then raise exception 'coming back must alert again'; end if;
  -- a new best feeds the friend once (folded), with a fresh id each time
  update public.fw_scores set best = 20 where player_id = u2;
  update public.fw_scores set best = 30 where player_id = u2;
  if (select count(*) from private.fw_social_feed where to_id = u1 and kind = 'best') <> 1
     or (select val from private.fw_social_feed where to_id = u1 and kind = 'best') <> 30 then raise exception 'best fold'; end if;
  -- the feed is private: u1 reads only its own rows, fresh ones only, and max passes the stale backlog
  perform set_config('request.jwt.claim.sub', u1::text, true); perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
  r := private.fw_social_hello(0);
  if jsonb_array_length(r->'rows') < 2 then raise exception 'u1 should see its rows: %', r; end if;
  update private.fw_social_feed set at = at - interval '2 hours' where to_id = u1;
  r := private.fw_social_hello(0);
  if jsonb_array_length(r->'rows') <> 0 or (r->>'max')::bigint <= 0 then raise exception 'stale rows must hide behind max: %', r; end if;

  raise notice 'PASS social.sql';
end $$;
rollback;
select 'PASS (see notices)' as result;
