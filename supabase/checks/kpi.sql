-- Launch KPIs from private.fw_events (supabase/schema.sql, PRODUCT EVENTS). Read-only: paste one query at a time into the
-- SQL Editor (it runs as postgres; the API roles cannot read the table). The marketing plan gates ad spend on
-- D1 >= 35 %, D7 >= 10 %, an average session of 5 min or more, tutorial completion, purchase conversion and ad views.
-- Days are Korean days (Asia/Seoul). A player is an auth user id: a guest's anonymous id lives in one browser, so an
-- install is the first first_open of an id, and a guest who clears the browser comes back as a new install.
-- Rehearsed by supabase/rehearsal/events.sql.

-- 1. installs per day
select (at at time zone 'Asia/Seoul')::date as day, count(*) as installs
from (select player_id, min(at) as at from private.fw_events where kind = 'first_open' group by player_id) i
group by 1 order by 1 desc limit 60;

-- 2. D1 / D7 / D30 retention by install cohort: the share of the cohort with a session_start on day N after the install
--    day (classic "day N", not "day N or later"). A day that has not ended yet shows null.
with inst as (
  select player_id, (min(at) at time zone 'Asia/Seoul')::date as d0 from private.fw_events where kind = 'first_open' group by player_id
), act as (
  select distinct player_id, (at at time zone 'Asia/Seoul')::date as d from private.fw_events where kind = 'session_start'
), today as (select (now() at time zone 'Asia/Seoul')::date as d)
select i.d0 as cohort, count(*) as installs,
       case when i.d0 + 1  < (select d from today) then round(100.0 * count(a1.player_id)  / count(*), 1) end as d1,
       case when i.d0 + 7  < (select d from today) then round(100.0 * count(a7.player_id)  / count(*), 1) end as d7,
       case when i.d0 + 30 < (select d from today) then round(100.0 * count(a30.player_id) / count(*), 1) end as d30
from inst i
left join act a1  on a1.player_id  = i.player_id and a1.d  = i.d0 + 1
left join act a7  on a7.player_id  = i.player_id and a7.d  = i.d0 + 7
left join act a30 on a30.player_id = i.player_id and a30.d = i.d0 + 30
group by i.d0 order by i.d0 desc limit 60;

-- 3. session length per day (by the session's first event). A session's length is the largest session_end.dur (visible
--    seconds, sent on hide with fetch keepalive); a session whose end never arrived (killed tab, offline) falls back to the
--    span between its first and last event, which undercounts it.
with s as (
  select session, min(at) as t0,
         coalesce(max(case when kind = 'session_end' and jsonb_typeof(props->'dur') = 'number' then (props->>'dur')::numeric end),
                  extract(epoch from max(at) - min(at))) as sec
  from private.fw_events where session is not null and at > now() - interval '60 days' group by session
)
select (t0 at time zone 'Asia/Seoul')::date as day, count(*) as sessions,
       round(avg(sec) / 60, 2) as avg_session_min,
       round((percentile_cont(.5) within group (order by sec))::numeric / 60, 2) as median_session_min
from s group by 1 order by 1 desc limit 60;

-- 4. tutorial completion by install cohort: tutorial_done fires when the first-run tips finish (fw27_tut set to 1), either
--    by the last tip running out (how = 'tips') or by the first run ending after the second tip (how = 'run').
with inst as (
  select player_id, (min(at) at time zone 'Asia/Seoul')::date as d0 from private.fw_events where kind = 'first_open' group by player_id
), tut as (select distinct player_id from private.fw_events where kind = 'tutorial_done')
select i.d0 as cohort, count(*) as installs, count(t.player_id) as tutorial_done,
       round(100.0 * count(t.player_id) / count(*), 1) as tutorial_rate
from inst i left join tut t using (player_id)
group by i.d0 order by i.d0 desc limit 60;

-- 5. the daily board: DAU (players with any event), runs per DAU, share rate (sharers / DAU), purchase conversion
--    (buyers / DAU; shop_buy is the test-build shop where nothing is paid, purchase is reserved for real payments),
--    ad views (zero while FW_CONFIG.ads is 'none').
select (at at time zone 'Asia/Seoul')::date as day,
       count(distinct player_id) as dau,
       round(count(*) filter (where kind = 'run_end')::numeric / count(distinct player_id), 2) as runs_per_dau,
       round(100.0 * count(distinct player_id) filter (where kind = 'share') / count(distinct player_id), 1) as share_rate,
       round(100.0 * count(distinct player_id) filter (where kind in ('shop_buy', 'purchase')) / count(distinct player_id), 2) as purchase_conversion,
       count(*) filter (where kind = 'ad_view') as ad_views,
       count(*) filter (where kind = 'daily_done') as daily_runs
from private.fw_events where at > now() - interval '60 days'
group by 1 order by 1 desc limit 60;

-- 6. purchase conversion by install cohort: the share of each cohort that ever bought
with inst as (
  select player_id, (min(at) at time zone 'Asia/Seoul')::date as d0 from private.fw_events where kind = 'first_open' group by player_id
), buy as (select distinct player_id from private.fw_events where kind in ('shop_buy', 'purchase'))
select i.d0 as cohort, count(*) as installs, count(b.player_id) as buyers,
       round(100.0 * count(b.player_id) / count(*), 2) as purchase_conversion
from inst i left join buy b using (player_id)
group by i.d0 order by i.d0 desc limit 60;
