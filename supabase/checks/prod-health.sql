-- Read-only health check of the production database against supabase/schema.sql.
-- Paste into the SQL Editor and run; it changes nothing. Each column should read as noted.
with want(kind, name) as (values
  ('T','private.fw_friend_req'),('T','private.fw_social'),('T','private.fw_social_feed'),('T','public.fw_friends'),('T','public.fw_saves'),
  ('F','private.fw_friend_remove'),('F','private.fw_friend_request'),('F','private.fw_friend_respond'),('F','private.fw_save_get'),('F','private.fw_save_me'),
  ('F','private.fw_save_put'),('F','private.fw_scores_best_notify'),('F','private.fw_social_cfg'),('F','private.fw_social_hello'),('F','private.fw_social_me'),
  ('F','private.fw_social_row'),('F','private.fw_vs_ffa_vec_ok'),('F','private.fw_vs_roster_ffa'),('F','private.fw_vs_settle_ffa'),
  ('F','public.friend_remove'),('F','public.friend_request'),('F','public.friend_respond'),('F','public.save_get'),('F','public.save_put'),
  ('F','public.social_hello'),('F','public.social_me'))
select
  -- expected: null (every table and function of the current schema exists)
  (select string_agg(name, ', ') from want where (kind = 'T' and to_regclass(name) is null)
     or (kind = 'F' and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || '.' || p.proname = name))) as missing_in_production,
  -- expected: null (the guild feature was removed)
  (select string_agg(n.nspname || '.' || c.relname, ', ') from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relname ilike '%guild%') as guild_leftovers,
  -- expected: true, true (leaderboard hardening of 2026-10-15)
  position('c_gates_per_s' in pg_get_functiondef('private.fw_submit_score(integer,integer,text,text,text,text,text,text)'::regprocedure)) > 0 as time_budget_kept,
  position('not v.hidden' in pg_get_functiondef('private.fw_vs_tick()'::regprocedure)) > 0 as tick_hidden_kept,
  -- expected: 1, and recent runs reading "succeeded"
  (select count(*) from cron.job where jobname = 'fw_vs_rollover' and active) as cron_job,
  (select string_agg(status || ' ' || to_char(start_time at time zone 'Asia/Seoul', 'MM-DD HH24:MI'), ', ' order by start_time desc)
     from (select status, start_time from cron.job_run_details order by start_time desc limit 5) d) as cron_runs_kst,
  (select row_to_json(s) from private.fw_vs_season s) as season,
  (select count(*) from auth.users) as auth_users,
  (select count(*) from auth.users where not coalesce(is_anonymous, false)) as signed_in_accounts;
