-- Friend-invite rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/referral.sql).
-- Walks the whole flow AS THE API ROLE (set role authenticated, the caller's id in request.jwt.claim.sub): the invited friend
-- binds with the inviter's friend code, reports play on 3 UTC days and STAGE 10, submits a real best; the inviter claims once,
-- acknowledges, and a second claim returns nothing. Refused: self-invite, an invite cycle, an old account, a second inviter.
-- Then the milestones, a burst held for review and released, the monthly cap, and the cascade of an account deletion.
-- Steps that stand for time passing (a new UTC day, a new month) or for the review are done as the database owner between
-- the API calls; everything a player does goes through the public wrappers as "authenticated".
\set ON_ERROR_STOP on
\pset footer off

-- ids: a = inviter (an old account: inviters may be anyone), b = invited friend (new), o = an old account opening a link,
-- n1/n2 = two new players inviting each other, h* = a burst of 6, m* = 27 friends of one inviter for the monthly cap
create function pg_temp.u(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
insert into auth.users (id, created_at) values (pg_temp.u('a'), now() - interval '30 days'), (pg_temp.u('b'), now()),
  (pg_temp.u('0'), now() - interval '2 days'), (pg_temp.u('1'), now()), (pg_temp.u('2'), now()), (pg_temp.u('c'), now()), (pg_temp.u('d'), now()),
  (pg_temp.u('e'), now() - interval '40 days'), (pg_temp.u('f'), now() - interval '40 days');
insert into auth.users (id) select pg_temp.u('10' || g) from generate_series(1, 6) g;        -- h1..h6: the burst (inviter e)
insert into auth.users (id) select pg_temp.u('20' || lpad(g::text, 2, '0')) from generate_series(1, 27) g;   -- m01..m27 (inviter f)
grant execute on function pg_temp.u(text) to authenticated;

\echo === bind: refusals and the one good link, as authenticated ===
set role authenticated;
do $$
declare
  ca text; cn1 text; cn2 text; r jsonb;
  A uuid := pg_temp.u('a'); B uuid := pg_temp.u('b'); O uuid := pg_temp.u('0'); N1 uuid := pg_temp.u('1'); N2 uuid := pg_temp.u('2');
  sub constant text := 'request.jwt.claim.sub';
begin
  perform set_config(sub, A::text, true); ca := public.referral_me() ->> 'code';
  if ca !~ '^[0-9A-HJKMNP-TV-Z]{8}$' then raise exception 'referral_me must hand out the friend code, got %', ca; end if;
  r := public.referral_link(ca);            if r ->> 'status' <> 'self'    then raise exception 'self-invite must be refused: %', r; end if;
  r := public.referral_link('ZZZZZZZZ');    if r ->> 'status' <> 'unknown' then raise exception 'an unknown code: %', r; end if;
  perform set_config(sub, O::text, true);
  r := public.referral_link(ca);            if r ->> 'status' <> 'old'     then raise exception 'an account older than a day must be refused: %', r; end if;
  perform set_config(sub, B::text, true);
  r := public.referral_link(lower(ca));     if r ->> 'status' <> 'linked'  then raise exception 'a new player with the code must bind: %', r; end if;
  r := public.referral_link(ca);            if r ->> 'status' <> 'already' then raise exception 'one inviter per player: %', r; end if;
  perform set_config(sub, N1::text, true); cn1 := public.referral_me() ->> 'code';
  perform set_config(sub, N2::text, true); cn2 := public.referral_me() ->> 'code';
  r := public.referral_link(cn1);           if r ->> 'status' <> 'linked'  then raise exception 'n2 joins with n1''s code: %', r; end if;
  perform set_config(sub, N1::text, true);
  r := public.referral_link(cn2);           if r ->> 'status' <> 'self'    then raise exception 'an invite cycle (n2 joined with n1''s code, n1 uses n2''s) must be refused: %', r; end if;
  perform set_config(sub, B::text, true);
  begin perform public.referral_link('nope'); raise exception 'a malformed code must raise';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;
do $$ begin
  if not exists (select 1 from public.fw_friends where a = least(pg_temp.u('a'), pg_temp.u('b')) and b = greatest(pg_temp.u('a'), pg_temp.u('b'))) then
    raise exception 'binding must make the two friends (play together)'; end if;
  if (select count(*) from private.fw_referrals) <> 2 then raise exception 'exactly two bindings (b->a, n2->n1), got %', (select count(*) from private.fw_referrals); end if;
end $$;

\echo === progress: three UTC days, STAGE 10, and a real best ===
set role authenticated;
do $$
declare r jsonb; B uuid := pg_temp.u('b'); A uuid := pg_temp.u('a');
begin
  perform set_config('request.jwt.claim.sub', B::text, true);
  r := public.referral_progress(4);  if (r ->> 'days')::int <> 1 or (r ->> 'stage')::int <> 4 or r ->> 'status' <> 'open' then raise exception 'day 1: %', r; end if;
  r := public.referral_progress(10); if (r ->> 'days')::int <> 1 or (r ->> 'stage')::int <> 10 then raise exception 'the same day counts once: %', r; end if;
  r := public.referral_progress(2);  if (r ->> 'stage')::int <> 10 then raise exception 'the stage never goes down: %', r; end if;
  begin perform public.referral_progress(51); raise exception 'stage 51 must raise'; exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claim.sub', A::text, true);
  r := public.referral_progress(10); if r ->> 'status' <> 'none' then raise exception 'the inviter is nobody''s invitee: %', r; end if;
end $$;
reset role;
update private.fw_referrals set last_day = last_day - 1 where invitee_id = pg_temp.u('b');   -- a new UTC day
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('b')::text, true);
  r := public.referral_progress(10); if (r ->> 'days')::int <> 2 or r ->> 'status' <> 'open' then raise exception 'day 2: %', r; end if;
end $$;
reset role;
update private.fw_referrals set last_day = last_day - 1 where invitee_id = pg_temp.u('b');   -- day 3
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('b')::text, true);
  r := public.referral_progress(10);
  if (r ->> 'days')::int <> 3 or r ->> 'status' <> 'open' then raise exception 'three days and STAGE 10 but no best on the board: still open, got %', r; end if;
  perform public.submit_score(14, 14, 'endless', '2026-10-21', 'volt', 'Friend', 'KR', 'ko');   -- the run that reached STAGE 10
  r := public.referral_progress(10); if r ->> 'status' <> 'done' then raise exception 'the goal is met: %', r; end if;
  r := public.referral_progress(10); if r ->> 'status' <> 'done' then raise exception 'done stays done: %', r; end if;
  -- the invited friend gets nothing for joining: nothing to claim
  r := public.referral_claim(); if r -> 'booked' <> 'null'::jsonb or jsonb_array_length(r -> 'payouts') <> 0 then raise exception 'the invitee must have no reward: %', r; end if;
end $$;

\echo === claim: once, acknowledged, and a second claim returns nothing ===
do $$
declare r jsonb; r2 jsonb; id bigint; A uuid := pg_temp.u('a');
begin
  perform set_config('request.jwt.claim.sub', A::text, true);
  r := public.referral_me();
  if (r ->> 'ready')::int <> 1 or (r ->> 'paid')::int <> 0 or (r -> 'friends' -> 0 ->> 'done')::boolean is not true then raise exception 'me before the claim: %', r; end if;
  r := public.referral_claim(); id := (r ->> 'booked')::bigint;
  if id is null or jsonb_array_length(r -> 'payouts') <> 1 or (r -> 'payouts' -> 0 ->> 'gems')::int <> 15
     or (r -> 'payouts' -> 0 ->> 'coins')::int <> 10000 then raise exception 'the first claim pays 15 gems and 10,000 coins: %', r; end if;
  r2 := public.referral_claim();
  if r2 -> 'booked' <> 'null'::jsonb or (r2 -> 'payouts' -> 0 ->> 'id')::bigint <> id then raise exception 'before the ack a claim books nothing new and repeats the payout: %', r2; end if;
  perform set_config('request.jwt.claim.sub', pg_temp.u('b')::text, true);
  if public.referral_ack(id) then raise exception 'another player cannot acknowledge the payout'; end if;
  perform set_config('request.jwt.claim.sub', A::text, true);
  if not public.referral_ack(id) then raise exception 'the ack must take'; end if;
  if public.referral_ack(id) then raise exception 'a second ack is a no-op'; end if;
  r := public.referral_claim();
  if r -> 'booked' <> 'null'::jsonb or jsonb_array_length(r -> 'payouts') <> 0 then raise exception 'double claim must return nothing: %', r; end if;
  r := public.referral_me(); if (r ->> 'paid')::int <> 1 or (r ->> 'month')::int <> 1 or (r ->> 'ready')::int <> 0 then raise exception 'me after the claim: %', r; end if;
end $$;
reset role;

\echo === milestone 3: two more friends of a (made done by hand), one claim pays 2 x 15 + 50 gems and 2 x 10,000 coins ===
insert into private.fw_referrals (invitee_id, inviter_id, days, stage, done_at) values
  (pg_temp.u('c'), pg_temp.u('a'), 3, 10, now()), (pg_temp.u('d'), pg_temp.u('a'), 3, 10, now());
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a')::text, true);
  r := public.referral_claim();
  if (r -> 'payouts' -> 0 ->> 'gems')::int <> 80 or (r -> 'payouts' -> 0 ->> 'coins')::int <> 20000 or r -> 'payouts' -> 0 -> 'ms' <> '[3]'::jsonb then raise exception 'milestone 3: %', r; end if;
  perform public.referral_ack((r ->> 'booked')::bigint);
  r := public.referral_me(); if (r ->> 'paid')::int <> 3 or (r ->> 'ms_paid')::int <> 1 then raise exception 'me after milestone 3: %', r; end if;
end $$;

\echo === burst: six friends of e within the hour are all held; released by review ===
do $$
declare ce text; r jsonb;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('e')::text, true); ce := public.referral_me() ->> 'code';
  for i in 1 .. 6 loop
    perform set_config('request.jwt.claim.sub', pg_temp.u('10' || i)::text, true);
    r := public.referral_link(ce); if r ->> 'status' <> 'linked' then raise exception 'h% links: %', i, r; end if;
    perform set_config('request.jwt.claim.sub', pg_temp.u('e')::text, true);
    r := public.referral_me();
    if i <= 5 and (r ->> 'held')::int <> 0 then raise exception 'five in an hour are fine, got held % after %', r ->> 'held', i; end if;
    if i = 6 and (r ->> 'held')::int <> 6 then raise exception 'the sixth holds the whole burst: %', r; end if;
  end loop;
end $$;
reset role;
update private.fw_referrals set days = 3, stage = 10, done_at = now() where inviter_id = pg_temp.u('e');
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('e')::text, true);
  r := public.referral_claim(); if r -> 'booked' <> 'null'::jsonb then raise exception 'held invites are not paid: %', r; end if;
end $$;
reset role;
update private.fw_referrals set held = false where inviter_id = pg_temp.u('e') and held;   -- the review releases them
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('e')::text, true);
  r := public.referral_claim(); if (r -> 'payouts' -> 0 ->> 'gems')::int <> 6 * 15 + 50 or (r -> 'payouts' -> 0 ->> 'coins')::int <> 6 * 10000 then raise exception 'released burst: %', r; end if;
end $$;
reset role;

\echo === monthly cap: 27 friends of f, 25 paid this month (all three milestones), 2 next month ===
insert into private.fw_referrals (invitee_id, inviter_id, linked_at, days, stage, done_at)
select pg_temp.u('20' || lpad(g::text, 2, '0')), pg_temp.u('f'), now() - interval '3 days', 3, 10, now() - (g || ' minutes')::interval from generate_series(1, 27) g;
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('f')::text, true);
  r := public.referral_claim();
  if (r -> 'payouts' -> 0 ->> 'invites')::int <> 25 or (r -> 'payouts' -> 0 ->> 'gems')::int <> 25 * 15 + 50 + 150 + 500 or (r -> 'payouts' -> 0 ->> 'coins')::int <> 25 * 10000
     or r -> 'payouts' -> 0 -> 'ms' <> '[3, 10, 25]'::jsonb then raise exception 'the month pays 25 friends and every milestone: %', r; end if;
  perform public.referral_ack((r ->> 'booked')::bigint);
  r := public.referral_claim(); if r -> 'booked' <> 'null'::jsonb then raise exception 'the monthly cap is reached: %', r; end if;
  r := public.referral_me(); if (r ->> 'month')::int <> 25 or (r ->> 'ready')::int <> 2 or (r ->> 'cap')::int <> 25 then raise exception 'me at the cap: %', r; end if;
end $$;
reset role;
update private.fw_ref_payouts set at = at - interval '40 days' where inviter_id = pg_temp.u('f');   -- a new month
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('f')::text, true);
  r := public.referral_claim();
  if (r -> 'payouts' -> 0 ->> 'invites')::int <> 2 or (r -> 'payouts' -> 0 ->> 'gems')::int <> 30 or (r -> 'payouts' -> 0 ->> 'coins')::int <> 20000 then raise exception 'next month: the two that waited, no milestone again: %', r; end if;
end $$;
reset role;

\echo === grants and the cascade ===
do $$ begin
  if has_function_privilege('anon', 'public.referral_me()', 'execute') then raise exception 'anon must not call referral_me'; end if;
  if has_function_privilege('anon', 'public.referral_link(text)', 'execute') then raise exception 'anon must not call referral_link'; end if;
  if has_function_privilege('authenticated', 'private.fw_ref_cfg()', 'execute') then raise exception 'the cfg helper stays private'; end if;
  if not has_function_privilege('authenticated', 'private.fw_referral_claim(text)', 'execute') then raise exception 'the invoker wrapper needs execute on the private function'; end if;
end $$;
delete from auth.users where id = pg_temp.u('b');
do $$ begin
  if exists (select 1 from private.fw_referrals where invitee_id = pg_temp.u('b')) then raise exception 'the invitee row must cascade'; end if;
  if (select paid from private.fw_ref_inviter where player_id = pg_temp.u('a')) <> 3 then raise exception 'the inviter keeps the count already paid'; end if;
end $$;
delete from auth.users where id = pg_temp.u('f');
do $$ begin
  if exists (select 1 from private.fw_referrals where inviter_id = pg_temp.u('f')) or exists (select 1 from private.fw_ref_payouts where inviter_id = pg_temp.u('f'))
     or exists (select 1 from private.fw_ref_inviter where player_id = pg_temp.u('f')) then raise exception 'the inviter''s rows must cascade'; end if;
end $$;
select 'PASS referral.sql' as result;
