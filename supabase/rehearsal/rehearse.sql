-- Season rollover rehearsal: the code path of 2026-11-01 00:00 KST, run on a copy.
-- The clock cannot be moved, so the state row is set one month back (202609) while the clock says 202610:
-- the first versus call then finds "a later month" exactly as the first call after 00:00 KST on Nov 1 will.
\set ON_ERROR_STOP on
\pset footer off

\echo === 1. season boundary arithmetic (Asia/Seoul) ===
select private.fw_vs_season_of('2026-10-31 14:59:59+00') as "Oct31 23:59:59 KST",
       private.fw_vs_season_of('2026-10-31 15:00:00+00') as "Nov01 00:00:00 KST",
       private.fw_vs_season_end(202610) as "end of 202610",
       private.fw_vs_season_of(now()) as "now";

\echo === 2. seed: 14 players with ranked matches, 1 without, a match row ===
insert into auth.users (id) select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 15) i;
insert into public.fw_versus (player_id, nick, cc, bird, rp, wins, losses, draws, updated_at)
select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid, 'P' || i, 'KR', 'volt',
       case i when 1 then 8200 when 2 then 5600 when 3 then 3600 when 4 then 2000 when 5 then 1000 when 6 then 450 when 7 then 450
              when 15 then 0 else 50 * i end,
       case when i <= 12 then 8 + i else 2 end,          -- players 13, 14: only 2-3 ranked matches (below min_matches = 10)
       case when i <= 12 then 3 else 1 end, 0,
       now() - (i || ' minutes')::interval               -- equal RP (6, 7): the earlier update ranks first
from generate_series(1, 15) i;
update public.fw_versus set wins = 0, losses = 0 where player_id = '00000000-0000-4000-8000-000000000015';   -- a row with no match at all
update private.fw_vs_season set season = 202609, prev = null, rolled_at = null where one;
select season, prev, rolled_at from private.fw_vs_season;

\echo === 3. the first player call after the boundary: versus_me as player 6, as the API role ===
begin;
set local role authenticated;
set local statement_timeout = '8s';
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
select public.versus_me() as versus_me_player6;
commit;

\echo === 4. state row after the rollover ===
select season, prev, rolled_at is not null as rolled from private.fw_vs_season;

\echo === 5. archived standings (rank only with >= 10 matches; tier from RP) ===
select season, rank, rp, tier, wins, losses, matches, nick from public.fw_vs_standing order by rank nulls last, rp desc;

\echo === 6. live ranking reset ===
select count(*) filter (where rp = 0 and wins = 0 and losses = 0 and draws = 0) as zeroed, count(*) as rows from public.fw_versus;

\echo === 7. claim once, then again (player 1: rank 1, demigod, the limited unit) ===
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);
select public.versus_claim(202609) as first_claim;
select public.versus_claim(202609) as second_claim;
commit;

\echo === 8. a player below min_matches: no rank, no reward ===
do $$ begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000013', true);
  perform public.versus_claim(202609);
  raise notice 'UNEXPECTED: the claim went through';
exception when others then
  raise warning 'refused as designed: %', sqlerrm;
end $$;

\echo === 9. the next call in the same month does nothing more ===
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select (public.versus_me())->>'season' as season_seen;
commit;
select count(*) as standings_rows_still from public.fw_vs_standing;

\echo === 10. the scheduled path: fw_vs_tick() as the database owner (what a pg_cron job runs) ===
update public.fw_versus set rp = 777, wins = 11, losses = 1 where nick = 'P3';
update private.fw_vs_season set season = 202608, prev = null, rolled_at = null where one;
select private.fw_vs_tick() as tick_returns;
select season, prev from private.fw_vs_season;
select season, rank, rp, nick from public.fw_vs_standing where season = 202608;
select private.fw_vs_tick() as second_tick_noop;
select count(*) as rows_202608 from public.fw_vs_standing where season = 202608;

\echo === 11. scale: 100,000 players with ranked matches, rollover by a player call under the 8 s API timeout ===
insert into auth.users (id) select gen_random_uuid() from generate_series(1, 100000);
insert into public.fw_versus (player_id, nick, cc, bird, rp, wins, losses, draws, updated_at)
select u.id, 'Q' || (row_number() over ()), 'KR', 'volt', (random() * 9000)::int, 5 + (random() * 20)::int, (random() * 10)::int, 0, now() - random() * interval '30 days'
from auth.users u where not exists (select 1 from public.fw_versus v where v.player_id = u.id);
analyze;
update private.fw_vs_season set season = 202607, prev = null, rolled_at = null where one;
\timing on
begin;
set local role authenticated;
set local statement_timeout = '8s';
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true) \g /dev/null
select (public.versus_me())->>'season' as season_after_big_rollover;
commit;
\timing off
select count(*) as archived_202607, count(rank) as ranked from public.fw_vs_standing where season = 202607;
