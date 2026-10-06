-- =====================================================================================================
-- FLUX WING — Supabase backend for index.html: global leaderboard + online 2-player versus
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
--   their score row (on delete cascade), so only prune users that have no row in public.fw_scores.
-- =====================================================================================================

-- ---------- schemas ----------
-- "private" is not exposed through the Data API; it holds the one privileged function.
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
-- is guessable), and match results stay client-trusted (ranked points are stored on the device only).
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
