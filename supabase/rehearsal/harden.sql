-- Checks for the leaderboard hardening: gate cap, time budget, hidden rows (board and season rank), cron block.
\set ON_ERROR_STOP on
\pset footer off
create or replace function pg_temp.try(p_uid uuid, p_score int, p_gates int, p_mode text default 'endless') returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform public.submit_score(p_score, p_gates, p_mode, to_char(now() at time zone 'utc', 'YYYY-MM-DD'), 'volt', 'Tester', 'KR', 'ko');
  return 'accepted';
exception when others then return 'refused: ' || sqlerrm;
end $$;
grant execute on function pg_temp.try(uuid, int, int, text) to authenticated;

insert into auth.users (id, created_at) values
  ('10000000-0000-4000-8000-000000000001', now() - interval '60 seconds'),   -- signed in a minute ago, played one run
  ('10000000-0000-4000-8000-000000000002', now() - interval '1 second'),     -- brand-new user, forging at once
  ('10000000-0000-4000-8000-000000000003', now() - interval '2 days');       -- old user, a moderated cheater

\echo === 1. a real run: 112 gates, 2,500 points, a minute after sign-in ===
set role authenticated;
select pg_temp.try('10000000-0000-4000-8000-000000000001', 2500, 112) as real_run;
\echo === 2. a forged score sent at once by a brand-new user ===
select pg_temp.try('10000000-0000-4000-8000-000000000002', 1000000, 1400) as forged_1400_gates;
select pg_temp.try('10000000-0000-4000-8000-000000000002', 50250000, 5000) as forged_5000_gates;
\echo === 3. the next forged submit right after an accepted one (budget restarts at the last submit) ===
select pg_temp.try('10000000-0000-4000-8000-000000000002', 100, 20) as small_honest_run;
reset role;
select pg_sleep(2.1);
set role authenticated;
select pg_temp.try('10000000-0000-4000-8000-000000000002', 100000, 600) as forged_600_gates_2s_later;
\echo === 4. the old user posts a big (plausible) score, then gets hidden ===
select pg_temp.try('10000000-0000-4000-8000-000000000003', 90000, 1200) as old_user_big;
reset role;
update public.fw_scores set hidden = true where player_id = '10000000-0000-4000-8000-000000000003';
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', false) \g /dev/null
select nick, best from public.fw_scores order by best desc;   -- what player 1 sees
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', false) \g /dev/null
select count(*) as hidden_player_sees_own_row from public.fw_scores where player_id = '10000000-0000-4000-8000-000000000003';
reset role;

\echo === 5. a hidden versus player at the rollover: archived without rank ===
insert into public.fw_versus (player_id, nick, cc, bird, rp, wins, losses, draws, hidden) values
  ('10000000-0000-4000-8000-000000000001', 'Honest', 'KR', 'volt', 900, 12, 3, 0, false),
  ('10000000-0000-4000-8000-000000000003', 'Farmer', 'KR', 'volt', 9000, 40, 0, 0, true);
update private.fw_vs_season set season = 202609, prev = null, rolled_at = null where one;
select private.fw_vs_tick() as tick;
select nick, rank, rp from public.fw_vs_standing where season = 202609 order by rank nulls last;

\echo === 6. the cron block without the extension: skipped, nothing raised ===
select count(*) as pg_cron_installed from pg_extension where extname = 'pg_cron';
