-- Experiment 1 (다4 near-miss line, 사5-lite arm 'nm'; docs/qa/owner-decisions-2026-10-30.md) from private.fw_events. Read-only: paste one query
-- at a time into the SQL Editor (it runs as postgres). The arm rides on every event as props.v ('nm:a' as before, 'nm:b' the line); events
-- without it (older builds, the iOS app before its next build) are left out. Go: retry +3 %p or more and runs per session within -3 %.
-- Stop: under +1 %p or runs per session down more than 3 %. Under 4,000 failed runs or 400 players per arm: "not decided yet", run 7 more days.

-- 1. the metric: failed stage runs at 30 %+ of the goal (a lost boss fight counts: pct 1, clr 0) followed by the next run of the same session on
--    the same stage. sn numbers the runs of a session from 1, so "the next run" is sn + 1 in the same session. 30 % is gates * 100 >= 30 * goal, as the
--    client decides it (props.pct is rounded, so 29.5 % would pass on pct). retry_same_stage_pct pools runs, so heavy players weigh more; per_player_pct
--    averages each player's own rate and is the one to judge by when the two disagree.
with r as (
  select player_id, session, substring(props->>'v' from 'nm:([ab])') as arm, props
  from private.fw_events
  where kind = 'run_end' and session is not null and props->>'v' ~ 'nm:[ab]' and jsonb_typeof(props->'sn') = 'number'
), s as (
  select player_id, session, arm, (props->>'sn')::int as sn, props->>'stage' as stage, props from r where props->>'mode' = 'endless'
), f as (
  select * from s
  where jsonb_typeof(props->'goal') = 'number' and (props->>'goal')::int > 0 and (props->>'clr') = '0'
    and jsonb_typeof(props->'gates') = 'number' and (props->>'gates')::numeric * 100 >= 30 * (props->>'goal')::numeric
), t as (
  select f.*, exists (select 1 from s n where n.session = f.session and n.sn = f.sn + 1 and n.stage = f.stage) as retried from f
), p as (
  select arm, player_id, avg(retried::int) as rate from t group by arm, player_id
)
select t.arm, count(*) as failed_runs_30, count(distinct t.player_id) as players,
       round(100.0 * count(*) filter (where t.retried) / count(*), 1) as retry_same_stage_pct,
       (select round(100 * avg(p.rate), 1) from p where p.arm = t.arm) as per_player_pct
from t group by t.arm order by t.arm;

-- 2. the guardrail: runs per session by arm (every mode)
select substring(props->>'v' from 'nm:([ab])') as arm, count(distinct session) as sessions, count(distinct player_id) as players,
       round(count(*)::numeric / nullif(count(distinct session), 0), 2) as runs_per_session
from private.fw_events
where kind = 'run_end' and session is not null and props->>'v' ~ 'nm:[ab]'
group by 1 order by 1;

-- 3. the split itself: players per arm (should be about 50/50; a big gap means the bucket or the config is off)
select substring(props->>'v' from 'nm:([ab])') as arm, count(distinct player_id) as players
from private.fw_events where kind = 'session_start' and props->>'v' ~ 'nm:[ab]'
group by 1 order by 1;
