-- =====================================================================================================
-- FLUX WING — Supabase backend for index.html: global leaderboard + online versus (rooms and the server-held ranking)
-- Postgres 17 / Supabase. Idempotent: paste the whole file into the SQL Editor and run; re-running is safe.
--
-- DASHBOARD SETTINGS THAT CANNOT BE SET FROM SQL (do these by hand, in this order):
--   1. Authentication > Sign In / Providers > "Allow anonymous sign-ins": ON.
--      The game signs every player in with signInAnonymously(); without this nothing online works.
--   2. Authentication > Rate Limits > anonymous sign-ins: keep the default (30 per hour per IP) or lower.
--      It is the only brake on mass-created players until CAPTCHA is wired.
--   3. Authentication > Attack Protection > CAPTCHA: leave OFF for now. Supabase recommends it for
--      anonymous sign-ins, but the game has no CAPTCHA widget yet: turning it on makes every sign-in fail
--      (the game then stays offline). Turn it on only together with a client change that passes
--      options.captchaToken to signInAnonymously().
--   4. Run this file (SQL Editor).
--   5. Realtime > Settings > Channel Restrictions: turn "Allow public access" OFF, so only private channels
--      (authorised by the realtime.messages policies below) can be joined. The game already joins with
--      private: true, so it works with the setting on or off; off is what enforces it.
--   6. Data API settings: leave "public" as the only exposed schema. Never add "private" to it.
--   7. Put the Project URL and the publishable key (sb_publishable_... or the legacy anon key) into
--      window.FW_CONFIG in index.html. Never the secret / service_role key.
--   Realtime quotas are per plan (Free: 100 messages/s and 20 presence messages/s for the whole project):
--   one versus match costs about 20 messages/s at the client's 5 state sends per second per player.
--   Housekeeping: Supabase has no automatic clean-up of anonymous users. Deleting an auth user deletes
--   their score row and their versus row (on delete cascade), so only prune users that have no row in
--   public.fw_scores and none in public.fw_versus. Versus match bookkeeping cleans itself up when a participant
--   comes back; for players who never do, run now and then:
--     delete from private.fw_vs_match where started_at < now() - interval '30 days';
-- =====================================================================================================

-- ---------- schemas ----------
-- "private" is not exposed through the Data API; it holds the privileged functions and the versus match bookkeeping.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- ---------- table: one row per player ----------
create table if not exists public.fw_scores (
  player_id      uuid        primary key references auth.users (id) on delete cascade,
  nick           text        not null default 'Pilot',
  cc             text        not null default '',
  lang           text        not null default 'en',
  best           integer     not null default 0,
  gates          integer     not null default 0,      -- gates of the run that set "best" (0 = unknown / back-filled)
  bird           text        not null default 'volt', -- unit that set "best"
  daily_key      date,                                -- UTC day of daily_score (the client's dayKey(): YYYY-MM-DD)
  daily_score    integer     not null default 0,
  daily_bird     text,
  submit_day     date,                                -- rate limiting: UTC day of submit_count
  submit_count   integer     not null default 0,      --                accepted submits on submit_day
  last_submit_at timestamptz,                         --                last accepted submit
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint fw_scores_best_chk   check (best >= 0),
  constraint fw_scores_gates_chk  check (gates >= 0),
  constraint fw_scores_daily_chk  check (daily_score >= 0),
  constraint fw_scores_count_chk  check (submit_count >= 0),
  constraint fw_scores_nick_chk   check (char_length(nick) between 1 and 14 and nick !~ '[\u0001-\u001F\u007F-\u009F<>]'),
  constraint fw_scores_cc_chk     check (cc ~ '^([A-Z]{2})?$'),
  constraint fw_scores_lang_chk   check (lang ~ '^[a-z]{2}$')
);
comment on table public.fw_scores is 'Flux Wing leaderboard: one row per (anonymous) player. Written only by private.fw_submit_score().';

-- The two leaderboard queries: top 50 by best (best > 0); top 50 by daily_score for one daily_key (daily_score > 0).
create index if not exists fw_scores_best_idx  on public.fw_scores (best desc) where best > 0;
create index if not exists fw_scores_daily_idx on public.fw_scores (daily_key, daily_score desc) where daily_score > 0;

-- ---------- row level security + grants (read-only through the Data API) ----------
alter table public.fw_scores enable row level security;

-- Read: signed-in players only. The client always signs in anonymously before its first query, so "anon"
-- (publishable key with no user) needs nothing; leaving it out means the board cannot be read or scraped
-- without first creating a user, which is rate limited (and can be CAPTCHA-gated).
drop policy if exists fw_scores_read on public.fw_scores;
create policy fw_scores_read on public.fw_scores for select to authenticated using (true);
-- No INSERT / UPDATE / DELETE policy on purpose: with RLS on, clients cannot write the table at all.

revoke all on table public.fw_scores from public, anon, authenticated;
-- Column grant: the rate-limit bookkeeping, lang and timestamps are not readable by clients.
grant select (player_id, nick, cc, best, bird, daily_key, daily_score, daily_bird) on table public.fw_scores to authenticated;
grant select, insert, update, delete on table public.fw_scores to service_role;   -- server-side moderation only

-- ---------- validated write ----------
-- Structure (Supabase guidance: prefer SECURITY INVOKER; a SECURITY DEFINER function must pin search_path,
-- should not live in an exposed schema, and EXECUTE must be revoked from public/anon):
--   public.submit_score(...)      SECURITY INVOKER, in the exposed schema: the RPC the client calls. No privileges of its own.
--   private.fw_submit_score(...)  SECURITY DEFINER, search_path = '', in the unexposed schema: the only code that can write
--                                 fw_scores. It writes exactly one row, the caller's (auth.uid()), after validating everything.
-- Clients therefore have no table write privilege and no RLS write policy to get wrong; the definer function is
-- reachable only through the wrapper, and only by "authenticated".
--
-- Plausibility bound (from the scoring code in index.html, update()): every passed gate scores exactly once:
--   dashed/broken gate  2 * dashPts                      (<= 4: ZERO / TEMPEST have dashPts 2)
--   perfect gate        (1 + combo + bonus) * feverMul * resoMul
--   plain gate          1
-- combo grows by 1 per perfect, so at the k-th gate combo <= k, or <= k + 10 for SOLARIS whose skill lifts the
-- combo to the fever threshold (10) once. Worst units: SOLARIS (bonus 1, feverMul 3): 3 * (k + 12);
-- PULSAR (bonus 2, feverMul 2, Resonance x2, no combo lift): 4 * (k + 3). Both are <= 4 * (k + 12), so
--   endless: score <= sum(k = 1..g) 4 * (k + 12) = 2*g^2 + 50*g
-- Daily runs are "fair mode" (bonus <= 1, feverMul 2, dashPts 1, Resonance x1, no combo lift): <= 2 * (k + 2) per gate, so
--   daily:   score <= sum(k = 1..g) 2 * (k + 2) = g^2 + 5*g
-- Both assume every single gate is a perfect in fever, i.e. they are generous by a wide margin.
create or replace function private.fw_submit_score(
  p_score integer, p_gates integer, p_mode text, p_day text, p_bird text, p_nick text, p_cc text, p_lang text
) returns public.fw_scores
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_gates   constant integer  := 5000;             -- far beyond any real run
  c_legacy_cap  constant integer  := 3000;             -- a best with no gate count (made before the board existed)
  c_min_gap     constant interval := interval '2 seconds';
  c_day_cap     constant integer  := 400;              -- accepted submits per player per UTC day
  c_birds       constant text[]   := array['volt','blitz','nimbus','titan','mochi','aegis','phoenix','zero','pixel','neko','buzz',
                                           'kraken','specter','oracle','raijin','chrono','goliath','solaris','aurora','tempest','pleiad','pulsar'];
  c_langs       constant text[]   := array['ko','en','ja','zh','es','pt','fr','de','id','vi'];
  v_uid   uuid        := (select auth.uid());
  v_now   timestamptz := now();
  v_today date        := (now() at time zone 'utc')::date;
  v_day   date;
  v_nick  text;
  v_cc    text;
  v_lang  text;
  v_bound bigint;
  v_row   public.fw_scores%rowtype;
begin
  if v_uid is null then
    raise exception 'fw_auth: sign-in required' using errcode = '28000';
  end if;
  if p_score is null or p_gates is null or p_mode is null or p_bird is null
     or p_mode not in ('endless', 'daily') or not (p_bird = any (c_birds))
     or p_score < 0 or p_gates < 0 or p_gates > c_max_gates then
    raise exception 'fw_bad_input: unknown mode or unit, or value out of range' using errcode = '22023';
  end if;

  -- plausibility: score against gates (see the derivation above)
  if p_gates = 0 and p_score > 0 then
    -- only the one-off back-fill of an old local best has no gate count; capped well below what 30 claimed gates allow
    if p_mode <> 'endless' or p_score > c_legacy_cap then
      raise exception 'fw_implausible: score without a gate count' using errcode = '22023';
    end if;
  else
    v_bound := case p_mode when 'daily' then p_gates::bigint * p_gates + 5 * p_gates
                           else 2 * p_gates::bigint * p_gates + 50 * p_gates end;
    if p_score > v_bound then
      raise exception 'fw_implausible: score too high for the gates passed' using errcode = '22023';
    end if;
  end if;

  -- daily key: the client's UTC day (YYYY-MM-DD), accepted only within one day of the server's UTC date
  if p_mode = 'daily' then
    if p_day is null or p_day !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'fw_bad_input: bad day key' using errcode = '22023';
    end if;
    begin
      v_day := p_day::date;
    exception when others then
      raise exception 'fw_bad_input: bad day key' using errcode = '22023';
    end;
    if v_day < v_today - 1 or v_day > v_today + 1 then
      raise exception 'fw_bad_input: day key is not current' using errcode = '22023';
    end if;
  end if;

  -- sanitise the profile fields: control characters, zero-width / bidi marks and <> removed, whitespace collapsed, 14 chars max
  v_nick := left(btrim(regexp_replace(
              regexp_replace(coalesce(p_nick, ''), '[\u0001-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF<>]', '', 'g'),
              '\s+', ' ', 'g')), 14);
  v_nick := btrim(v_nick);
  if char_length(v_nick) < 2 then v_nick := 'Pilot'; end if;
  v_cc   := case when p_cc ~ '^[A-Za-z]{2}$' then upper(p_cc) else '' end;
  v_lang := case when lower(coalesce(p_lang, '')) = any (c_langs) then lower(p_lang) else 'en' end;

  -- the caller's row, locked for this transaction (created on first submit)
  begin
    insert into public.fw_scores (player_id, nick, cc, lang) values (v_uid, v_nick, v_cc, v_lang)
    on conflict (player_id) do nothing;
  exception when foreign_key_violation then
    raise exception 'fw_auth: unknown player' using errcode = '28000';   -- token of a deleted user: the client signs in again
  end;
  select * into strict v_row from public.fw_scores where player_id = v_uid for update;

  -- rate limit (a rejected call raises, so it is rolled back and does not count)
  if v_row.last_submit_at is not null and v_now - v_row.last_submit_at < c_min_gap then
    raise exception 'fw_rate_limited: too many submits, slow down' using errcode = 'P0001';
  end if;
  if v_row.submit_day is distinct from v_today then
    v_row.submit_day := v_today; v_row.submit_count := 0;
  end if;
  if v_row.submit_count >= c_day_cap then
    raise exception 'fw_rate_limited: daily submit limit reached' using errcode = 'P0001';
  end if;

  -- best only ever goes up
  if p_score > v_row.best then
    v_row.best := p_score; v_row.gates := p_gates; v_row.bird := p_bird;
  end if;
  -- daily: a newer day replaces the stored one (resetting its score); the same day only ever goes up; an older day is ignored
  if p_mode = 'daily' then
    if v_row.daily_key is null or v_day > v_row.daily_key then
      v_row.daily_key := v_day; v_row.daily_score := p_score; v_row.daily_bird := p_bird;
    elsif v_day = v_row.daily_key and p_score > v_row.daily_score then
      v_row.daily_score := p_score; v_row.daily_bird := p_bird;
    end if;
  end if;

  update public.fw_scores set
    nick = v_nick, cc = v_cc, lang = v_lang,
    best = v_row.best, gates = v_row.gates, bird = v_row.bird,
    daily_key = v_row.daily_key, daily_score = v_row.daily_score, daily_bird = v_row.daily_bird,
    submit_day = v_row.submit_day, submit_count = v_row.submit_count + 1, last_submit_at = v_now, updated_at = v_now
  where player_id = v_uid
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.submit_score(
  p_score integer, p_gates integer, p_mode text, p_day text, p_bird text, p_nick text, p_cc text, p_lang text
) returns public.fw_scores
language sql
security invoker
set search_path = ''
as $$
  select * from private.fw_submit_score(p_score, p_gates, p_mode, p_day, p_bird, p_nick, p_cc, p_lang);
$$;

revoke all on function private.fw_submit_score(integer, integer, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.submit_score(integer, integer, text, text, text, text, text, text)     from public, anon, authenticated;
grant execute on function private.fw_submit_score(integer, integer, text, text, text, text, text, text) to authenticated, service_role;
grant execute on function public.submit_score(integer, integer, text, text, text, text, text, text)     to authenticated, service_role;

-- =====================================================================================================
-- VERSUS RANKING — rank points (RP) held by the server
-- One RP per player, shared by 1v1 and 2v2. Win +50, loss -45, draw 0, never below 0. Matches against the AI are
-- practice: the client never reports them. Tiers (client, TIERS): 0 / 400 / 1,000 / 2,000 / 3,600 RP.
--
-- There is still no referee: two (or four) clients play a seeded course and each decides the result on its own.
-- The server only cross-checks what the participants say:
--   versus_start(match, mode, team, nick, cc, bird)   when the countdown ends: registers the caller in the match
--   versus_report(match, result)                      'win' | 'lose' | 'draw' from the caller's TEAM's point of view
--   versus_me()                                       the caller's RP row (creates nothing) + their latest match
-- and applies RP itself, once per match, inside these calls (no cron).
--
-- Match id (text), built identically by every participant:  <seed, base 36>.<team 0>.<team 1>
--   a team is one player id (1v1) or two joined by "+" (2v2); ids are the players' auth uids, lower case, sorted
--   inside a team, and team 0 is the team holding the smallest id. The ROSTER IS PART OF THE ID: only the players
--   named in it can register, each on the team the id puts them on. (Changed from "the first two callers of an id
--   are its participants": with that, anyone who could see a room's seed could register in a stranger's match and
--   pocket +50 whenever the real player on the other side honestly reported a loss.)
--
-- Settlement (private.fw_vs_settle), with each report read as an outcome for the match
-- (team 0 "win" = team 1 "lose" = team 0 won; "draw" = draw):
--   1. two reports name different outcomes                              -> VOID at once: no RP, nothing counted
--   2. every registered participant has reported, nobody else can still register (roster full, or the join
--      window is over) and both teams are present                         -> SETTLED with that outcome
--   3. past the deadline = the later of (first registration + settle_after) and (first report + report_grace):
--        both teams present and at least one report -> SETTLED as reported; silent participants get the
--                                                      complementary result (closing the tab does not dodge a loss)
--        otherwise (one team only, or no report)    -> VOID
--      A deadline is only looked at when a participant of that match next calls one of the three functions.
--   A match with a single registered team can never give RP. Roster members who never registered are untouched.
--   Applied per participant, in player_id order: win +rp_win, loss -rp_loss floored at 0, and wins / losses / draws.
--   Values: private.fw_vs_cfg().
--
-- What a modified client can and cannot do:
--   - Write the tables, or call anything but the three functions: no (RLS without a write policy, no table
--     privilege, the bookkeeping sits in the unexposed schema, helpers are not executable by clients).
--   - Report for someone else, twice, without having registered, or change a report: no.
--   - Claim a win it did not earn: the rival's honest report contradicts it -> void. So a cheat can always turn its
--     own LOSS into a void (report "win", or never register: a match with one team is void), i.e. dodge -45, but
--     it gets no RP for it. Registering late to see how the match goes first is limited by the join window.
--   - Win by outlasting the clock: if the rival never reports before the deadline (their client was kept waiting by
--     a fake "still alive" state, they closed the tab), the lone claim stands and the rival takes the loss. Only a
--     referee (server-side simulation or replay check) closes this.
--   - Impersonate a rival inside a room (Realtime broadcasts are not signed): can make an honest player register a
--     match against the impostor's id; the impostor gains only if that player then honestly reports a loss.
--   - Two accounts that agree on results (one person with two anonymous users) can trade wins: nothing here can
--     tell that from a real match, and the feeder account loses nothing once it sits at 0 RP. The brakes are the
--     anonymous sign-in rate limit (dashboard step 2), pair_cap matches per pair of rivals per pair_window,
--     starts_per_hour, and min_play between registering and reporting. CAPTCHA on sign-in (step 3) is the next
--     step up.
--   - Replay: a match id is registered once per player and settles once; reports after settlement change nothing.
--   - Flooding: registrations are capped per player per hour, each adds one row (plus one per match), finished
--     matches are deleted after "keep" when one of their participants next calls in.
-- =====================================================================================================

-- ---------- table: one row per player who has finished at least one ranked match ----------
create table if not exists public.fw_versus (
  player_id  uuid        primary key references auth.users (id) on delete cascade,
  nick       text        not null default 'Pilot',
  cc         text        not null default '',
  bird       text        not null default 'volt',   -- unit flown in the latest settled match
  rp         integer     not null default 0,
  wins       integer     not null default 0,
  losses     integer     not null default 0,
  draws      integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fw_versus_rp_chk     check (rp >= 0),
  constraint fw_versus_wld_chk    check (wins >= 0 and losses >= 0 and draws >= 0),
  constraint fw_versus_nick_chk   check (char_length(nick) between 1 and 14 and nick !~ '[\u0001-\u001F\u007F-\u009F<>]'),
  constraint fw_versus_cc_chk     check (cc ~ '^([A-Z]{2})?$'),
  constraint fw_versus_bird_chk   check (bird ~ '^[a-z]{1,12}$')
);
comment on table public.fw_versus is 'Flux Wing versus ranking: one row per (anonymous) player. Written only by private.fw_vs_settle().';

-- The board: top 100 by rp (player_id breaks ties, so the order is stable), and "how many are above me" (rp > mine).
create index if not exists fw_versus_rp_idx on public.fw_versus (rp desc, player_id);

alter table public.fw_versus enable row level security;
drop policy if exists fw_versus_read on public.fw_versus;
create policy fw_versus_read on public.fw_versus for select to authenticated using (true);
-- No INSERT / UPDATE / DELETE policy on purpose (same model as fw_scores).

revoke all on table public.fw_versus from public, anon, authenticated;
grant select (player_id, nick, cc, bird, rp, wins, losses, draws) on table public.fw_versus to authenticated;   -- timestamps stay private
grant select, insert, update, delete on table public.fw_versus to service_role;   -- server-side moderation only

-- ---------- match bookkeeping (unexposed schema: no client can reach these at all) ----------
create table if not exists private.fw_vs_match (
  id              text        primary key,                 -- <seed>.<team 0>.<team 1>, see above
  mode            text        not null,
  status          text        not null default 'open',     -- open | settled | void
  outcome         smallint,                                -- settled: 0 / 1 = winning team, 2 = draw
  why             text,                                    -- settled: agreed | timeout; void: conflict | one_team | no_report
  started_at      timestamptz not null default now(),      -- first registration
  first_report_at timestamptz,
  settled_at      timestamptz,
  constraint fw_vs_match_id_chk      check (char_length(id) between 75 and 160),
  constraint fw_vs_match_mode_chk    check (mode in ('1v1', '2v2')),
  constraint fw_vs_match_status_chk  check (status in ('open', 'settled', 'void')),
  constraint fw_vs_match_outcome_chk check (outcome is null or outcome in (0, 1, 2))
);
create table if not exists private.fw_vs_part (
  match_id    text        not null references private.fw_vs_match (id) on delete cascade,
  player_id   uuid        not null references auth.users (id) on delete cascade,
  team        smallint    not null,
  nick        text        not null,
  cc          text        not null,
  bird        text        not null,
  joined_at   timestamptz not null default now(),          -- versus_start
  result      text,                                        -- this player's own report
  reported_at timestamptz,
  final       text,                                        -- what settlement gave this player
  delta       integer,                                     -- RP actually applied (a loss at 30 RP: -30)
  primary key (match_id, player_id),
  constraint fw_vs_part_team_chk   check (team in (0, 1)),
  constraint fw_vs_part_result_chk check (result is null or result in ('win', 'lose', 'draw')),
  constraint fw_vs_part_final_chk  check (final is null or final in ('win', 'lose', 'draw'))
);
-- a player's recent matches: the hourly cap, the per-rival cap, open matches to settle, the latest match
create index if not exists fw_vs_part_player_idx on private.fw_vs_part (player_id, joined_at desc);

alter table private.fw_vs_match enable row level security;   -- no policy: belt and braces, the schema is not exposed anyway
alter table private.fw_vs_part  enable row level security;
revoke all on table private.fw_vs_match, private.fw_vs_part from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_vs_match, private.fw_vs_part to service_role;

-- ---------- the numbers, in one place ----------
create or replace function private.fw_vs_cfg(
  out rp_win integer, out rp_loss integer,
  out join_window interval,      -- after the first registration nobody else can register in that match
  out min_play interval,         -- a report sooner than this after the caller registered is refused
  out settle_after interval,     -- deadline, from the first registration ...
  out report_grace interval,     -- ... but never sooner than this after the first report
  out starts_per_hour integer,   -- registrations per player per rolling hour
  out pair_cap integer,          -- matches that count (not void) against one and the same rival (the client's vsCap text says "5") ...
  out pair_window interval,      -- ... per this rolling window; further ones are refused at versus_start (played unranked)
  out keep interval              -- finished matches older than this are deleted
) language sql immutable set search_path = '' as $$
  select 50, 45, interval '20 seconds', interval '4 seconds', interval '5 minutes', interval '60 seconds', 30, 5, interval '24 hours', interval '3 days';
$$;

-- ---------- helpers (not executable by clients; they run inside the definer functions below) ----------
-- Roster out of a match id. Raises unless the id is in canonical form, so two spellings of one match cannot exist.
create or replace function private.fw_vs_roster(p_match text, out t0 uuid[], out t1 uuid[])
language plpgsql immutable set search_path = '' as $$
declare
  c_u constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v   text[];
begin
  if p_match is null or p_match !~ ('^[0-9a-z]{1,8}\.' || c_u || '(\+' || c_u || ')?\.' || c_u || '(\+' || c_u || ')?$') then
    raise exception 'fw_bad_input: bad match id' using errcode = '22023';
  end if;
  v  := string_to_array(p_match, '.');
  t0 := string_to_array(v[2], '+')::uuid[];
  t1 := string_to_array(v[3], '+')::uuid[];
  if cardinality(t0) <> cardinality(t1) or t0[1] >= t1[1] or t0 && t1
     or (cardinality(t0) = 2 and (t0[1] >= t0[2] or t1[1] >= t1[2])) then
    raise exception 'fw_bad_input: match id is not canonical' using errcode = '22023';
  end if;
end;
$$;

-- same rules as fw_submit_score: control characters, zero-width / bidi marks and <> removed, whitespace collapsed, 14 chars max
create or replace function private.fw_vs_nick(p_nick text) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(n) < 2 then 'Pilot' else n end
  from (select btrim(left(btrim(regexp_replace(
          regexp_replace(coalesce(p_nick, ''), '[\u0001-\u001F\u007F-\u009F​-‏ -‮⁠-⁩﻿<>]', '', 'g'),
          '\s+', ' ', 'g')), 14)) as n) s;
$$;

-- Settle one match if its state allows it (rules 1-3 above). Safe to call any number of times.
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
  r       record;
begin
  select * into c from private.fw_vs_cfg();
  select * into v_m from private.fw_vs_match where id = p_match for update;
  if not found or v_m.status <> 'open' then return; end if;

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
  elsif v_now >= greatest(v_m.started_at + c.settle_after, coalesce(v_m.first_report_at, v_m.started_at) + c.report_grace) then
    if v_teams < 2 then v_why := 'one_team'; v_out := null;
    elsif v_rep = 0 then v_why := 'no_report';
    else v_why := 'timeout'; end if;
  else
    return;   -- still open
  end if;

  if v_out is null then
    update private.fw_vs_match set status = 'void', why = v_why, settled_at = v_now where id = p_match;
    return;
  end if;

  for r in select p.player_id, p.team, p.nick, p.cc, p.bird from private.fw_vs_part p where p.match_id = p_match order by p.player_id loop
    v_d := case when v_out = 2 then 0 when r.team = v_out then c.rp_win else -c.rp_loss end;
    insert into public.fw_versus (player_id, nick, cc, bird) values (r.player_id, r.nick, r.cc, r.bird)
    on conflict (player_id) do nothing;
    select v.rp into strict v_old from public.fw_versus v where v.player_id = r.player_id for update;
    update public.fw_versus set
      nick = r.nick, cc = r.cc, bird = r.bird,
      rp     = greatest(0, v_old + v_d),
      wins   = wins   + (v_d > 0)::integer,
      losses = losses + (v_d < 0)::integer,
      draws  = draws  + (v_d = 0)::integer,
      updated_at = v_now
    where player_id = r.player_id;
    update private.fw_vs_part set
      final = case when v_d > 0 then 'win' when v_d < 0 then 'lose' else 'draw' end,
      delta = greatest(0, v_old + v_d) - v_old
    where match_id = p_match and player_id = r.player_id;
  end loop;
  update private.fw_vs_match set status = 'settled', outcome = v_out, why = v_why, settled_at = v_now where id = p_match;
end;
$$;

-- Lazy settlement for one player: every open match they are in (oldest first), then the clean-up of their old ones.
create or replace function private.fw_vs_sweep(p_uid uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_id text;
begin
  for v_id in
    select m.id from private.fw_vs_part p join private.fw_vs_match m on m.id = p.match_id
    where p.player_id = p_uid and m.status = 'open' order by m.started_at, m.id
  loop
    perform private.fw_vs_settle(v_id);
  end loop;
  delete from private.fw_vs_match m
  where m.status <> 'open' and m.started_at < now() - (select keep from private.fw_vs_cfg())
    and exists (select 1 from private.fw_vs_part p where p.match_id = m.id and p.player_id = p_uid);
end;
$$;

-- What the client is told about itself and about one of its matches.
create or replace function private.fw_vs_row(p_uid uuid) returns jsonb
language sql set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('rp', v.rp, 'wins', v.wins, 'losses', v.losses, 'draws', v.draws, 'ranked', true)
     from public.fw_versus v where v.player_id = p_uid),
    jsonb_build_object('rp', 0, 'wins', 0, 'losses', 0, 'draws', 0, 'ranked', false));
$$;
create or replace function private.fw_vs_state(p_uid uuid, p_match text) returns jsonb
language sql set search_path = '' as $$
  select jsonb_build_object('match', m.id, 'mode', m.mode, 'state', m.status, 'why', m.why, 'team', p.team,
           'claimed', p.result, 'result', p.final, 'delta', p.delta,
           'players', (select count(*) from private.fw_vs_part q where q.match_id = m.id))
  from private.fw_vs_match m join private.fw_vs_part p on p.match_id = m.id and p.player_id = p_uid
  where m.id = p_match;
$$;

-- ---------- the three entry points ----------
-- Structure as for submit_score: public.versus_*() SECURITY INVOKER wrappers in the exposed schema,
-- private.fw_versus_*() SECURITY DEFINER with search_path = '' doing the work, for auth.uid() only.
create or replace function private.fw_versus_start(
  p_match text, p_mode text, p_team integer, p_nick text, p_cc text, p_bird text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c       record;
  v_uid   uuid        := (select auth.uid());
  v_now   timestamptz := now();
  v_t0    uuid[];
  v_t1    uuid[];
  v_team  integer;
  v_rival uuid;
  v_cnt   integer;
  v_m     private.fw_vs_match%rowtype;
begin
  if v_uid is null then
    raise exception 'fw_auth: sign-in required' using errcode = '28000';
  end if;
  select * into c from private.fw_vs_cfg();
  if p_mode is null or p_mode not in ('1v1', '2v2') or p_team is null or p_team not in (0, 1)
     or p_bird is null or p_bird !~ '^[a-z]{1,12}$' then
    raise exception 'fw_bad_input: unknown mode, team or unit' using errcode = '22023';
  end if;
  select t0, t1 into v_t0, v_t1 from private.fw_vs_roster(p_match);
  if cardinality(v_t0) <> (case p_mode when '2v2' then 2 else 1 end) then
    raise exception 'fw_bad_input: roster does not fit the mode' using errcode = '22023';
  end if;
  v_team := case when v_uid = any (v_t0) then 0 when v_uid = any (v_t1) then 1 end;
  if v_team is null then
    raise exception 'fw_vs_not_in_match: this match is between other players' using errcode = '42501';
  end if;
  if v_team <> p_team then
    raise exception 'fw_bad_input: wrong team for this match id' using errcode = '22023';
  end if;

  perform private.fw_vs_sweep(v_uid);

  -- a repeated call (retry after a lost answer) changes nothing
  if exists (select 1 from private.fw_vs_part p where p.match_id = p_match and p.player_id = v_uid) then
    return private.fw_vs_state(v_uid, p_match) || jsonb_build_object('me', private.fw_vs_row(v_uid));
  end if;

  -- brakes (a refused call raises, so it is rolled back and does not count)
  select count(*) into v_cnt from private.fw_vs_part p where p.player_id = v_uid and p.joined_at > v_now - interval '1 hour';
  if v_cnt >= c.starts_per_hour then
    raise exception 'fw_rate_limited: too many ranked matches this hour' using errcode = 'P0001';
  end if;
  foreach v_rival in array (case v_team when 0 then v_t1 else v_t0 end) loop
    select count(*) into v_cnt
    from private.fw_vs_part a
    join private.fw_vs_part b on b.match_id = a.match_id and b.player_id = v_rival and b.team <> a.team
    join private.fw_vs_match m on m.id = a.match_id
    where a.player_id = v_uid and a.joined_at > v_now - c.pair_window and m.status <> 'void';
    if v_cnt >= c.pair_cap then
      raise exception 'fw_vs_pair_cap: ranked matches against this rival are used up for now' using errcode = 'P0001';
    end if;
  end loop;

  -- the match: created by its first registration, joinable for a short window only
  insert into private.fw_vs_match (id, mode) values (p_match, p_mode) on conflict (id) do nothing;
  select * into strict v_m from private.fw_vs_match where id = p_match for update;
  if v_m.mode <> p_mode then
    raise exception 'fw_bad_input: this match was started in another mode' using errcode = '22023';
  end if;
  if v_m.status <> 'open' or v_now > v_m.started_at + c.join_window then
    raise exception 'fw_vs_closed: too late to join this match' using errcode = 'P0001';
  end if;
  begin
    insert into private.fw_vs_part (match_id, player_id, team, nick, cc, bird)
    values (p_match, v_uid, v_team, private.fw_vs_nick(p_nick), case when p_cc ~ '^[A-Za-z]{2}$' then upper(p_cc) else '' end, p_bird);
  exception when foreign_key_violation then
    raise exception 'fw_auth: unknown player' using errcode = '28000';   -- token of a deleted user: the client signs in again
  end;
  return private.fw_vs_state(v_uid, p_match) || jsonb_build_object('me', private.fw_vs_row(v_uid));
end;
$$;

create or replace function private.fw_versus_report(p_match text, p_result text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c     record;
  v_uid uuid        := (select auth.uid());
  v_now timestamptz := now();
  v_m   private.fw_vs_match%rowtype;
  v_p   private.fw_vs_part%rowtype;
begin
  if v_uid is null then
    raise exception 'fw_auth: sign-in required' using errcode = '28000';
  end if;
  if p_match is null or char_length(p_match) > 160 or p_result is null or p_result not in ('win', 'lose', 'draw') then
    raise exception 'fw_bad_input: unknown result' using errcode = '22023';
  end if;
  select * into c from private.fw_vs_cfg();
  perform private.fw_vs_sweep(v_uid);   -- a report that comes after the deadline finds the match already settled

  select * into v_m from private.fw_vs_match where id = p_match for update;
  if found then
    select * into v_p from private.fw_vs_part p where p.match_id = p_match and p.player_id = v_uid;
  end if;
  if v_p.player_id is null then
    raise exception 'fw_vs_not_started: no such match for this player' using errcode = 'P0001';
  end if;
  if v_p.result is not null then
    raise exception 'fw_vs_reported: result already reported' using errcode = 'P0001';
  end if;
  if v_m.status = 'open' then
    if v_now - v_p.joined_at < c.min_play then
      raise exception 'fw_vs_too_soon: no match ends this fast' using errcode = 'P0001';
    end if;
    update private.fw_vs_part set result = p_result, reported_at = v_now where match_id = p_match and player_id = v_uid;
    update private.fw_vs_match set first_report_at = coalesce(first_report_at, v_now) where id = p_match;
    perform private.fw_vs_settle(p_match);
  end if;   -- else: settled or voided without this report; the answer says how
  return private.fw_vs_state(v_uid, p_match) || jsonb_build_object('me', private.fw_vs_row(v_uid));
end;
$$;

create or replace function private.fw_versus_me() returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'fw_auth: sign-in required' using errcode = '28000';
  end if;
  perform private.fw_vs_sweep(v_uid);
  return private.fw_vs_row(v_uid) || jsonb_build_object(
    'pending', (select count(*) from private.fw_vs_part p join private.fw_vs_match m on m.id = p.match_id
                where p.player_id = v_uid and m.status = 'open'),
    'last', (select private.fw_vs_state(v_uid, p.match_id) from private.fw_vs_part p
             where p.player_id = v_uid order by p.joined_at desc limit 1));
end;
$$;

create or replace function public.versus_start(
  p_match text, p_mode text, p_team integer, p_nick text, p_cc text, p_bird text
) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.fw_versus_start(p_match, p_mode, p_team, p_nick, p_cc, p_bird);
$$;
create or replace function public.versus_report(p_match text, p_result text) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.fw_versus_report(p_match, p_result);
$$;
create or replace function public.versus_me() returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.fw_versus_me();
$$;

revoke all on function private.fw_vs_cfg()                  from public, anon, authenticated;
revoke all on function private.fw_vs_roster(text)           from public, anon, authenticated;
revoke all on function private.fw_vs_nick(text)             from public, anon, authenticated;
revoke all on function private.fw_vs_settle(text)           from public, anon, authenticated;
revoke all on function private.fw_vs_sweep(uuid)            from public, anon, authenticated;
revoke all on function private.fw_vs_row(uuid)              from public, anon, authenticated;
revoke all on function private.fw_vs_state(uuid, text)      from public, anon, authenticated;
revoke all on function private.fw_versus_start(text, text, integer, text, text, text)  from public, anon, authenticated;
revoke all on function private.fw_versus_report(text, text) from public, anon, authenticated;
revoke all on function private.fw_versus_me()               from public, anon, authenticated;
revoke all on function public.versus_start(text, text, integer, text, text, text)      from public, anon, authenticated;
revoke all on function public.versus_report(text, text)     from public, anon, authenticated;
revoke all on function public.versus_me()                   from public, anon, authenticated;
grant execute on function private.fw_versus_start(text, text, integer, text, text, text) to authenticated, service_role;
grant execute on function private.fw_versus_report(text, text) to authenticated, service_role;
grant execute on function private.fw_versus_me()               to authenticated, service_role;
grant execute on function public.versus_start(text, text, integer, text, text, text)     to authenticated, service_role;
grant execute on function public.versus_report(text, text)     to authenticated, service_role;
grant execute on function public.versus_me()                   to authenticated, service_role;

-- ---------- Realtime: versus rooms are PRIVATE channels ----------
-- The game uses Broadcast + Presence only (no table changes), on topics
--   fw-v<N>-fw-lobby            quick-match lobby
--   fw-v<N>-m-<peer>-<peer>     quick-match room
--   fw-v<N>-c-<4 digits>        code room
-- Private (not public) channels, because the publishable key is in the page source: with public channels anyone
-- holding it could open any number of arbitrary topics on this project and burn its message quota without even
-- having a user. Private channels need a signed-in (anonymous) user, whose creation is rate limited, and these
-- policies allow only the game's topic shapes and only broadcast + presence. This is access control for the
-- project's quota, not secrecy: any signed-in player can still join a room whose name they know (a 4-digit code
-- is guessable), and a match is still played without a referee (what that means for rank points: see the
-- versus ranking section above).
-- Enforced only when "Allow public access" is OFF in Realtime settings (dashboard step 5).
drop policy if exists fw_versus_read on realtime.messages;
create policy fw_versus_read on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select realtime.topic()) ~ '^fw-v[0-9]+-(fw-lobby|c-[0-9]{4}|m-[a-z0-9]{1,14}-[a-z0-9]{1,14})$'
);
drop policy if exists fw_versus_write on realtime.messages;
create policy fw_versus_write on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast', 'presence')
  and (select realtime.topic()) ~ '^fw-v[0-9]+-(fw-lobby|c-[0-9]{4}|m-[a-z0-9]{1,14}-[a-z0-9]{1,14})$'
);
