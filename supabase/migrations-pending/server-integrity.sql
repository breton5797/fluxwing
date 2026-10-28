-- Production SQL for PR fix/server-integrity, cut verbatim from supabase/schema.sql (the owner applies it; Claude never does).
-- Every statement is idempotent (create or replace / if not exists), as schema.sql itself.

-- 1. tables and the new column

alter table public.fw_versus add column if not exists ai integer not null default 0;

create table if not exists private.fw_vs_wins (
  season    integer not null,
  player_id uuid    not null references auth.users (id) on delete cascade,
  rival_id  uuid    not null references auth.users (id) on delete cascade,
  n         integer not null default 0,
  primary key (season, player_id, rival_id),
  constraint fw_vs_wins_n_chk check (n >= 0)
);
alter table private.fw_vs_wins enable row level security;   -- no policy, as for the match bookkeeping
revoke all on table private.fw_vs_wins from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_vs_wins to service_role;

create table if not exists private.fw_vs_ai_log (
  id        bigint      generated always as identity primary key,
  player_id uuid        not null references auth.users (id) on delete cascade,
  at        timestamptz not null default now(),
  result    text        not null,
  delta     integer     not null,
  constraint fw_vs_ai_log_result_chk check (result in ('win', 'lose', 'draw'))
);
create index if not exists fw_vs_ai_log_player_idx on private.fw_vs_ai_log (player_id, at desc);
alter table private.fw_vs_ai_log enable row level security;
revoke all on table private.fw_vs_ai_log from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_vs_ai_log to service_role;

-- 2. functions (new and changed)

create or replace function private.fw_vs_first_cfg(
  out first_season integer, out min_matches integer, out ai_pct integer, out ai_per_day integer, out ai_per_season integer, out ai_gap interval
) language sql immutable set search_path = '' as $$
  select 202611, 3, 50, 5, 40, interval '20 seconds';
$$;

create or replace function private.fw_vs_min_matches(p_season integer) returns integer
language sql immutable set search_path = '' as $$
  select case when p_season <= f.first_season then f.min_matches else c.min_matches end
  from private.fw_vs_first_cfg() f, private.fw_vs_season_cfg() c;
$$;

create or replace function private.fw_vs_ai_state(p_uid uuid, p_season integer) returns jsonb
language sql stable set search_path = '' as $$
  select case when p_season <= f.first_season then jsonb_build_object(
      'rp', round(c.rp_win * f.ai_pct / 100.0)::integer, 'per_day', f.ai_per_day,
      'left', greatest(0, least(
        f.ai_per_day - (select count(*) from private.fw_vs_ai_log l
                        where l.player_id = p_uid and l.at >= (date_trunc('day', now() at time zone s.tz) at time zone s.tz))::integer,
        f.ai_per_season - coalesce((select v.ai from public.fw_versus v where v.player_id = p_uid), 0)))) end
  from private.fw_vs_first_cfg() f, private.fw_vs_cfg() c, private.fw_vs_season_cfg() s;
$$;

create or replace function private.fw_vs_tally(p_uid uuid, p_rivals uuid[]) returns void
language sql set search_path = '' as $$
  insert into private.fw_vs_wins as w (season, player_id, rival_id, n)
  select s.season, p_uid, x.id, 1 from private.fw_vs_season s, (select distinct r as id from unnest(p_rivals) r) x
  where x.id is not null and x.id <> p_uid
  on conflict (season, player_id, rival_id) do update set n = w.n + 1;
$$;

create or replace function private.fw_vs_collude_cfg(out min_wins integer, out max_foes integer, out share numeric)
language sql immutable set search_path = '' as $$
  select 5, 2, 0.66;
$$;

create or replace function private.fw_vs_collusion(p_season integer, p_uid uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('beat', coalesce(sum(w.n), 0), 'foes', count(w.n),
           'top2', case when coalesce(sum(w.n), 0) > 0 then round(coalesce(sum(w.n) filter (where w.rk <= k.max_foes), 0)::numeric / sum(w.n), 2) end,
           'flag', coalesce(sum(w.n), 0) >= k.min_wins and coalesce(sum(w.n) filter (where w.rk <= k.max_foes), 0) >= k.share * sum(w.n))
  from private.fw_vs_collude_cfg() k
  left join (select x.n, row_number() over (order by x.n desc, x.rival_id) as rk
             from private.fw_vs_wins x where x.season = p_season and x.player_id = p_uid) w on true
  group by k.min_wins, k.max_foes, k.share;
$$;

create or replace function private.fw_vs_tick() returns integer
language plpgsql set search_path = '' as $$
declare
  c_key constant bigint := hashtextextended('fw_vs_season', 0);
  v_now integer := private.fw_vs_season_of(now());
  v_cur integer;
  v_min integer;
  v_riv integer;
begin
  select s.season into v_cur from private.fw_vs_season s;
  if v_cur >= v_now then            -- the usual case (also a call whose clock is still in the month before a rollover already done)
    perform pg_advisory_xact_lock_shared(c_key);
    select s.season into v_cur from private.fw_vs_season s;   -- as it is now that no rollover can be running
    return v_cur;
  end if;
  perform pg_advisory_xact_lock(c_key);   -- waits for every call in flight; held to the end of this call
  select s.season into v_cur from private.fw_vs_season s for update;
  if not found then                 -- the seed row was removed by hand: start a season, archive nothing
    insert into private.fw_vs_season (season) values (v_now) on conflict (one) do nothing;
    return v_now;
  end if;
  if v_cur >= v_now then return v_cur; end if;   -- another call did it while this one waited

  -- Archive, unless this season already has standings. That cannot be while the state row is right; it is the case
  -- when the row was set back by hand to a season archived before. Then the first archive stands untouched and the
  -- numbers now in fw_versus are only reset: ranking them again would start at rank 1 a second time and break the
  -- unique (season, rank) index on every call ("on conflict (season, player_id)" does not cover that index), which
  -- would stop the rollover, and with it every versus call, for good.
  if not exists (select 1 from public.fw_vs_standing t where t.season = v_cur) then
    v_min := private.fw_vs_min_matches(v_cur);   -- 3 in the first season, else fw_vs_season_cfg().min_matches
    v_riv := private.fw_vs_min_rivals(v_cur);
    -- a rank needs min_matches matches, fw_vs_min_rivals() different rivals and an account (a guest row is archived without a rank);
    -- hidden: archived, no rank
    insert into public.fw_vs_standing (season, player_id, rank, rp, tier, wins, losses, draws, matches, nick, cc, bird)
    select v_cur, x.player_id,
           case when x.ok then (row_number() over (partition by x.ok order by x.rp desc, x.wins desc, x.updated_at, x.player_id))::integer end,
           x.rp, private.fw_vs_tier(x.rp), x.wins, x.losses, x.draws, x.n, x.nick, x.cc, x.bird
    from (select v.player_id, v.rp, v.wins, v.losses, v.draws, v.updated_at, v.nick, v.cc, v.bird,
                 v.wins + v.losses + v.draws as n,
                 v.wins + v.losses + v.draws >= v_min and cardinality(v.rivals) >= v_riv and not v.hidden
                   and coalesce((select to_jsonb(u) ->> 'is_anonymous' from auth.users u where u.id = v.player_id), 'false') <> 'true' as ok
          from public.fw_versus v where v.wins + v.losses + v.draws > 0) x;
  end if;
  update public.fw_versus set rp = 0, wins = 0, losses = 0, draws = 0, rivals = '{}', ai = 0 where rp <> 0 or wins <> 0 or losses <> 0 or draws <> 0 or ai <> 0;
  delete from private.fw_vs_wins w where w.season < v_cur;   -- the season just closed stays for the admin review of its top 10 (fw_vs_collusion)
  update private.fw_vs_season set season = v_now, prev = v_cur, rolled_at = now() where one;   -- "where": the API roles run with pg_safeupdate, which refuses an UPDATE without one
  return v_now;
end;
$$;

create or replace function private.fw_vs_settle(p_match text) returns void
language plpgsql set search_path = '' as $$
declare
  c       record;
  v_now   timestamptz := now();
  v_m     private.fw_vs_match%rowtype;
  v_n     integer;   -- registered
  v_rep   integer;   -- reported
  v_teams integer;   -- teams present
  v_views integer;   -- different outcomes among the reports
  v_out   integer;   -- the outcome, when there is exactly one
  v_why   text;
  v_d     integer;
  v_old   integer;
  v_riv   uuid[];    -- the other team: this player's rivals in the match
  v_avg   numeric[]; -- each team's average RP before this match (Elo)
  v_again integer;   -- earlier ranked matches against these rivals within the pair window
  r       record;
begin
  select * into c from private.fw_vs_cfg();
  select * into v_m from private.fw_vs_match where id = p_match for update;
  if not found or v_m.status <> 'open' then return; end if;
  if v_m.mode = 'ffa' then perform private.fw_vs_settle_ffa(p_match); return; end if;   -- its own rules, the team branch below is untouched

  select count(*), count(x.o), count(distinct x.team), count(distinct x.o), min(x.o)
    into v_n, v_rep, v_teams, v_views, v_out
  from (select p.team,
               case when p.result is null then null when p.result = 'draw' then 2
                    when (p.result = 'win') = (p.team = 0) then 0 else 1 end as o
        from private.fw_vs_part p where p.match_id = p_match) x;

  if v_views > 1 then
    v_why := 'conflict'; v_out := null;
  elsif v_n > 0 and v_rep = v_n
        and (v_n >= case v_m.mode when '2v2' then 4 else 2 end or v_now >= v_m.started_at + c.join_window) then
    if v_teams = 2 then v_why := 'agreed'; else v_why := 'one_team'; v_out := null; end if;
  elsif v_rep > 0 and v_now >= greatest(v_m.started_at + c.settle_after, v_m.first_report_at + c.report_grace) then
    if v_teams < 2 then v_why := 'one_team'; v_out := null; else v_why := 'timeout'; end if;
  elsif v_rep = 0 and v_now >= v_m.started_at + c.void_after then
    v_why := case when v_teams < 2 then 'one_team' else 'no_report' end;
  else
    return;   -- still open
  end if;

  if v_out is null then
    update private.fw_vs_match set status = 'void', why = v_why, settled_at = v_now where id = p_match;
    return;
  end if;

  v_avg := array(select coalesce(avg(coalesce(v.rp, 0)), 0) from generate_series(0, 1) g(k)
    left join private.fw_vs_part p on p.match_id = p_match and p.team = g.k left join public.fw_versus v on v.player_id = p.player_id group by g.k order by g.k);
  for r in select p.player_id, p.team, p.nick, p.cc, p.bird from private.fw_vs_part p where p.match_id = p_match order by p.player_id loop
    v_riv := array(select q.player_id from private.fw_vs_part q where q.match_id = p_match and q.team <> r.team);
    select coalesce(max(z.n), 0)::integer into v_again from (select count(*) as n from private.fw_vs_part a
      join private.fw_vs_part b on b.match_id = a.match_id and b.team <> a.team join private.fw_vs_match m on m.id = a.match_id
      where a.player_id = r.player_id and b.player_id = any(v_riv) and m.id <> p_match and m.status = 'settled' and m.settled_at > v_now - c.pair_window
      group by b.player_id) z;
    v_d := case when v_out = 2 then 0 else private.fw_vs_delta(round(v_avg[r.team + 1])::integer, round(v_avg[2 - r.team])::integer,
      case when r.team = v_out then 'win' else 'lose' end, v_again) end;   -- Elo by the sides' average RP, less for a rival met again
    insert into public.fw_versus (player_id, nick, cc, bird) values (r.player_id, r.nick, r.cc, r.bird)
    on conflict (player_id) do nothing;
    select v.rp into strict v_old from public.fw_versus v where v.player_id = r.player_id for update;
    v_riv := array(select q.player_id from private.fw_vs_part q where q.match_id = p_match and q.team <> r.team);
    update public.fw_versus set
      nick = r.nick, cc = r.cc, bird = r.bird, rivals = private.fw_vs_rivals(rivals, v_riv),
      rp     = greatest(0, v_old + v_d),
      wins   = wins   + (v_d > 0)::integer,
      losses = losses + (v_d < 0)::integer,
      draws  = draws  + (v_d = 0)::integer,
      updated_at = v_now
    where player_id = r.player_id;
    if v_d > 0 then perform private.fw_vs_tally(r.player_id, v_riv); end if;   -- wins per rival, for the collusion check
    update private.fw_vs_part set
      final = case when v_d > 0 then 'win' when v_d < 0 then 'lose' else 'draw' end,
      delta = greatest(0, v_old + v_d) - v_old
    where match_id = p_match and player_id = r.player_id;
  end loop;
  update private.fw_vs_match set status = 'settled', outcome = v_out, why = v_why, settled_at = v_now where id = p_match;
end;
$$;

create or replace function private.fw_vs_settle_ffa(p_match text) returns void
language plpgsql set search_path = '' as $$
declare
  c      record;
  v_now  timestamptz := now();
  v_m    private.fw_vs_match%rowtype;
  v_n    integer;    -- registered
  v_rep  integer;    -- reported
  v_views integer;   -- distinct report vectors
  v_top  integer;    -- reports agreeing on the most common vector
  v_vec  text;
  v_ranks integer[];
  v_place integer;
  v_k    integer;
  v_sum  integer;
  v_d    integer;
  v_old  integer;
  v_riv  uuid[];     -- every other seat: this player's rivals in the match
  v_why  text;
  r      record;
begin
  select * into c from private.fw_vs_cfg();
  select * into v_m from private.fw_vs_match where id = p_match for update;
  if not found or v_m.status <> 'open' or v_m.mode <> 'ffa' then return; end if;

  select count(*), count(p.result) into v_n, v_rep from private.fw_vs_part p where p.match_id = p_match;
  select count(*), coalesce(max(g.cnt), 0), (array_agg(g.result order by g.cnt desc))[1]
    into v_views, v_top, v_vec
  from (select p.result, count(*) as cnt from private.fw_vs_part p
        where p.match_id = p_match and p.result is not null group by p.result) g;

  if v_views > 1 then
    v_why := 'conflict';                                    -- any disagreement voids: nobody referees a 4-way match
  elsif v_n = 4 and v_rep = 4 then
    v_why := 'agreed';
  elsif v_rep > 0 and v_now >= greatest(v_m.started_at + c.settle_after, v_m.first_report_at + c.report_grace) then
    v_why := case when v_n < 4 then 'short'                 -- a seat never registered: never rank an absent player
                  when v_top >= 2 then 'timeout'            -- quorum: at least two equal reports
                  else 'no_quorum' end;
  elsif v_rep = 0 and v_now >= v_m.started_at + c.void_after then
    v_why := 'no_report';
  else
    return;   -- still open
  end if;

  if v_why not in ('agreed', 'timeout') then
    update private.fw_vs_match set status = 'void', why = v_why, settled_at = v_now where id = p_match;
    return;
  end if;

  v_ranks := string_to_array(v_vec, ',')::integer[];
  for r in select p.player_id, p.team, p.nick, p.cc, p.bird from private.fw_vs_part p where p.match_id = p_match order by p.player_id loop
    v_place := v_ranks[r.team + 1];
    v_k := (select count(*) from unnest(v_ranks) x where x = v_place);
    v_sum := 0; for i in v_place..(v_place + v_k - 1) loop v_sum := v_sum + c.ffa_rp[i]; end loop;
    v_d := trunc(v_sum::numeric / v_k);
    insert into public.fw_versus (player_id, nick, cc, bird) values (r.player_id, r.nick, r.cc, r.bird)
    on conflict (player_id) do nothing;
    select v.rp into strict v_old from public.fw_versus v where v.player_id = r.player_id for update;
    v_riv := array(select q.player_id from private.fw_vs_part q where q.match_id = p_match and q.team <> r.team);
    update public.fw_versus set
      nick = r.nick, cc = r.cc, bird = r.bird, rivals = private.fw_vs_rivals(rivals, v_riv),
      rp     = greatest(0, v_old + v_d),
      wins   = wins   + (v_d > 0)::integer,
      losses = losses + (v_d < 0)::integer,
      draws  = draws  + (v_d = 0)::integer,
      updated_at = v_now
    where player_id = r.player_id;
    if v_d > 0 then perform private.fw_vs_tally(r.player_id, v_riv); end if;   -- wins per rival, for the collusion check
    update private.fw_vs_part set
      final = v_vec,
      delta = greatest(0, v_old + v_d) - v_old
    where match_id = p_match and player_id = r.player_id;
  end loop;
  update private.fw_vs_match set status = 'settled', outcome = null, why = v_why, settled_at = v_now where id = p_match;
end;
$$;

create or replace function private.fw_versus_me() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_season integer;
  v_prev   integer;
begin
  if v_uid is null then
    raise exception 'fw_auth: sign-in required' using errcode = '28000';
  end if;
  v_season := private.fw_vs_tick();   -- lock order 0
  select s.prev into v_prev from private.fw_vs_season s;
  perform private.fw_vs_sweep(v_uid);
  return private.fw_vs_row(v_uid) || jsonb_build_object(
    'pending', (select count(*) from private.fw_vs_part p join private.fw_vs_match m on m.id = p.match_id
                where p.player_id = v_uid and m.status = 'open'),
    'last', (select private.fw_vs_state(v_uid, p.match_id) from private.fw_vs_part p
             where p.player_id = v_uid order by p.joined_at desc limit 1),
    'season', v_season, 'season_end', private.fw_vs_season_end(v_season), 'prev', v_prev,
    'need', private.fw_vs_min_matches(v_season),
    'ai', private.fw_vs_ai_state(v_uid, v_season),   -- first season: what a 1v1 against the AI counts (versus_ai), else null
    'need_rivals', private.fw_vs_min_rivals(v_season),
    -- past results not claimed yet, oldest first: every ranked one, and the unranked one of the season just closed
    -- (that one carries no reward and cannot be claimed; the client shows it once)
    'results', (select coalesce(jsonb_agg(private.fw_vs_result(v_uid, x.season) order by x.season), '[]'::jsonb)
                from (select t.season from public.fw_vs_standing t
                      where t.player_id = v_uid and t.claimed_at is null and (t.rank is not null or t.season = v_prev)
                      order by t.season limit 12) x));
end;
$$;

create or replace function private.fw_versus_ai(p_result text, p_nick text, p_cc text, p_bird text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c        record;
  f        record;
  v_uid    uuid        := (select auth.uid());
  v_now    timestamptz := now();
  v_tz     text        := (select s.tz from private.fw_vs_season_cfg() s);
  v_season integer;
  v_n      integer;
  v_last   timestamptz;
  v_old    integer;
  v_ai     integer;
  v_d      integer;
  v_cc     text;
begin
  if v_uid is null then
    raise exception 'fw_auth: sign-in required' using errcode = '28000';
  end if;
  perform private.fw_need_account(v_uid);   -- ranked play is for accounts: a guest plays the AI as practice
  if p_result is null or p_result not in ('win', 'lose', 'draw')
     or p_bird is null or not (p_bird = any (private.fw_units()))
     or char_length(coalesce(p_nick, '')) > 200 or char_length(coalesce(p_cc, '')) > 8 then   -- before the season gate, as versus_start
    raise exception 'fw_bad_input: unknown result or unit, or a field too long' using errcode = '22023';
  end if;
  v_season := private.fw_vs_tick();   -- lock order 0
  select * into f from private.fw_vs_first_cfg();
  if v_season > f.first_season then
    return jsonb_build_object('counted', false, 'why', 'season');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));   -- lock order d: the caller's settle lock, then its fw_versus row (e.)
  select * into c from private.fw_vs_cfg();
  select count(*) into v_n from private.fw_vs_ai_log l
  where l.player_id = v_uid and l.at >= (date_trunc('day', v_now at time zone v_tz) at time zone v_tz);
  select max(l.at) into v_last from private.fw_vs_ai_log l where l.player_id = v_uid;   -- the gap holds across midnight too
  if v_n >= f.ai_per_day then return jsonb_build_object('counted', false, 'why', 'cap'); end if;
  if v_last > v_now - f.ai_gap then return jsonb_build_object('counted', false, 'why', 'soon'); end if;
  v_cc := case when coalesce(p_cc, '') ~ '^[A-Za-z]{2}$' then upper(p_cc) else '' end;
  begin
    insert into public.fw_versus (player_id, nick, cc, bird) values (v_uid, private.fw_vs_nick(p_nick), v_cc, p_bird)
    on conflict (player_id) do nothing;
  exception when foreign_key_violation then
    raise exception 'fw_auth: unknown player' using errcode = '28000';   -- token of a deleted user: the client signs in again
  end;
  select v.rp, v.ai into strict v_old, v_ai from public.fw_versus v where v.player_id = v_uid for update;
  if v_ai >= f.ai_per_season then return jsonb_build_object('counted', false, 'why', 'full'); end if;
  v_d := case p_result when 'win' then round(c.rp_win * f.ai_pct / 100.0)::integer
                       when 'lose' then -round(c.rp_loss * f.ai_pct / 100.0)::integer else 0 end;
  update public.fw_versus set
    nick = private.fw_vs_nick(p_nick), cc = v_cc, bird = p_bird,
    rp     = greatest(0, v_old + v_d),
    wins   = wins   + (p_result = 'win')::integer,
    losses = losses + (p_result = 'lose')::integer,
    draws  = draws  + (p_result = 'draw')::integer,
    ai     = ai + 1,
    updated_at = v_now
  where player_id = v_uid;
  insert into private.fw_vs_ai_log (player_id, result, delta) values (v_uid, p_result, greatest(0, v_old + v_d) - v_old);
  delete from private.fw_vs_ai_log l where l.player_id = v_uid and l.at < v_now - interval '2 days';
  return jsonb_build_object('counted', true, 'delta', greatest(0, v_old + v_d) - v_old,
    'left', least(f.ai_per_day - v_n, f.ai_per_season - v_ai) - 1, 'me', private.fw_vs_row(v_uid));
end;
$$;

create or replace function public.versus_ai(p_result text, p_nick text, p_cc text, p_bird text) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.fw_versus_ai(p_result, p_nick, p_cc, p_bird);
$$;

create or replace function private.fw_ref_cfg(
  out days integer, out stage integer, out min_best integer, out gems integer, out ms integer[], out ms_gems integer[],
  out month_cap integer, out new_window interval, out burst_n integer, out burst_window interval
) language sql immutable set search_path = '' as $$
  select 3, 10, 30, 30, array[3,10,25], array[50,150,500], 25, interval '24 hours', 5, interval '1 hour';
$$;

create or replace function private.fw_ref_hold() returns interval
language sql immutable set search_path = '' as $$
  select interval '24 hours';
$$;

create or replace function private.fw_referral_link(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c     record := private.fw_ref_cfg();
  s     record := private.fw_social_cfg();
  v_me  uuid   := (select auth.uid());
  v_to  uuid;
  v_at  timestamptz;
  v_today date := (now() at time zone 'utc')::date;
  v_row private.fw_social%rowtype;
  v_burst integer;
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  -- the invited player needs a real account (owner's decision 2026-10-28): guests are free and only IP-rate-limited, so scripted
  -- guests could otherwise be invitees by the dozen. Raised, not answered, so the client keeps the code and sends it again after
  -- its sign-in (the quota below is not spent: the error rolls the call back)
  perform private.fw_need_account(v_me);
  if p_code is null or upper(p_code) !~ '^[0-9A-HJKMNP-TV-Z]{8}$' then raise exception 'fw_bad_input: bad code' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_me::text, 2));   -- the caller's friend writes (fw_friend_request takes the same lock)
  v_row := private.fw_social_row(v_me, true);
  if v_row.req_day is distinct from v_today then v_row.req_day := v_today; v_row.req_count := 0; end if;
  if v_row.req_count >= s.req_per_day then raise exception 'fw_rate_limited: too many requests today' using errcode = 'P0001'; end if;
  update private.fw_social set req_day = v_row.req_day, req_count = v_row.req_count + 1 where player_id = v_me;
  if exists (select 1 from private.fw_referrals r where r.invitee_id = v_me) then return jsonb_build_object('status', 'already'); end if;
  select x.player_id into v_to from private.fw_social x where x.code = upper(p_code);
  if v_to is null then return jsonb_build_object('status', 'unknown'); end if;
  if v_to = v_me or exists (select 1 from private.fw_referrals r where r.invitee_id = v_to and r.inviter_id = v_me) then
    return jsonb_build_object('status', 'self');   -- my own code, or the friend I invited inviting me back
  end if;
  select u.created_at into v_at from auth.users u where u.id = v_me;
  if v_at is null or v_at < now() - c.new_window then return jsonb_build_object('status', 'old'); end if;   -- an existing player opening a link
  perform pg_advisory_xact_lock(hashtextextended(v_to::text, 3));   -- the inviter's referral writes (the claim takes the same lock)
  insert into private.fw_referrals (invitee_id, inviter_id) values (v_me, v_to);
  select count(*) into v_burst from private.fw_referrals r where r.inviter_id = v_to and r.linked_at > now() - c.burst_window;
  if v_burst > c.burst_n then   -- many friends in a short time: hold the whole burst for review
    update private.fw_referrals r set held = true
    where r.inviter_id = v_to and r.linked_at > now() - c.burst_window and r.payout_id is null and not r.held;
  end if;
  -- play together: the two become friends (when both lists have room); a pending request either way is settled by it
  if (select count(*) from public.fw_friends f where v_me in (f.a, f.b)) < s.friend_cap
     and (select count(*) from public.fw_friends f where v_to in (f.a, f.b)) < s.friend_cap then
    insert into public.fw_friends (a, b) values (least(v_me, v_to), greatest(v_me, v_to)) on conflict do nothing;
    delete from private.fw_friend_req r where (r.from_id, r.to_id) in ((v_me, v_to), (v_to, v_me));
  end if;
  return jsonb_build_object('status', 'linked');
end $$;

create or replace function private.fw_referral_progress(p_stage integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c     record := private.fw_ref_cfg();
  v_me  uuid   := (select auth.uid());
  v_today date := (now() at time zone 'utc')::date;
  v_r   private.fw_referrals%rowtype;
  v_best integer;
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  perform private.fw_need_account(v_me);   -- as fw_referral_link: a guest's progress does not count (the client sends none)
  if p_stage is null or p_stage < 1 or p_stage > 50 then raise exception 'fw_bad_input: bad stage' using errcode = '22023'; end if;
  select * into v_r from private.fw_referrals r where r.invitee_id = v_me for update;
  if not found then return jsonb_build_object('status', 'none'); end if;
  if v_r.done_at is not null then return jsonb_build_object('status', 'done', 'days', v_r.days, 'stage', v_r.stage); end if;
  if v_r.last_day is distinct from v_today then v_r.days := v_r.days + 1; v_r.last_day := v_today; end if;
  v_r.stage := greatest(v_r.stage, p_stage);
  select sc.best into v_best from public.fw_scores sc where sc.player_id = v_me;
  if v_r.days >= c.days and v_r.stage >= c.stage and coalesce(v_best, 0) >= c.min_best then v_r.done_at := now(); end if;
  update private.fw_referrals r set days = v_r.days, last_day = v_r.last_day, stage = v_r.stage, done_at = v_r.done_at where r.invitee_id = v_me;
  return jsonb_build_object('status', case when v_r.done_at is null then 'open' else 'done' end, 'days', v_r.days, 'stage', v_r.stage);
end $$;

create or replace function private.fw_referral_me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c     record := private.fw_ref_cfg();
  v_me  uuid   := (select auth.uid());
  v_row private.fw_social%rowtype;
  v_inv private.fw_ref_inviter%rowtype;
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  v_row := private.fw_social_row(v_me);
  select * into v_inv from private.fw_ref_inviter i where i.player_id = v_me;
  return jsonb_build_object('code', v_row.code, 'paid', coalesce(v_inv.paid, 0), 'ms_paid', coalesce(v_inv.ms_paid, 0),
    'month', private.fw_ref_month(v_me), 'cap', c.month_cap,
    'ready', (select count(*) from private.fw_referrals r where r.inviter_id = v_me and r.done_at is not null and not r.held and r.payout_id is null
                and r.linked_at <= now() - private.fw_ref_hold()),   -- what a claim would pay now (a friend done within 24 h of the link waits)
    'held',  (select count(*) from private.fw_referrals r where r.inviter_id = v_me and r.held and r.payout_id is null),
    'open',  (select count(*) from private.fw_referrals r where r.inviter_id = v_me and r.done_at is null),
    'friends', (select coalesce(jsonb_agg(jsonb_build_object('nick', coalesce(sc.nick, 'Pilot'), 'days', x.days, 'stage', x.stage,
                  'done', x.done_at is not null) order by x.linked_at desc), '[]'::jsonb)
                from (select * from private.fw_referrals r where r.inviter_id = v_me order by r.linked_at desc limit 30) x
                left join public.fw_scores sc on sc.player_id = x.invitee_id),
    'payouts', private.fw_ref_unacked(v_me));
end $$;

create or replace function private.fw_referral_claim(p_nonce text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c      record := private.fw_ref_cfg();
  v_me   uuid   := (select auth.uid());
  v_inv  private.fw_ref_inviter%rowtype;
  v_ids  uuid[];
  v_n    integer;
  v_gems integer;
  v_ms   integer[] := '{}';
  v_msp  integer;
  v_id   bigint;
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  if p_nonce !~ '^[0-9a-f]{32}$' then raise exception 'fw_bad_input: bad nonce' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_me::text, 3));   -- a double tap waits here and then finds nothing left to book
  begin
    insert into private.fw_ref_inviter (player_id) values (v_me) on conflict (player_id) do nothing;
  exception when foreign_key_violation then raise exception 'fw_auth: unknown player' using errcode = '28000';
  end;
  select * into strict v_inv from private.fw_ref_inviter i where i.player_id = v_me for update;
  select array_agg(x.invitee_id) into v_ids from (
    select r.invitee_id from private.fw_referrals r
    where r.inviter_id = v_me and r.done_at is not null and not r.held and r.payout_id is null
      and r.linked_at <= now() - private.fw_ref_hold()   -- the 24-hour hold after the link
    order by r.done_at, r.invitee_id limit greatest(0, c.month_cap - private.fw_ref_month(v_me))) x;
  v_n := coalesce(cardinality(v_ids), 0);
  if v_n > 0 then
    v_gems := v_n * c.gems; v_msp := v_inv.ms_paid;
    for i in 1 .. cardinality(c.ms) loop
      if i > v_msp and v_inv.paid + v_n >= c.ms[i] then v_gems := v_gems + c.ms_gems[i]; v_ms := v_ms || c.ms[i]; v_msp := i; end if;
    end loop;
    insert into private.fw_ref_payouts (inviter_id, gems, invites, ms) values (v_me, v_gems, v_n, v_ms) returning id into v_id;
    update private.fw_referrals r set payout_id = v_id where r.invitee_id = any (v_ids);
    update private.fw_ref_inviter i set paid = v_inv.paid + v_n, ms_paid = v_msp where i.player_id = v_me;
  end if;
  if p_nonce is not null then
    update private.fw_ref_payouts p set nonce = p_nonce where p.inviter_id = v_me and p.acked_at is null and p.nonce is null;
  end if;
  return jsonb_build_object('booked', v_id, 'payouts', private.fw_ref_unacked(v_me, p_nonce));
end $$;

create or replace function private.fw_admin_season() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.fw_admin_gate('mod');
  select jsonb_build_object('season', q.season, 'prev', q.prev, 'rolled_at', q.rolled_at,
    -- beat / foes / top2 / flag: the collusion check (private.fw_vs_collusion; docs/admin.md 6, the review before a rollover)
    'top', (select coalesce(jsonb_agg(jsonb_build_object('rank', t.rank, 'nick', t.nick, 'rp', t.rp, 'tier', t.tier, 'claimed_at', t.claimed_at)
                || private.fw_vs_collusion(q.prev, t.player_id) order by t.rank), '[]'::jsonb)
            from public.fw_vs_standing t where t.season = q.prev and t.rank <= 10),
    'live', (select coalesce(jsonb_agg(jsonb_build_object('id', x.player_id, 'nick', x.nick, 'rp', x.rp, 'wins', x.wins, 'losses', x.losses, 'ai', x.ai)
                || private.fw_vs_collusion(q.season, x.player_id) order by x.rp desc, x.player_id), '[]'::jsonb)
             from (select * from public.fw_versus x where not x.hidden and (x.wins > 0 or x.losses > 0 or x.draws > 0)
                   order by x.rp desc, x.player_id limit 10) x))
  into v from private.fw_vs_season q;
  return v;
end $$;

-- 3. privileges

revoke all on function private.fw_vs_first_cfg()            from public, anon, authenticated;

revoke all on function private.fw_vs_min_matches(integer)   from public, anon, authenticated;

revoke all on function private.fw_vs_ai_state(uuid, integer) from public, anon, authenticated;

revoke all on function private.fw_vs_tally(uuid, uuid[])    from public, anon, authenticated;

revoke all on function private.fw_vs_collude_cfg()          from public, anon, authenticated;

revoke all on function private.fw_vs_collusion(integer, uuid) from public, anon, authenticated;

revoke all on function private.fw_versus_ai(text, text, text, text) from public, anon, authenticated;

revoke all on function public.versus_ai(text, text, text, text)      from public, anon, authenticated;

grant execute on function private.fw_versus_ai(text, text, text, text) to authenticated, service_role;

grant execute on function public.versus_ai(text, text, text, text)      to authenticated, service_role;

revoke all on function private.fw_ref_hold()                 from public, anon, authenticated;
