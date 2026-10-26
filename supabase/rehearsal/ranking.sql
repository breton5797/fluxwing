-- Ranking integrity rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/ranking.sql).
-- As the API role: a guest is refused ranked play and season claims (fw_need_account) but still reads versus_me; settled matches
-- record distinct rivals; the rollover ranks only accounts with min_matches and the rivals; a claim nonce decides "same"; referral
-- payouts are stamped with the first claiming device's nonce. Steps that stand for time passing are done as the database owner.
\set ON_ERROR_STOP on
\pset footer off

-- Supabase's auth.users has is_anonymous (a guest); the shared stub does not, so this script adds it
alter table auth.users add column if not exists is_anonymous boolean not null default false;
create function pg_temp.u(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
grant execute on function pg_temp.u(text) to authenticated;
-- 1..5: accounts; 9: a guest (auth.users row); 8: an account row whose token still says guest (the claim is read too)
insert into auth.users (id, created_at, is_anonymous)
select pg_temp.u(i::text), now() - interval '9 days', i = 9 from generate_series(1, 9) i;
-- a 1v1 match id: <seed>.<smaller id>.<larger id>
create function pg_temp.m(seed text, a text, b text) returns text language sql immutable as $$ select seed || '.' || pg_temp.u(a) || '.' || pg_temp.u(b) $$;
grant execute on function pg_temp.m(text, text, text) to authenticated;

\echo === 1. guests: no ranked start, report or claim; versus_me answers ===
set role authenticated;
do $$
declare r jsonb; sub constant text := 'request.jwt.claim.sub';
begin
  perform set_config(sub, pg_temp.u('9')::text, true);
  begin perform public.versus_start(pg_temp.m('a', '1', '9'), '1v1', 1, 'Guest', 'KR', 'volt'); raise exception 'a guest must not start a ranked match';
  exception when sqlstate '42501' then if sqlerrm !~ '^fw_need_account' then raise; end if; end;
  begin perform public.versus_report(pg_temp.m('a', '1', '9'), 'win'); raise exception 'a guest must not report';
  exception when sqlstate '42501' then null; end;
  begin perform public.versus_claim(202609, null); raise exception 'a guest must not claim';
  exception when sqlstate '42501' then null; end;
  r := public.versus_me(); if r ->> 'need_rivals' is null then raise exception 'versus_me answers a guest, with need_rivals: %', r; end if;
  perform set_config(sub, pg_temp.u('8')::text, true);
  perform set_config('request.jwt.claims', '{"is_anonymous": true}', true);
  begin perform public.versus_start(pg_temp.m('b', '1', '8'), '1v1', 1, 'Tok', 'KR', 'volt'); raise exception 'a guest token must be refused';
  exception when sqlstate '42501' then null; end;
  perform set_config('request.jwt.claims', '', true);
end $$;
reset role;

\echo === 2. three agreed 1v1 matches of player 1 (vs 2, 3, 4) and one 2v2 (1+2 vs 3+4): rivals are recorded, distinct ===
set role authenticated;
do $$
declare sub constant text := 'request.jwt.claim.sub'; v_m text; o text;
begin
  foreach o in array array['2', '3', '4'] loop
    v_m := pg_temp.m('s' || o, '1', o);
    perform set_config(sub, pg_temp.u('1')::text, true); perform public.versus_start(v_m, '1v1', 0, 'One', 'KR', 'volt');
    perform set_config(sub, pg_temp.u(o)::text, true);   perform public.versus_start(v_m, '1v1', 1, 'P' || o, 'KR', 'volt');
  end loop;
  v_m := 'd.' || pg_temp.u('1') || '+' || pg_temp.u('2') || '.' || pg_temp.u('3') || '+' || pg_temp.u('4');
  foreach o in array array['1', '2', '3', '4'] loop
    perform set_config(sub, pg_temp.u(o)::text, true); perform public.versus_start(v_m, '2v2', case when o in ('1', '2') then 0 else 1 end, 'P' || o, 'KR', 'volt');
  end loop;
end $$;
reset role;
update private.fw_vs_part set joined_at = joined_at - interval '1 minute';   -- min_play has passed
set role authenticated;
do $$
declare sub constant text := 'request.jwt.claim.sub'; v_m text; o text; r jsonb;
begin
  foreach o in array array['2', '3', '4'] loop
    v_m := pg_temp.m('s' || o, '1', o);
    perform set_config(sub, pg_temp.u('1')::text, true); perform public.versus_report(v_m, 'win');
    perform set_config(sub, pg_temp.u(o)::text, true);   r := public.versus_report(v_m, 'lose');
    if r ->> 'state' <> 'settled' then raise exception 'agreed reports settle: %', r; end if;
  end loop;
  v_m := 'd.' || pg_temp.u('1') || '+' || pg_temp.u('2') || '.' || pg_temp.u('3') || '+' || pg_temp.u('4');
  foreach o in array array['1', '2', '3', '4'] loop
    perform set_config(sub, pg_temp.u(o)::text, true); r := public.versus_report(v_m, case when o in ('1', '2') then 'win' else 'lose' end);
  end loop;
  if r ->> 'state' <> 'settled' then raise exception 'the 2v2 settles: %', r; end if;
end $$;
reset role;
select nick, wins, losses, cardinality(rivals) as rivals from public.fw_versus order by player_id;
do $$ begin
  if (select cardinality(rivals) from public.fw_versus where player_id = pg_temp.u('1')) <> 3 then raise exception 'player 1 met 2, 3, 4 (the 2v2 adds no new one)'; end if;
  if (select cardinality(rivals) from public.fw_versus where player_id = pg_temp.u('2')) <> 3 then raise exception 'player 2 met 1, then 3 and 4 in the 2v2 (not the teammate)'; end if;
  if private.fw_vs_rivals(array[pg_temp.u('1')], array[pg_temp.u('1'), null]) <> array[pg_temp.u('1')] then raise exception 'distinct, no nulls'; end if;
  if cardinality(private.fw_vs_rivals((select array_agg(gen_random_uuid()) from generate_series(1, 30)), array[pg_temp.u('1')])) <> 16 then raise exception 'capped at 16'; end if;
  if private.fw_vs_min_rivals(202610) <> 0 or private.fw_vs_min_rivals(202611) <> 3 then raise exception 'rule from 202611'; end if;
end $$;

\echo === 3. rollover with the rivals rule on (stands for a season from 202611 on): rank needs 10 matches, 3 rivals, an account ===
-- the clock says 202610, so the rule is switched on for this copy only
create or replace function private.fw_vs_min_rivals(p_season integer) returns integer language sql immutable set search_path = '' as $$ select 3; $$;
update public.fw_versus set wins = wins + 9 where player_id in (pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('5'));   -- 10+ matches (5: no row yet)
insert into public.fw_versus (player_id, nick, cc, bird, rp, wins, losses, draws, rivals)
values (pg_temp.u('5'), 'Duo', 'KR', 'volt', 900, 12, 0, 0, array[pg_temp.u('6')]),                                       -- many matches, one rival
       (pg_temp.u('9'), 'Guest', 'KR', 'volt', 5000, 12, 0, 0, array[pg_temp.u('1'), pg_temp.u('2'), pg_temp.u('3')]); -- a guest's old row
update private.fw_vs_season set season = 202609, prev = null where one;
set role authenticated;
select set_config('request.jwt.claim.sub', pg_temp.u('3')::text, false) \g /dev/null
select (public.versus_me()) ->> 'season' as season_now;
reset role;
select season, rank, nick, matches from public.fw_vs_standing where season = 202609 order by rank nulls last, nick;
do $$ begin
  if (select rank from public.fw_vs_standing where season = 202609 and player_id = pg_temp.u('1')) <> 1 then raise exception 'player 1: ranked first'; end if;
  if (select rank from public.fw_vs_standing where season = 202609 and player_id = pg_temp.u('2')) <> 2 then raise exception 'player 2: ranked'; end if;
  if (select rank from public.fw_vs_standing where season = 202609 and player_id = pg_temp.u('5')) is not null then raise exception 'one rival only: no rank'; end if;
  if (select rank from public.fw_vs_standing where season = 202609 and player_id = pg_temp.u('9')) is not null then raise exception 'a guest: no rank'; end if;
  if exists (select 1 from public.fw_versus where rivals <> '{}') then raise exception 'the rollover empties rivals'; end if;
end $$;

\echo === 4. claim nonce: first claim, the same device again, another device, an old client, a bad nonce ===
set role authenticated;
do $$
declare r jsonb; n1 constant text := repeat('a1', 16); n2 constant text := repeat('b2', 16);
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('1')::text, true);
  r := public.versus_claim(202609, n1);
  if (r ->> 'already')::boolean or not (r ->> 'same')::boolean then raise exception 'first claim: %', r; end if;
  r := public.versus_claim(202609, n1);
  if not (r ->> 'already')::boolean or not (r ->> 'same')::boolean then raise exception 'the same device again (lost answer): %', r; end if;
  r := public.versus_claim(202609, n2);
  if not (r ->> 'already')::boolean or (r ->> 'same')::boolean then raise exception 'another device: %', r; end if;
  r := public.versus_claim(202609);
  if not (r ->> 'already')::boolean or (r ->> 'same')::boolean then raise exception 'an old client repeat: %', r; end if;
  begin perform public.versus_claim(202609, 'nope'); raise exception 'a malformed nonce must raise';
  exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claim.sub', pg_temp.u('2')::text, true);
  r := public.versus_claim(202609);
  if (r ->> 'already')::boolean or not (r ->> 'same')::boolean then raise exception 'an old client first claim still grants: %', r; end if;
end $$;
reset role;
select player_id = pg_temp.u('1') as p1, claim_nonce from public.fw_vs_standing where season = 202609 and claimed_at is not null order by 1 desc;

\echo === 5. referral payouts: stamped by the first device that claims with a nonce ===
insert into private.fw_ref_payouts (inviter_id, gems, invites) values (pg_temp.u('4'), 30, 1), (pg_temp.u('4'), 80, 1);
set role authenticated;
do $$
declare r jsonb; n1 constant text := repeat('c3', 16); n2 constant text := repeat('d4', 16);
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('4')::text, true);
  r := public.referral_claim();
  if jsonb_array_length(r -> 'payouts') <> 2 or (r -> 'payouts' -> 0 ->> 'same') is not null then raise exception 'an old client stamps nothing: %', r; end if;
  r := public.referral_claim(n1);
  if (select count(*) from jsonb_array_elements(r -> 'payouts') p where (p ->> 'same')::boolean) <> 2 then raise exception 'device 1 takes both: %', r; end if;
  r := public.referral_claim(n2);
  if (select count(*) from jsonb_array_elements(r -> 'payouts') p where (p ->> 'same')::boolean) <> 0 then raise exception 'device 2 grants none of them: %', r; end if;
  r := public.referral_claim(n1);
  if (select count(*) from jsonb_array_elements(r -> 'payouts') p where (p ->> 'same')::boolean) <> 2 then raise exception 'device 1 again (lost answer): %', r; end if;
  begin perform public.referral_claim('NOPE'); raise exception 'a malformed nonce must raise';
  exception when sqlstate '22023' then null; end;
end $$;
reset role;
select id, gems, nonce from private.fw_ref_payouts order by id;
