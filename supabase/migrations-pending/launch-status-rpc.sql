-- Read-only status for the scheduled launch reports (cloud routines on 2026-11-17, 11-18 and 11-30 call it with the public key).
-- Aggregates only: no player ids, names or per-player rows. Owner's decision 2026-10-31 (docs/launch/ranking-runbook-2026-11.md).
create or replace function public.fw_launch_status()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'now_utc', now(),
    'log', coalesce((select jsonb_agg(jsonb_build_object('step', step, 'at', at, 'affected', affected, 'detail', detail) order by id)
                     from private.fw_launch_log), '[]'::jsonb),
    'jobs', coalesce((select jsonb_agg(jsonb_build_object('job', jobname, 'schedule', schedule, 'active', active))
                      from cron.job where jobname like 'fw_launch%'), '[]'::jsonb),
    'archived_rows', (select count(*) from private.fw_scores_beta),
    'board_rows', (select count(*) from public.fw_scores where best > 0 and not hidden),
    -- rows whose best did not come from a post-reset daily run (should be 0 after 11-17)
    'revived_rows', (select count(*) from public.fw_scores
                     where best > 0 and (daily_key is null or daily_key < date '2026-11-17' or best > daily_score)),
    'top50_daily_key_days', (select jsonb_object_agg(d, n) from (
        select coalesce(daily_key::text, 'none') d, count(*) n from (
          select daily_key from public.fw_scores where best > 0 and not hidden order by best desc limit 50) t
        group by 1) x),
    -- experiment 3 (since launch): daily player-days, and those with 3+ daily runs that day
    'daily_player_days', (select count(*) from (
        select player_id, (at at time zone 'utc')::date from private.fw_events
         where kind = 'run_end' and props->>'mode' = 'daily' and at >= timestamptz '2026-11-17 00:00+00'
         group by 1, 2) a),
    'daily_player_days_3plus', (select count(*) from (
        select player_id, (at at time zone 'utc')::date from private.fw_events
         where kind = 'run_end' and props->>'mode' = 'daily' and at >= timestamptz '2026-11-17 00:00+00'
         group by 1, 2 having count(*) >= 3) b),
    'runs_since_launch', (select count(*) from private.fw_events where kind = 'run_end' and at >= timestamptz '2026-11-17 00:00+00'),
    'daily_runs_since_launch', (select count(*) from private.fw_events
         where kind = 'run_end' and props->>'mode' = 'daily' and at >= timestamptz '2026-11-17 00:00+00')
  );
$$;
revoke all on function public.fw_launch_status() from public;
grant execute on function public.fw_launch_status() to anon, authenticated;
