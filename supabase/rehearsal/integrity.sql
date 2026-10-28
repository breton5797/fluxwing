-- Server-integrity rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/integrity.sql).
-- The owner's decisions 30, 15 and 32 of the 2026-10-28 audit, every acceptance case, AS THE API ROLE where a player acts:
--   30. referrals: a guest (auth.users row or token) is refused by referral_link / referral_progress and spends no quota; once it
--       signs in the same code links; a best of 29 does not count the friend, 30 does; a counted friend is paid no sooner than
--       24 h after the link (23 h: nothing; 25 h: paid);
--   15. the first season: a rank needs 3 matches (202609 / 202610 / 202611), 10 after it; versus_ai counts a 1v1 against the AI
--       for +25 / -25 (never below 0), as a win / loss but never as a rival, at least 20 s apart, 5 a day, 40 a season, refuses
--       guests and bad arguments, says so in versus_me, and does nothing after the first season; the rollover resets the count;
--   32. collusion: settled wins are tallied per rival; admin_season flags a player whose 5 wins came from 2 rivals and not one
--       whose 5 wins came from 5, in the live top and in last season's top 10; the rollover keeps only the season it closes.
-- Steps that stand for time passing or for another season are done as the database owner between the API calls.
\set ON_ERROR_STOP on
\pset footer off

-- Supabase's auth.users has is_anonymous (a guest); the shared stub does not, so this script adds it
alter table auth.users add column if not exists is_anonymous boolean not null default false;
create function pg_temp.u(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
create function pg_temp.m(seed text, a text, b text) returns text language sql immutable as $$ select seed || '.' || pg_temp.u(a) || '.' || pg_temp.u(b) $$;
grant execute on function pg_temp.u(text), pg_temp.m(text, text, text) to authenticated;
-- a1: inviter (old account) · a2: invited friend (new account) · a3: a guest (row) · a4: an account whose token still says guest
-- b1..b4: first-season rollover rows · e1: plays the AI · e2: a guest playing the AI · c1..c3: collusion (c1 beats c2 x3, c3 x2)
-- d1..d6: d1 beats each of d2..d6 once · ad: the owner admin
insert into auth.users (id, created_at, is_anonymous) values
  (pg_temp.u('a1'), now() - interval '30 days', false), (pg_temp.u('a2'), now(), false), (pg_temp.u('a3'), now(), true), (pg_temp.u('a4'), now(), false),
  (pg_temp.u('e1'), now() - interval '9 days', false), (pg_temp.u('e2'), now() - interval '9 days', true), (pg_temp.u('ad'), now() - interval '90 days', false);
insert into auth.users (id, created_at) select pg_temp.u(x), now() - interval '9 days'
from unnest(array['b1','b2','b3','b4','c1','c2','c3','d1','d2','d3','d4','d5','d6']) x;
insert into private.fw_admins (user_id, role, note) values (pg_temp.u('ad'), 'owner', 'rehearsal');

\echo === 30a. a guest cannot be an invitee: link and progress are refused (row or token), no quota spent; signed in, it links ===
set role authenticated;
do $$
declare r jsonb; ca text; sub constant text := 'request.jwt.claim.sub';
begin
  perform set_config(sub, pg_temp.u('a1')::text, true); ca := public.referral_me() ->> 'code';
  perform set_config(sub, pg_temp.u('a3')::text, true);
  begin perform public.referral_link(ca); raise exception 'a guest must not link';
  exception when sqlstate '42501' then if sqlerrm !~ '^fw_need_account' then raise; end if; end;
  begin perform public.referral_link('nope'); raise exception 'a guest is refused before the argument check';
  exception when sqlstate '42501' then null; end;
  begin perform public.referral_progress(3); raise exception 'a guest must not report progress';
  exception when sqlstate '42501' then if sqlerrm !~ '^fw_need_account' then raise; end if; end;
  perform set_config(sub, pg_temp.u('a4')::text, true);
  perform set_config('request.jwt.claims', '{"is_anonymous": true}', true);
  begin perform public.referral_link(ca); raise exception 'a guest token must be refused';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claims', '', true);
end $$;
reset role;
do $$ begin
  if exists (select 1 from private.fw_social where player_id in (pg_temp.u('a3'), pg_temp.u('a4')) and req_count > 0) then raise exception 'a refused guest spends no request quota'; end if;
  if exists (select 1 from private.fw_referrals where invitee_id in (pg_temp.u('a3'), pg_temp.u('a4'))) then raise exception 'no binding for a guest'; end if;
end $$;
update auth.users set is_anonymous = false where id = pg_temp.u('a3');   -- the guest signs in with Google (same id)
set role authenticated;
do $$ declare r jsonb; ca text; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a1')::text, true); ca := public.referral_me() ->> 'code';
  perform set_config('request.jwt.claim.sub', pg_temp.u('a3')::text, true);
  r := public.referral_link(ca); if r ->> 'status' <> 'linked' then raise exception 'signed in, the kept code links: %', r; end if;
  perform set_config('request.jwt.claim.sub', pg_temp.u('a2')::text, true);
  r := public.referral_link(ca); if r ->> 'status' <> 'linked' then raise exception 'a new account links: %', r; end if;
end $$;
reset role;

\echo === 30b. min_best 30: a best of 29 leaves the friend open, 30 counts ===
update private.fw_referrals set days = 2, last_day = (now() at time zone 'utc')::date - 1, stage = 10 where invitee_id = pg_temp.u('a2');   -- two days of play behind
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a2')::text, true);
  perform public.submit_score(29, 22, 'endless', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'volt', 'Friend', 'KR', 'ko');
  r := public.referral_progress(10);
  if (r ->> 'days')::int <> 3 or r ->> 'status' <> 'open' then raise exception '3 days, STAGE 10, best 29: still open, got %', r; end if;
end $$;
reset role;
update public.fw_scores set last_submit_at = last_submit_at - interval '1 minute' where player_id = pg_temp.u('a2');
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a2')::text, true);
  perform public.submit_score(30, 23, 'endless', to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'volt', 'Friend', 'KR', 'ko');
  r := public.referral_progress(10); if r ->> 'status' <> 'done' then raise exception 'best 30: done, got %', r; end if;
end $$;
reset role;

\echo === 30c. the 24-hour hold: done at once, nothing at 23 h after the link, paid at 25 h ===
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a1')::text, true);
  r := public.referral_me(); if (r ->> 'ready')::int <> 0 then raise exception 'within the hold nothing is ready: %', r; end if;
  r := public.referral_claim(repeat('ab', 16)); if r -> 'booked' <> 'null'::jsonb then raise exception 'within the hold nothing is booked: %', r; end if;
end $$;
reset role;
update private.fw_referrals set linked_at = now() - interval '23 hours' where invitee_id = pg_temp.u('a2');
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a1')::text, true);
  r := public.referral_claim(repeat('ab', 16)); if r -> 'booked' <> 'null'::jsonb then raise exception '23 h after the link: still held, got %', r; end if;
end $$;
reset role;
update private.fw_referrals set linked_at = now() - interval '25 hours' where invitee_id = pg_temp.u('a2');
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('a1')::text, true);
  r := public.referral_me(); if (r ->> 'ready')::int <> 1 then raise exception '25 h after the link: ready, got %', r; end if;
  r := public.referral_claim(repeat('ab', 16));
  if r -> 'booked' = 'null'::jsonb or (r -> 'payouts' -> 0 ->> 'invites')::int <> 1 or (r -> 'payouts' -> 0 ->> 'gems')::int <= 0 then raise exception '25 h: paid once, got %', r; end if;
end $$;
reset role;

\echo === 15a. the first season by id: 3 matches for 202609..202611, 10 after; the rollover of 202609 ranks with 3 ===
do $$ begin
  if private.fw_vs_min_matches(202609) <> 3 or private.fw_vs_min_matches(202610) <> 3 or private.fw_vs_min_matches(202611) <> 3
     or private.fw_vs_min_matches(202612) <> 10 or private.fw_vs_min_matches(202701) <> 10 then raise exception 'min_matches by season id'; end if;
  if private.fw_vs_min_rivals(202609) <> 0 then raise exception 'the rivals rule starts at 202611 (unchanged)'; end if;
end $$;
insert into public.fw_versus (player_id, nick, cc, bird, rp, wins, losses, draws, ai) values
  (pg_temp.u('b1'), 'Three', 'KR', 'volt', 150, 3, 0, 0, 2),    -- 3 matches (2 of them against the AI): ranked
  (pg_temp.u('b2'), 'Two',   'KR', 'volt', 100, 2, 0, 0, 0);    -- 2 matches: unranked
insert into private.fw_vs_wins (season, player_id, rival_id, n) values
  (202608, pg_temp.u('b1'), pg_temp.u('b2'), 4),                                                  -- older than the closed season: deleted
  (202609, pg_temp.u('b1'), pg_temp.u('b2'), 4), (202609, pg_temp.u('b1'), pg_temp.u('b3'), 1);   -- the closed season: kept (5 wins, 2 rivals)
update private.fw_vs_season set season = 202609, prev = null where one;
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('b3')::text, true);
  r := public.versus_me();   -- the first call of the month does the rollover
  if (r ->> 'season')::int <> 202610 or (r ->> 'need')::int <> 3 then raise exception 'versus_me in the first season: need 3, got %', r; end if;
end $$;
reset role;
do $$ begin
  if (select rank from public.fw_vs_standing where season = 202609 and player_id = pg_temp.u('b1')) is distinct from 1 then raise exception '3 matches: ranked in the first season'; end if;
  if (select rank from public.fw_vs_standing where season = 202609 and player_id = pg_temp.u('b2')) is not null then raise exception '2 matches: unranked'; end if;
  if exists (select 1 from public.fw_versus where ai <> 0) then raise exception 'the rollover resets the AI count'; end if;
  if exists (select 1 from private.fw_vs_wins where season = 202608) then raise exception 'wins older than the closed season are deleted'; end if;
  if (select sum(n) from private.fw_vs_wins where season = 202609) <> 5 then raise exception 'the closed season''s wins stay for its review'; end if;
end $$;

\echo === 15b. versus_ai: +25 / -25 (floor 0), never a rival, 20 s apart, 5 a day, 40 a season; guests and bad input refused ===
set role authenticated;
do $$
declare r jsonb; sub constant text := 'request.jwt.claim.sub';
begin
  perform set_config(sub, pg_temp.u('e1')::text, true);
  r := public.versus_me() -> 'ai';
  if (r ->> 'rp')::int <> 25 or (r ->> 'per_day')::int <> 5 or (r ->> 'left')::int <> 5 then raise exception 'versus_me tells the AI rule: %', r; end if;
  r := public.versus_ai('win', 'Ace', 'kr', 'volt');
  if not (r ->> 'counted')::boolean or (r ->> 'delta')::int <> 25 or (r -> 'me' ->> 'rp')::int <> 25 or (r -> 'me' ->> 'wins')::int <> 1 or (r ->> 'left')::int <> 4
    then raise exception 'a win against the AI: +25, got %', r; end if;
  r := public.versus_ai('win', 'Ace', 'kr', 'volt');
  if (r ->> 'counted')::boolean or r ->> 'why' <> 'soon' then raise exception 'a second report within 20 s does not count: %', r; end if;
  perform set_config(sub, pg_temp.u('e2')::text, true);
  begin perform public.versus_ai('win', 'G', 'KR', 'volt'); raise exception 'a guest must not count an AI match';
  exception when sqlstate '42501' then if sqlerrm !~ '^fw_need_account' then raise; end if; end;
  perform set_config(sub, pg_temp.u('e1')::text, true);
  begin perform public.versus_ai('maybe', 'Ace', 'KR', 'volt'); raise exception 'a bad result must raise';
  exception when sqlstate '22023' then null; end;
  begin perform public.versus_ai('win', 'Ace', 'KR', 'nope'); raise exception 'an unknown unit must raise';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;
do $$ begin
  if (select cardinality(rivals) from public.fw_versus where player_id = pg_temp.u('e1')) <> 0 then raise exception 'the AI is never a rival'; end if;
  if (select ai from public.fw_versus where player_id = pg_temp.u('e1')) <> 1 then raise exception 'one AI match counted'; end if;
end $$;
-- four more, each 30 s after the one before: lose (25 -> 0), lose (stays 0), draw, win
create function pg_temp.ai_later() returns void language sql as $$ update private.fw_vs_ai_log set at = at - interval '30 seconds' $$;
do $$
declare r jsonb; res text;
begin
  foreach res in array array['lose', 'lose', 'draw', 'win'] loop
    perform pg_temp.ai_later();
    set local role authenticated;
    perform set_config('request.jwt.claim.sub', pg_temp.u('e1')::text, true);
    r := public.versus_ai(res, 'Ace', 'KR', 'volt');
    reset role;
    if not (r ->> 'counted')::boolean then raise exception '% must count: %', res, r; end if;
  end loop;
end $$;
do $$ begin
  if (select row(rp, wins, losses, draws, ai) from public.fw_versus where player_id = pg_temp.u('e1')) is distinct from row(25, 2, 2, 1, 5)
    then raise exception 'after win, lose, lose, draw, win: 25 RP (the floor held), 2-2-1, 5 counted; got %',
      (select row(rp, wins, losses, draws, ai) from public.fw_versus where player_id = pg_temp.u('e1')); end if;
  if (select array_agg(delta order by id) from private.fw_vs_ai_log where player_id = pg_temp.u('e1')) <> array[25, -25, 0, 0, 25] then raise exception 'the log holds the RP applied'; end if;
end $$;
select pg_temp.ai_later();
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('e1')::text, true);
  r := public.versus_ai('win', 'Ace', 'KR', 'volt'); if r ->> 'why' <> 'cap' then raise exception 'the 6th of the day: cap, got %', r; end if;
  if (public.versus_me() #>> '{ai,left}')::int <> 0 then raise exception 'versus_me: none left today'; end if;
end $$;
reset role;
update private.fw_vs_ai_log set at = at - interval '1 day';   -- the next day
update public.fw_versus set ai = 40 where player_id = pg_temp.u('e1');   -- the season's 40 are used
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('e1')::text, true);
  r := public.versus_ai('win', 'Ace', 'KR', 'volt'); if r ->> 'why' <> 'full' then raise exception 'the season cap: full, got %', r; end if;
  if (public.versus_me() #>> '{ai,left}')::int <> 0 then raise exception 'versus_me: none left this season'; end if;
end $$;
reset role;
update public.fw_versus set ai = 5 where player_id = pg_temp.u('e1');
do $$ begin
  if exists (select 1 from private.fw_vs_ai_log where at > now() - interval '1 day') then raise exception 'no row today any more'; end if;
end $$;

\echo === 32a. settled wins are tallied per rival: c1 beats c2 three times and c3 twice; d1 beats d2..d6 once each ===
create function pg_temp.play(seed text, w text, l text) returns void language plpgsql as $$
declare v_m text := pg_temp.m(seed, least(w, l), greatest(w, l)); tw integer := case when w < l then 0 else 1 end;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u(w)::text, true); perform public.versus_start(v_m, '1v1', tw, 'W' || w, 'KR', 'volt');
  perform set_config('request.jwt.claim.sub', pg_temp.u(l)::text, true); perform public.versus_start(v_m, '1v1', 1 - tw, 'L' || l, 'KR', 'volt');
end $$;
create function pg_temp.report(seed text, w text, l text) returns void language plpgsql as $$
declare v_m text := pg_temp.m(seed, least(w, l), greatest(w, l));
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u(w)::text, true); perform public.versus_report(v_m, 'win');
  perform set_config('request.jwt.claim.sub', pg_temp.u(l)::text, true); perform public.versus_report(v_m, 'lose');
end $$;
grant execute on function pg_temp.play(text, text, text), pg_temp.report(text, text, text) to authenticated;
set role authenticated;
select pg_temp.play('k1', 'c1', 'c2'), pg_temp.play('k2', 'c1', 'c2'), pg_temp.play('k3', 'c1', 'c2'), pg_temp.play('k4', 'c1', 'c3'), pg_temp.play('k5', 'c1', 'c3'),
       pg_temp.play('h2', 'd1', 'd2'), pg_temp.play('h3', 'd1', 'd3'), pg_temp.play('h4', 'd1', 'd4'), pg_temp.play('h5', 'd1', 'd5'), pg_temp.play('h6', 'd1', 'd6') \g /dev/null
reset role;
update private.fw_vs_part set joined_at = joined_at - interval '1 minute';   -- min_play has passed
set role authenticated;
select pg_temp.report('k1', 'c1', 'c2'), pg_temp.report('k2', 'c1', 'c2'), pg_temp.report('k3', 'c1', 'c2'), pg_temp.report('k4', 'c1', 'c3'), pg_temp.report('k5', 'c1', 'c3'),
       pg_temp.report('h2', 'd1', 'd2'), pg_temp.report('h3', 'd1', 'd3'), pg_temp.report('h4', 'd1', 'd4'), pg_temp.report('h5', 'd1', 'd5'), pg_temp.report('h6', 'd1', 'd6') \g /dev/null
reset role;
select p.nick, w.n, count(*) over () as rows from private.fw_vs_wins w join public.fw_versus p on p.player_id = w.player_id where w.season = 202610 order by p.nick, w.n desc;
do $$ begin
  if (select count(*) from private.fw_vs_match where status = 'settled') <> 10 then raise exception 'all ten matches settled'; end if;
  if (select array_agg(n order by n desc) from private.fw_vs_wins where season = 202610 and player_id = pg_temp.u('c1')) <> array[3, 2] then raise exception 'c1: 3 over c2, 2 over c3'; end if;
  if (select count(*) from private.fw_vs_wins where season = 202610 and player_id = pg_temp.u('d1')) <> 5 then raise exception 'd1: 5 rivals once each'; end if;
  if exists (select 1 from private.fw_vs_wins where player_id in (pg_temp.u('c2'), pg_temp.u('c3'), pg_temp.u('d2'))) then raise exception 'a loss tallies nothing'; end if;
end $$;

\echo === 32b. admin_season: c1 flagged (5 wins from 2 rivals), d1 not (5 from 5), e1 shows its AI count; last season''s b1 flagged ===
set role authenticated;
do $$
declare r jsonb; c jsonb; d jsonb; e jsonb; b jsonb;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('ad')::text, true);
  perform set_config('request.jwt.claims', '{"aal": "aal2"}', true);
  r := public.admin_season();
  select x into c from jsonb_array_elements(r -> 'live') x where x ->> 'nick' = 'Wc1';
  select x into d from jsonb_array_elements(r -> 'live') x where x ->> 'nick' = 'Wd1';
  select x into e from jsonb_array_elements(r -> 'live') x where x ->> 'nick' = 'Ace';
  select x into b from jsonb_array_elements(r -> 'top') x where x ->> 'nick' = 'Three';
  if c is null or not (c ->> 'flag')::boolean or (c ->> 'beat')::int <> 5 or (c ->> 'foes')::int <> 2 or (c ->> 'top2')::numeric <> 1 then raise exception 'c1 is flagged: %', c; end if;
  if d is null or (d ->> 'flag')::boolean or (d ->> 'foes')::int <> 5 or (d ->> 'top2')::numeric <> 0.4 then raise exception 'd1 is not: %', d; end if;
  if e is null or (e ->> 'ai')::int <> 5 or (e ->> 'flag')::boolean or (e ->> 'beat')::int <> 0 or e -> 'top2' <> 'null'::jsonb then raise exception 'e1: AI wins are no rivals: %', e; end if;
  if b is null or not (b ->> 'flag')::boolean or (b ->> 'rank')::int <> 1 then raise exception 'last season''s top 10 carries the check: %', b; end if;
  if (c ->> 'id')::uuid <> pg_temp.u('c1') then raise exception 'the live row carries the player id (the page links to the player)'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('authenticated', 'private.fw_vs_collusion(integer, uuid)', 'execute') then raise exception 'the check stays private'; end if;
  if has_function_privilege('anon', 'public.versus_ai(text, text, text, text)', 'execute') then raise exception 'anon must not call versus_ai'; end if;
  if not has_function_privilege('authenticated', 'private.fw_versus_ai(text, text, text, text)', 'execute') then raise exception 'the invoker wrapper needs execute on its private target'; end if;
  if has_table_privilege('authenticated', 'private.fw_vs_wins', 'select') or has_column_privilege('authenticated', 'public.fw_versus', 'ai', 'select') then raise exception 'the tallies stay private'; end if;
end $$;

\echo === 15c. after the first season (this copy only: first_season 202607): 10 matches for a rank, versus_ai counts nothing ===
create or replace function private.fw_vs_first_cfg(
  out first_season integer, out min_matches integer, out ai_pct integer, out ai_per_day integer, out ai_per_season integer, out ai_gap interval
) language sql immutable set search_path = '' as $$ select 202607, 3, 50, 5, 40, interval '20 seconds'; $$;
insert into public.fw_versus (player_id, nick, cc, bird, rp, wins, losses, draws) values (pg_temp.u('b4'), 'Later', 'KR', 'volt', 150, 3, 0, 0);
delete from public.fw_vs_standing where season = 202608;
update private.fw_vs_season set season = 202608, prev = null where one;
set role authenticated;
do $$ declare r jsonb; begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('e1')::text, true);
  r := public.versus_me();
  if (r ->> 'need')::int <> 10 or r -> 'ai' <> 'null'::jsonb then raise exception 'after the first season: need 10, no AI rule, got %', r; end if;
  r := public.versus_ai('win', 'Ace', 'KR', 'volt');
  if (r ->> 'counted')::boolean or r ->> 'why' <> 'season' then raise exception 'after the first season the AI counts nothing: %', r; end if;
end $$;
reset role;
do $$ begin
  if (select rank from public.fw_vs_standing where season = 202608 and player_id = pg_temp.u('b4')) is not null then raise exception '3 matches after the first season: unranked'; end if;
end $$;
select 'PASS integrity.sql' as result;
