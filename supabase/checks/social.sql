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

  raise notice 'PASS social.sql';
end $$;
rollback;
select 'PASS (see notices)' as result;
