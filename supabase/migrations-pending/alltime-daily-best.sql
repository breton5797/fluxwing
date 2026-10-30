-- All-time board = all-time daily best (owner decision 2026-10-31, docs/plans/2026-10-31-ranking/03-judge-final.md).
-- Generated from supabase/schema.sql lines 201-340 (private.fw_submit_score) with an unchanged signature: create or replace
-- keeps the existing grants and adds no overload. The only change: best is raised only when p_mode = 'daily'.
-- Run once in the Supabase SQL editor (production), then docs/launch/ranking-runbook-2026-11.md step 3 to verify.

create or replace function private.fw_submit_score(
  p_score integer, p_gates integer, p_mode text, p_day text, p_bird text, p_nick text, p_cc text, p_lang text
) returns public.fw_scores
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_gates   constant integer  := 400;              -- about 3x the best real run on the board (112 gates, 2026-10); was 1,500
  -- Time budget: a run of g gates takes real time. Measured 2026-10-28 (scripts/balance.mjs bot, form V, every run timed):
  -- the most gates a second over a run was 2.57 (TEMPEST, stage 50, the top speed), 1.96 for the fastest open-rank
  -- units (ZERO, BLITZ 1.80); the most gates in one run 161 (SOLARIS, stage 20). The ceiling is ceil(2.57 x 1.5) = 4.
  -- The budget runs from the caller's previous accepted submit (a run ends with one) or, for a first submit, from the
  -- creation of the anonymous user. It stops a forged score sent in one call: claiming g gates means waiting g / 4 seconds first.
  c_gates_per_s constant numeric  := 4;
  c_gate_grace  constant integer  := 30;
  -- Soft limit: real runs stay at or below 0.27 of the endless bound (docs/balance/README.md, every rank); a score above
  -- 0.4 of it is stored, but the row is hidden (fw_scores.hidden) until an admin looks at it. Endless only: daily is fair
  -- mode, whose bound g^2 + 5g is already close to an all-Perfect run.
  c_soft        constant numeric  := 0.4;
  v_soft  boolean := false;
  v_since timestamptz;
  c_min_gap     constant interval := interval '2 seconds';
  c_day_cap     constant integer  := 400;              -- accepted submits per player per UTC day
  c_birds       constant text[]   := private.fw_units();
  c_langs       constant text[]   := array['ko','en','ja','zh','zh_TW','es','pt','fr','de','id','vi','th','hi',
                                             'nl','ru','ms','nb','ar','it','tr','pl','fi','he'];
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
  -- a unit of a rank not released yet (private.fw_tier_open) cannot be on the board: nobody could have flown it, except a tester
  if private.fw_unit_rank(p_bird) > private.fw_tier_open()
     and not exists (select 1 from private.fw_testers t where t.player_id = v_uid) then
    raise exception 'fw_bad_input: unit not released' using errcode = '22023';
  end if;

  -- plausibility: score against gates (see the derivation above)
  -- every mode: a score comes with its gates (2026-10: the endless back-fill of an old local best without a gate count, up to
  -- 3,000, is closed; rows stored that way stay, see fw_scores.gates = 0)
  if p_gates = 0 and p_score > 0 then
    raise exception 'fw_implausible: score without a gate count' using errcode = '22023';
  else
    v_bound := case p_mode when 'daily' then p_gates::bigint * p_gates + 5 * p_gates
                           else ceil((3 * p_gates::bigint * p_gates + 75 * p_gates) * private.fw_bound_mul(p_bird))::bigint end;
    if p_score > v_bound then
      raise exception 'fw_implausible: score too high for the gates passed' using errcode = '22023';
    end if;
    v_soft := p_mode = 'endless' and p_score > c_soft * v_bound;
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
  if char_length(v_nick) < 2 or private.fw_nick_bad(v_nick) then v_nick := 'Pilot'; end if;   -- a refused name is replaced, not reported: nothing to probe
  v_cc   := case when p_cc ~ '^[A-Za-z]{2}$' then upper(p_cc) else '' end;
  v_lang := coalesce((select l from unnest(c_langs) l where lower(l) = lower(coalesce(p_lang, '')) limit 1), 'en');

  -- the caller's row, locked for this transaction (created on first submit)
  begin
    insert into public.fw_scores (player_id, nick, cc, lang) values (v_uid, v_nick, v_cc, v_lang)
    on conflict (player_id) do nothing;
  exception when foreign_key_violation then
    raise exception 'fw_auth: unknown player' using errcode = '28000';   -- token of a deleted user: the client signs in again
  end;
  select * into strict v_row from public.fw_scores where player_id = v_uid for update;

  -- time budget (see c_gates_per_s)
  v_since := coalesce(v_row.last_submit_at, (select u.created_at from auth.users u where u.id = v_uid), v_row.created_at);
  if p_gates > c_gate_grace + floor(extract(epoch from v_now - v_since) * c_gates_per_s) then
    raise exception 'fw_implausible: more gates than the time since the last submit allows' using errcode = '22023';
  end if;

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

  -- best only ever goes up, and only from daily runs (owner's decision 2026-10-31): the all-time board is the fair, uncapped
  -- daily; stage runs end at gate 100 and the client resends its local best as 'endless', so endless never touches best
  if p_mode = 'daily' and p_score > v_row.best then
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
    submit_day = v_row.submit_day, submit_count = v_row.submit_count + 1, last_submit_at = v_now, updated_at = v_now,
    hidden = hidden or v_soft   -- over the soft limit: off the boards for review (an admin un-hides); never un-hidden here
  where player_id = v_uid
  returning * into v_row;
  return v_row;
end;
$$;
