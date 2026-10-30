-- Launch-day ranking reset, scheduled in the database (owner's decision 2026-10-31; runbook docs/launch/ranking-runbook-2026-11.md
-- steps 4 and 5). pg_cron runs the two steps at the agreed times, each only on its own date and only once, then unschedules itself.
--   fw_launch_reset  2026-11-17 00:05 UTC (09:05 KST): archive every fw_scores row into private.fw_scores_beta, then best = 0
--   fw_launch_check  2026-11-18 00:00 UTC (09:00 KST): rows whose best did not come from a post-reset daily run are set back to 0
-- Every step writes a line to private.fw_launch_log. Nothing here is reachable from the API (private schema, no grants).

create table if not exists private.fw_scores_beta (
  player_id uuid, nick text, best integer, gates integer, bird text, daily_key date, daily_score integer, hidden boolean,
  archived_at timestamptz not null default now()
);
create table if not exists private.fw_launch_log (
  id bigserial primary key, step text not null, at timestamptz not null default now(), affected integer, detail text
);
revoke all on private.fw_scores_beta, private.fw_launch_log from public, anon, authenticated;

-- p_today: the UTC date the step thinks it is (tests pass their own); the job passes nothing
create or replace function private.fw_launch_reset(p_today date default (now() at time zone 'utc')::date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_arch integer; v_reset integer;
begin
  if p_today <> date '2026-11-17' then
    insert into private.fw_launch_log (step, affected, detail) values ('reset', 0, 'skipped: not 2026-11-17 (' || p_today || ')');
    return 0;
  end if;
  if exists (select 1 from private.fw_launch_log where step = 'reset' and detail like 'done%') then
    insert into private.fw_launch_log (step, affected, detail) values ('reset', 0, 'skipped: already done');
    return 0;   -- run once: a second call must not wipe the day's new daily bests
  end if;
  insert into private.fw_scores_beta (player_id, nick, best, gates, bird, daily_key, daily_score, hidden)
    select player_id, nick, best, gates, bird, daily_key, daily_score, hidden from public.fw_scores;
  get diagnostics v_arch = row_count;
  update public.fw_scores set best = 0 where best > 0;
  get diagnostics v_reset = row_count;
  insert into private.fw_launch_log (step, affected, detail)
    values ('reset', v_reset, 'done: archived ' || v_arch || ' rows, reset ' || v_reset || ' bests');
  return v_reset;
end $$;

create or replace function private.fw_launch_check(p_today date default (now() at time zone 'utc')::date)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_bad integer;
begin
  if p_today <> date '2026-11-18' then
    insert into private.fw_launch_log (step, affected, detail) values ('check', 0, 'skipped: not 2026-11-18 (' || p_today || ')');
    return 0;
  end if;
  -- after the reset, best may only come from a daily run of 2026-11-17 or later and never exceed that day's daily score
  update public.fw_scores set best = 0
   where best > 0 and (daily_key is null or daily_key < date '2026-11-17' or best > daily_score);
  get diagnostics v_bad = row_count;
  insert into private.fw_launch_log (step, affected, detail)
    values ('check', v_bad, case when v_bad = 0 then 'done: 0 revived rows' else 'done: ' || v_bad || ' revived rows set back to 0' end);
  return v_bad;
end $$;
revoke all on function private.fw_launch_reset(date), private.fw_launch_check(date) from public, anon, authenticated;

select cron.schedule('fw_launch_reset', '5 0 17 11 *',
  $c$set statement_timeout = 0; select private.fw_launch_reset(); select cron.unschedule('fw_launch_reset');$c$);
select cron.schedule('fw_launch_check', '0 0 18 11 *',
  $c$set statement_timeout = 0; select private.fw_launch_check(); select cron.unschedule('fw_launch_check');$c$);
