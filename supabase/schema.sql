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
--   8. Authentication > Sign In / Providers: Email ON (Confirm email ON, OTP length 6), Google ON
--      (Client ID/Secret from Google Cloud Console; see plan-auth.md appendix A). Apple later, the same way.
--   9. Authentication > Sign In / Providers > "Allow manual linking": ON — linkIdentity() upgrades the
--      anonymous player in place, keeping auth.uid() and with it the score and versus rows.
--  10. Authentication > URL Configuration: Site URL https://breton5797.github.io/fluxwing/ and Redirect URLs
--      https://breton5797.github.io/fluxwing/** plus http://localhost:5173/** (no portal domains: portal
--      builds hide the login UI).
--   Realtime quotas are per plan (Free: 100 messages/s and 20 presence messages/s for the whole project):
--   one versus match costs about 20 messages/s at the client's 5 state sends per second per player.
--   Housekeeping: Supabase has no automatic clean-up of anonymous users. Deleting an auth user deletes
--   their score row, their versus row, their season results and their cloud save (on delete cascade), so only prune users that
--   have no row in public.fw_scores, none in public.fw_versus and none in public.fw_vs_standing.
--   Versus match bookkeeping cleans itself up when a participant
--   comes back; for players who never do, run now and then (it takes every match that old, whatever its
--   status — also the ones still 'open' because nobody of theirs ever called again; no pg_cron is used):
--     delete from private.fw_vs_match where started_at < now() - interval '30 days';
--   Season results (public.fw_vs_standing) grow by one row per player who played, per season, and the game
--   never deletes them. To drop seasons older than a year (rewards not claimed by then go with them):
--     delete from public.fw_vs_standing
--     where season < to_char((now() at time zone 'Asia/Seoul') - interval '12 months', 'YYYYMM')::integer;
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
  constraint fw_scores_lang_chk   check (lang ~ '^[a-z]{2}(_[A-Z]{2})?$')
);
comment on table public.fw_scores is 'Flux Wing leaderboard: one row per (anonymous) player. Written only by private.fw_submit_score().';
-- lang: a two-letter code, or one with a region where the game has a variant (zh_TW)
alter table public.fw_scores drop constraint if exists fw_scores_lang_chk;
alter table public.fw_scores add constraint fw_scores_lang_chk check (lang ~ '^[a-z]{2}(_[A-Z]{2})?$');

-- The two leaderboard queries: top 50 by best (best > 0); top 50 by daily_score for one daily_key (daily_score > 0).
create index if not exists fw_scores_best_idx  on public.fw_scores (best desc) where best > 0;
create index if not exists fw_scores_daily_idx on public.fw_scores (daily_key, daily_score desc) where daily_score > 0;

-- Moderation: a hidden row stays in the table and keeps being updated, but nobody else sees it on a board, and a
-- hidden versus row gets no rank and no reward at the season rollover. By hand, as the database owner:
--   update public.fw_scores set hidden = true where player_id = '<uuid>';   -- the leaderboard
--   update public.fw_versus set hidden = true where player_id = '<uuid>';   -- the versus ranking
--   select player_id, nick, best, gates, last_submit_at from public.fw_scores order by best desc limit 20;   -- who is on top
alter table public.fw_scores add column if not exists hidden boolean not null default false;

-- ---------- row level security + grants (read-only through the Data API) ----------
alter table public.fw_scores enable row level security;

-- Read: signed-in players only. The client always signs in anonymously before its first query, so "anon"
-- (publishable key with no user) needs nothing; leaving it out means the board cannot be read or scraped
-- without first creating a user, which is rate limited (and can be CAPTCHA-gated).
drop policy if exists fw_scores_read on public.fw_scores;
create policy fw_scores_read on public.fw_scores for select to authenticated
using (not hidden or player_id = (select auth.uid()));   -- a hidden player still sees their own row
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
-- PULSAR (bonus 2, feverMul 2, Resonance x3, no combo lift): 6 * (k + 3). Both are <= 6 * (k + 12), so
--   endless: score <= sum(k = 1..g) 6 * (k + 12) = 3*g^2 + 75*g
-- (2026-10: was 2*g^2 + 50*g, which PULSAR's Resonance x3 could pass on a long all-Perfect run.)
-- Ranks above ultra multiply a Perfect by score mastery (form V: x1.3 celestial .. x1.7 genesis) and grow their skills with the
-- form, so a run flown with one of them gets that rank's share of the bound (private.fw_bound_mul, below): its form-V mastery
-- plus room for the form growth. Every other unit keeps x1, so the check stays as tight as before for them; daily is unchanged.
-- Daily runs are "fair mode" (bonus <= 1, feverMul 2, dashPts 1, Resonance x1, no combo lift): <= 2 * (k + 2) per gate, so
--   daily:   score <= sum(k = 1..g) 2 * (k + 2) = g^2 + 5*g
-- Both assume every single gate is a perfect in fever, i.e. they are generous by a wide margin.
-- The units a row may name (BIRDS in index.html): one list for the leaderboard and the versus ranking.
create or replace function private.fw_units() returns text[]
language sql immutable set search_path = '' as $$
  select array['volt','blitz','nimbus','titan','mochi','aegis','phoenix','zero','pixel','neko','buzz',
               'kraken','specter','oracle','raijin','chrono','goliath','solaris','aurora','tempest','pleiad','pulsar',
               'monarch',    -- monarch: the season reward unit (private.fw_vs_season_cfg().top_unit)
               -- ranks above ultra (TIER_IDS in index.html), reserved before release: celestial, nebula, void, divine, genesis
               'seraph','valkyrie','lumen','halcyon','quasar','comet','zodiac','eclipse','singular','rift','nyx','entropy',
               'archon','ouroboros','kirin','garuda','aeon','cosmos','infinity','omega'];
$$;
revoke all on function private.fw_units() from public, anon, authenticated;
-- The highest released rank: TIER_OPEN in index.html. BUMP IT WITH EACH RANK'S RELEASE (both places, same PR): a unit above it
-- is refused on the leaderboard (testers in private.fw_testers excepted) and gets no share of the bound.
create or replace function private.fw_tier_open() returns integer
language sql immutable set search_path = '' as $$ select 4 $$;
revoke all on function private.fw_tier_open() from public, anon, authenticated;
-- A unit's rank for the release check and the bound: 5..9 for the ranks above ultra (TIER_IDS order), 0 for every other unit
-- (all of them released; the open ranks 0..4 are not told apart here)
create or replace function private.fw_unit_rank(p_bird text) returns integer
language sql immutable set search_path = '' as $$
  select case when p_bird = any (array['seraph','valkyrie','lumen','halcyon']) then 5
              when p_bird = any (array['quasar','comet','zodiac','eclipse']) then 6
              when p_bird = any (array['singular','rift','nyx','entropy']) then 7
              when p_bird = any (array['archon','ouroboros','kirin','garuda']) then 8
              when p_bird = any (array['aeon','cosmos','infinity','omega']) then 9
              else 0 end;
$$;
revoke all on function private.fw_unit_rank(text) from public, anon, authenticated;
-- A unit's share of the endless score bound (see the derivation above fw_units): x1 up to ultra, then by rank, and x1 for a
-- rank not released yet (private.fw_tier_open)
create or replace function private.fw_bound_mul(p_bird text) returns numeric
language sql immutable set search_path = '' as $$
  select case when r > private.fw_tier_open() then 1
              when r = 5 then 1.4
              when r = 6 then 1.5
              when r = 7 then 1.6
              when r = 8 then 1.75
              when r = 9 then 1.9
              else 1 end
  from (select private.fw_unit_rank(p_bird) as r) x;
$$;
revoke all on function private.fw_bound_mul(text) from public, anon, authenticated;

-- Names nobody may carry (profanity, slurs, sexual terms; ko en ja zh es pt fr de id vi). GENERATED from the lists in
-- index.html: do not edit by hand, run  node scripts/nick-filter-sql.mjs  and paste the output over this function.
-- A name is looked at twice: as written (lower-cased, separators removed: Hangul, kana, Chinese, accented Vietnamese) and as
-- plain Latin letters (accents removed, look-alike digits read as letters). Every letter of a listed word may repeat.
-- The first two patterns are \u-escaped Hangul / kana / Chinese / Vietnamese words. A word list stops casual abuse only.
create or replace function private.fw_nick_bad(p_nick text) returns boolean
language sql immutable set search_path = '' as $$
  select a ~ '(\uC528+\uBC1C+|\uC2DC+\uBC1C+|\uC528+\uBC8C+|\uC2DC+\uBC8C+|\uC528+\uD314+|\uC2DC+\uD314+|\uC528+\uBE68+|\uC2DC+\uBE68+|\uC4F0+\uBC1C+|\uC2DC+\uC774+\uBC1C+|\uC528+\uC774+\uBC1C+|\u3145+\uBC1C+|\u3146+\uBC1C+|\uC539+|\uC886+|\uC883+|\uC877+|\uBCD1+\uC2E0+|\uBE05+\uC2E0+|\uBE59+\uC2E0+|\uC9C0+\uB784+|\uAC1C+\uC0C8+\uB07C+|\uAC1C+\uC0C8+\uAE30+|\uAC1C+\uC0C9+\uAE30+|\uAC1C+\uC0C9+\uB07C+|\uAC1C+\uC138+\uB07C+|\uAC1C+\uC250+\uB07C+|\uC345+|\uC30D+\uB144+|\uC30D+\uB188+|\uBBF8+\uCE5C+\uB144+|\uBBF8+\uCE5C+\uB188+|\uCC3D+\uB140+|\uCC3D+\uB144+|\uAC78+\uB808+\uB144+|\uC139+\uC2A4+|\uC385+\uC2A4+|\uC57C+\uB3D9+|\uB290+\uAE08+|\uB2C8+\uC560+\uBBF8+|\uB2C8+\uC5D0+\uBBF8+|\uC5E0+\uCC3D+|\uD6C4+\uB808+\uC790+\uC2DD+|\uD638+\uB85C+\uC0C8+\uB07C+|\uD638+\uB85C+\uC790+\uC2DD+|\uD55C+\uB0A8+\uCDA9+|\uAE40+\uCE58+\uB140+|\uB41C+\uC7A5+\uB140+|\uB9D8+\uCDA9+|\uC9F1+\uAE68+|\uCABD+\uBC14+\uB9AC+|\uAE5C+\uB465+\uC774+|\uD2C0+\uB531+|\u3145+\u3142+|\u3146+\u3142+|\u3144+|\u3142+\u3145+|\u3148+\u3139+|\u3131+\u3145+\u3132+|\u3134+\u3131+\u3141+|\u6B7B+\u306D+|\u6C0F+\u306D+|\u6BBA+\u3059+|\u3061+\u3093+\u307D+|\u307E+\u3093+\u3053+|\u30C1+\u30F3+\u30DD+|\u30DE+\u30F3+\u30B3+|\u304D+\u3061+\u304C+\u3044+|\u30AD+\u30C1+\u30AC+\u30A4+|\u30D5+\u30A1+\u30C3+\u30AF+|\u30BB+\u30C3+\u30AF+\u30B9+|\u305B+\u3063+\u304F+\u3059+|\u30EC+\u30A4+\u30D7+|\u304F+\u305D+\u3084+\u308D+\u3046+|\u30AF+\u30BD+\u91CE+\u90CE+|\u64CD+\u4F60+|\u8349+\u6CE5+\u9A6C+|\u8349+\u4F60+\u5988+|\u808F+|\u50BB+\u903C+|\u50BB+\u5C44+|\u715E+\u7B14+|\u4ED6+\u5988+\u7684+|\u4ED6+\u5ABD+\u7684+|\u4F60+\u5988+\u7684+|\u4F60+\u5ABD+\u7684+|\u53BB+\u4F60+\u5988+|\u53BB+\u4F60+\u5ABD+|\u5988+\u903C+|\u5ABD+\u903C+|\u5A4A+\u5B50+|\u8D31+\u4EBA+|\u9E21+\u5DF4+|\u5E72+\u4F60+\u5A18+|\u5E79+\u4F60+\u5A18+|\u72D7+\u65E5+|\u65E5+\u4F60+\u5988+|\u738B+\u516B+\u86CB+|\u5F3A+\u5978+|\u5F37+\u59E6+|\u652F+\u90A3+|[\u0111\u0110]+[\u1ECB\u1ECA]+[tT]+|[\u0111\u0110]+[\u1EE5\u1EE4]+[mM]+[\u00E1\u00C1]+|[\u0111\u0110]+[\u1EE5\u1EE4]+[mM]+[\u1EB9\u1EB8]+|[\u0111\u0110]+[\u00F9\u00D9]+[mM]+[\u00E1\u00C1]+|[cC]+[\u1EB7\u1EB6]+[cC]+|[bB]+[uU]+[\u1ED3\u1ED2]+[iI]+|[\u0111\u0110]+[\u00E9\u00C9]+[oO]+|[vV]+[\u00E3\u00C3]+[iI]+[lL]+[\u1ED3\u1ED2]+[nN]+|\u0E40+\u0E2B+\u0E35+\u0E49+\u0E22+|\u0E04+\u0E27+\u0E22+|\u0E40+\u0E22+\u0E47+\u0E14+|\u0E41+\u0E15+\u0E14+|\u0E01+\u0E30+\u0E2B+\u0E23+\u0E35+\u0E48+|\u0E44+\u0E2D+\u0E49+\u0E2A+\u0E31+\u0E15+\u0E27+\u0E4C+|\u0E2D+\u0E35+\u0E14+\u0E2D+\u0E01+|\u091A+\u0942+\u0924+\u093F+\u092F+\u093E+|\u091A+\u0941+\u0924+\u093F+\u092F+\u093E+|\u092E+\u093E+\u0926+\u0930+\u091A+\u094B+\u0926+|\u092C+\u0939+\u0928+\u091A+\u094B+\u0926+|\u092D+\u0947+\u0928+\u091A+\u094B+\u0926+|\u092D+\u094B+\u0938+\u0921+|\u0930+\u0902+\u0921+\u0940+|\u0917+\u093E+\u0902+\u0921+\u0942+|\u0939+\u0930+\u093E+\u092E+\u0940+|[\u0445\u0425]+[\u0443\u0423]+[\u0439\u0419]+|[\u0445\u0425]+[\u0443\u0423]+[\u0451\u0401]+|[\u0445\u0425]+[\u0443\u0423]+[\u0435\u0415]+[\u0432\u0412]+|[\u0445\u0425]+[\u0443\u0423]+[\u0435\u0415]+[\u0441\u0421]+[\u043E\u041E]+[\u0441\u0421]+|[\u043F\u041F]+[\u0438\u0418]+[\u0437\u0417]+[\u0434\u0414]+|[\u0437\u0417]+[\u0430\u0410]+[\u0435\u0415]+[\u0431\u0411]+|[\u0432\u0412]+[\u044B\u042B]+[\u0435\u0415]+[\u0431\u0411]+|[\u0451\u0401]+[\u0431\u0411]+[\u0430\u0410]+[\u043D\u041D]+[\u044B\u042B]+[\u0439\u0419]+|[\u0435\u0415]+[\u0431\u0411]+[\u0430\u0410]+[\u043D\u041D]+[\u044B\u042B]+[\u0439\u0419]+|[\u0443\u0423]+[\u0435\u0415]+[\u0431\u0411]+[\u0430\u0410]+[\u043D\u041D]+|[\u0443\u0423]+[\u0451\u0401]+[\u0431\u0411]+[\u043E\u041E]+[\u043A\u041A]+|[\u043C\u041C]+[\u0443\u0423]+[\u0434\u0414]+[\u0430\u0410]+[\u043A\u041A]+|[\u043C\u041C]+[\u0443\u0423]+[\u0434\u0414]+[\u0438\u0418]+[\u043B\u041B]+[\u043E\u041E]+|[\u0431\u0411]+[\u043B\u041B]+[\u044F\u042F]+[\u0434\u0414]+[\u044C\u042C]+|[\u0431\u0411]+[\u043B\u041B]+[\u044F\u042F]+[\u0434\u0414]+[\u0438\u0418]+|[\u0431\u0411]+[\u043B\u041B]+[\u044F\u042F]+[\u0442\u0422]+[\u044C\u042C]+|[\u043F\u041F]+[\u0438\u0418]+[\u0434\u0414]+[\u043E\u041E]+[\u0440\u0420]+|[\u043F\u041F]+[\u0438\u0418]+[\u0434\u0414]+[\u0430\u0410]+[\u0440\u0420]+|[\u0433\u0413]+[\u0430\u0410]+[\u043D\u041D]+[\u0434\u0414]+[\u043E\u041E]+[\u043D\u041D]+|[\u0448\u0428]+[\u043B\u041B]+[\u044E\u042E]+[\u0445\u0425]+[\u0430\u0410]+|[\u0437\u0417]+[\u0430\u0410]+[\u043B\u041B]+[\u0443\u0423]+[\u043F\u041F]+[\u0430\u0410]+|[\u0434\u0414]+[\u0440\u0420]+[\u043E\u041E]+[\u0447\u0427]+[\u0438\u0418]+|[\u0436\u0416]+[\u043E\u041E]+[\u043F\u041F]+[\u0430\u0410]+|\u0643+\u0633+\u0645+\u0643+|\u0643+\u0633+\u0627+\u0645+\u0643+|\u0643+\u0633+\u062E+\u062A+\u0643+|\u0634+\u0631+\u0645+\u0648+\u0637+|\u0645+\u0646+\u064A+\u0648+\u0643+|\u0642+\u062D+\u0628+\u0629+|\u0642+\u062D+\u0628+\u0647+|\u0646+\u064A+\u0643+\u0646+\u064A+|\u0627+\u0646+\u064A+\u0643+\u0643+|\u0645+\u0639+\u0631+\u0635+|\u0645+\u062A+\u0646+\u0627+\u0643+|\u0627+\u0628+\u0646+\u0627+\u0644+\u0643+\u0644+\u0628+|\u0644+\u0648+\u0637+\u064A+|\u0637+\u064A+\u0632+|\u05D6+\u05D5+\u05E0+\u05D4+|\u05DB+\u05D5+\u05E1+\u05D0+\u05DE+\u05E7+|\u05DB+\u05D5+\u05E1+\u05E2+\u05DE+\u05E7+|\u05DE+\u05D6+\u05D3+\u05D9+\u05D9+\u05DF+|\u05E9+\u05E8+\u05DE+\u05D5+\u05D8+|\u05DE+\u05E0+\u05D9+\u05D0+\u05E7+|\u05E7+\u05D5+\u05E7+\u05E1+\u05D9+\u05E0+\u05DC+|\u5E79+\u6797+\u5A18+|\u5E79+\u6041+\u5A18+|\u9760+\u5317+|\u6A5F+\u63B0+|\u96DE+\u63B0+|\u6A5F+\u6B6A+|\u96DE+\u5DF4+|\u5C4C+\u4F60+|\u8349+\u6CE5+\u99AC+|\u8CE4+\u4EBA+|\u9ED1+\u9B3C+)'
      or a ~ '^(\uBCF4+\uC9C0+|\uC790+\uC9C0+|\u0E2B+\u0E35+|[\u0441\u0421]+[\u0443\u0423]+[\u043A\u041A]+[\u0430\u0410]+|[\u0441\u0421]+[\u0443\u0423]+[\u0447\u0427]+[\u043A\u041A]+[\u0430\u0410]+|[\u043F\u041F]+[\u0435\u0415]+[\u0434\u0414]+[\u0438\u0418]+[\u043A\u041A]+|\u0643+\u0633+|\u0632+\u0628+|\u0646+\u064A+\u0643+|\u062E+\u0648+\u0644+|\u0639+\u0631+\u0635+|\u05DB+\u05D5+\u05E1+|\u05D6+\u05D9+\u05DF+|\u05D7+\u05E8+\u05D0+|\u0633+\u0643+\u0633+|\u05E1+\u05E7+\u05E1+)$'
      or b ~ '([fF]+[uU]+[cC]+[kK]+|[fF]+[vV]+[cC]+[kK]+|[pP]+[hH]+[uU]+[cC]+[kK]+|[bB]+[uU]+[lL]+[lL]+[sS]+[hH]+[iI]+[tT]+|[sS]+[hH]+[iI]+[tT]+[hH]+[eE]+[aA]+[dD]+|[sS]+[hH]+[iI]+[tT]+[tT]+[yY]+|[sS]+[hH]+[iI]+[tT]+[fF]+[aA]+[cC]+[eE]+|[dD]+[iI]+[pP]+[sS]+[hH]+[iI]+[tT]+|[hH]+[oO]+[rR]+[sS]+[eE]+[sS]+[hH]+[iI]+[tT]+|[bB]+[iI]+[tT]+[cC]+[hH]+|[bB]+[iI]+[aA]+[tT]+[cC]+[hH]+|[cC]+[uU]+[nN]+[tT]+|[nN]+[iI]+[gG]+[gG]+[eE]+[rR]+|[nN]+[iI]+[gG]+[gG]+[aA]+|[fF]+[aA]+[gG]+[gG]+[oO]+[tT]+|[wW]+[hH]+[oO]+[rR]+[eE]+|[sS]+[lL]+[uU]+[tT]+|[aA]+[sS]+[sS]+[hH]+[oO]+[lL]+[eE]+|[aA]+[rR]+[sS]+[eE]+[hH]+[oO]+[lL]+[eE]+|[bB]+[aA]+[sS]+[tT]+[aA]+[rR]+[dD]+|[dD]+[iI]+[cC]+[kK]+[hH]+[eE]+[aA]+[dD]+|[cC]+[oO]+[cC]+[kK]+[sS]+[uU]+[cC]+[kK]+|[pP]+[uU]+[sS]+[sS]+[yY]+|[pP]+[eE]+[nN]+[iI]+[sS]+|[vV]+[aA]+[gG]+[iI]+[nN]+[aA]+|[hH]+[iI]+[tT]+[lL]+[eE]+[rR]+|[wW]+[aA]+[nN]+[kK]+[eE]+[rR]+|[pP]+[eE]+[dD]+[oO]+[pP]+[hH]+[iI]+[lL]+|[pP]+[aA]+[eE]+[dD]+[oO]+|[jJ]+[iI]+[zZ]+[zZ]+|[dD]+[iI]+[lL]+[dD]+[oO]+|[bB]+[lL]+[oO]+[wW]+[jJ]+[oO]+[bB]+|[hH]+[aA]+[nN]+[dD]+[jJ]+[oO]+[bB]+|[wW]+[eE]+[tT]+[bB]+[aA]+[cC]+[kK]+|[tT]+[rR]+[aA]+[nN]+[nN]+[yY]+|[sS]+[hH]+[iI]+[bB]+[aA]+[lL]+|[bB]+[yY]+[uU]+[nN]+[gG]+[sS]+[iI]+[nN]+|[bB]+[yY]+[eE]+[oO]+[nN]+[gG]+[sS]+[iI]+[nN]+|[gG]+[aA]+[eE]+[sS]+[aA]+[eE]+[kK]+[kK]+[iI]+|[tT]+[lL]+[qQ]+[kK]+[fF]+|[qQ]+[uU]+[dD]+[tT]+[lL]+[sS]+|[wW]+[lL]+[fF]+[kK]+[fF]+|[cC]+[hH]+[iI]+[nN]+[pP]+[oO]+|[kK]+[iI]+[cC]+[hH]+[iI]+[gG]+[aA]+[iI]+|[cC]+[aA]+[oO]+[nN]+[iI]+[mM]+[aA]+|[hH]+[iI]+[jJ]+[oO]+[dD]+[eE]+[pP]+[uU]+[tT]+[aA]+|[hH]+[iI]+[jJ]+[uU]+[eE]+[pP]+[uU]+[tT]+[aA]+|[pP]+[uU]+[tT]+[aA]+[mM]+[aA]+[dD]+[rR]+[eE]+|[mM]+[iI]+[eE]+[rR]+[dD]+[aA]+|[pP]+[eE]+[nN]+[dD]+[eE]+[jJ]+[oO]+|[cC]+[aA]+[bB]+[rR]+[oO]+[nN]+|[jJ]+[oO]+[dD]+[eE]+[rR]+|[mM]+[aA]+[rR]+[iI]+[cC]+[oO]+[nN]+|[gG]+[iI]+[lL]+[iI]+[pP]+[oO]+[lL]+[lL]+[aA]+[sS]+|[cC]+[hH]+[iI]+[nN]+[gG]+[aA]+[dD]+[aA]+|[cC]+[hH]+[iI]+[nN]+[gG]+[aA]+[tT]+[uU]+[mM]+[aA]+[dD]+[rR]+[eE]+|[cC]+[aA]+[rR]+[aA]+[lL]+[hH]+[oO]+|[mM]+[eE]+[rR]+[dD]+[aA]+|[bB]+[uU]+[cC]+[eE]+[tT]+[aA]+|[fF]+[iI]+[lL]+[hH]+[oO]+[dD]+[aA]+[pP]+[uU]+[tT]+[aA]+|[cC]+[uU]+[zZ]+[aA]+[oO]+|[aA]+[rR]+[rR]+[oO]+[mM]+[bB]+[aA]+[dD]+[oO]+|[fF]+[oO]+[dD]+[aA]+[sS]+[eE]+|[pP]+[uU]+[tT]+[aA]+[iI]+[nN]+|[mM]+[eE]+[rR]+[dD]+[eE]+|[sS]+[aA]+[lL]+[oO]+[pP]+[eE]+|[cC]+[oO]+[nN]+[nN]+[aA]+[rR]+[dD]+|[cC]+[oO]+[nN]+[nN]+[aA]+[sS]+[sS]+[eE]+|[eE]+[nN]+[cC]+[uU]+[lL]+[eE]+|[sS]+[aA]+[lL]+[aA]+[uU]+[dD]+|[bB]+[aA]+[tT]+[aA]+[rR]+[dD]+|[bB]+[oO]+[uU]+[gG]+[nN]+[oO]+[uU]+[lL]+[eE]+|[nN]+[iI]+[qQ]+[uU]+[eE]+[tT]+[aA]+[mM]+[eE]+[rR]+[eE]+|[fF]+[iI]+[lL]+[sS]+[dD]+[eE]+[pP]+[uU]+[tT]+[eE]+|[sS]+[cC]+[hH]+[eE]+[iI]+[sS]+|[aA]+[rR]+[sS]+[cC]+[hH]+[lL]+[oO]+[cC]+[hH]+|[fF]+[oO]+[tT]+[zZ]+[eE]+|[hH]+[uU]+[rR]+[eE]+[nN]+[sS]+[oO]+[hH]+[nN]+|[wW]+[iI]+[cC]+[hH]+[sS]+[eE]+[rR]+|[sS]+[cC]+[hH]+[lL]+[aA]+[mM]+[pP]+[eE]+|[sS]+[cC]+[hH]+[wW]+[uU]+[cC]+[hH]+[tT]+[eE]+[lL]+|[fF]+[iI]+[cC]+[kK]+[eE]+[nN]+|[fF]+[iI]+[cC]+[kK]+[dD]+[iI]+[cC]+[hH]+|[mM]+[iI]+[sS]+[sS]+[gG]+[eE]+[bB]+[uU]+[rR]+[tT]+|[kK]+[aA]+[nN]+[aA]+[kK]+[eE]+|[aA]+[nN]+[jJ]+[iI]+[nN]+[gG]+|[bB]+[aA]+[nN]+[gG]+[sS]+[aA]+[tT]+|[kK]+[oO]+[nN]+[tT]+[oO]+[lL]+|[mM]+[eE]+[mM]+[eE]+[kK]+|[nN]+[gG]+[eE]+[nN]+[tT]+[oO]+[tT]+|[jJ]+[aA]+[nN]+[cC]+[oO]+[kK]+|[jJ]+[aA]+[nN]+[cC]+[uU]+[kK]+|[gG]+[oO]+[bB]+[lL]+[oO]+[kK]+|[bB]+[aA]+[jJ]+[iI]+[nN]+[gG]+[aA]+[nN]+|[pP]+[eE]+[pP]+[eE]+[kK]+|[pP]+[aA]+[nN]+[tT]+[eE]+[kK]+|[dD]+[iI]+[tT]+[mM]+[eE]+|[dD]+[uU]+[mM]+[eE]+[mM]+[aA]+[yY]+|[cC]+[hH]+[uU]+[tT]+[iI]+[yY]+[aA]+|[cC]+[hH]+[uU]+[tT]+[iI]+[yY]+[eE]+|[mM]+[aA]+[dD]+[aA]+[rR]+[cC]+[hH]+[oO]+[dD]+|[bB]+[eE]+[hH]+[eE]+[nN]+[cC]+[hH]+[oO]+[dD]+|[bB]+[hH]+[eE]+[nN]+[cC]+[hH]+[oO]+[dD]+|[bB]+[hH]+[oO]+[sS]+[dD]+[iI]+|[bB]+[hH]+[oO]+[sS]+[dD]+[aA]+|[oO]+[rR]+[oO]+[sS]+[pP]+[uU]+|[aA]+[mM]+[iI]+[nN]+[aA]+[kK]+[oO]+[yY]+|[aA]+[mM]+[nN]+[aA]+[kK]+[oO]+[yY]+|[aA]+[mM]+[cC]+[iI]+[kK]+|[aA]+[mM]+[cC]+[kK]+|[sS]+[iI]+[kK]+[tT]+[iI]+[rR]+|[sS]+[iI]+[kK]+[eE]+[rR]+[iI]+[mM]+|[sS]+[iI]+[kK]+[eE]+[yY]+[iI]+[mM]+|[pP]+[eE]+[zZ]+[eE]+[vV]+[eE]+[nN]+[kK]+|[yY]+[aA]+[rR]+[rR]+[aA]+[kK]+|[dD]+[aA]+[lL]+[yY]+[aA]+[rR]+[aA]+[kK]+|[kK]+[aA]+[hH]+[pP]+[eE]+|[yY]+[aA]+[vV]+[sS]+[aA]+[kK]+|[sS]+[uU]+[rR]+[tT]+[uU]+[kK]+|[gG]+[oO]+[tT]+[vV]+[eE]+[rR]+[eE]+[nN]+|[kK]+[uU]+[rR]+[wW]+[aA]+|[kK]+[uU]+[rR]+[wW]+[yY]+|[kK]+[uU]+[rR]+[eE]+[wW]+|[cC]+[hH]+[uU]+[jJ]+|[pP]+[iI]+[eE]+[rR]+[dD]+[oO]+[lL]+|[pP]+[iI]+[eE]+[rR]+[dD]+[aA]+[lL]+|[jJ]+[eE]+[bB]+[aA]+[cC]+|[jJ]+[eE]+[bB]+[aA]+[nN]+[yY]+|[jJ]+[eE]+[bB]+[aA]+[nN]+[aA]+|[zZ]+[aA]+[jJ]+[eE]+[bB]+|[wW]+[yY]+[jJ]+[eE]+[bB]+|[pP]+[oO]+[jJ]+[eE]+[bB]+|[pP]+[iI]+[zZ]+[dD]+[aA]+|[cC]+[aA]+[zZ]+[zZ]+[oO]+|[fF]+[aA]+[nN]+[cC]+[uU]+[lL]+[oO]+|[sS]+[tT]+[rR]+[oO]+[nN]+[zZ]+[oO]+|[sS]+[tT]+[rR]+[oO]+[nN]+[zZ]+[aA]+|[pP]+[uU]+[tT]+[tT]+[aA]+[nN]+[aA]+|[cC]+[oO]+[gG]+[lL]+[iI]+[oO]+[nN]+|[mM]+[iI]+[nN]+[cC]+[hH]+[iI]+[aA]+|[fF]+[rR]+[oO]+[cC]+[iI]+[oO]+|[zZ]+[oO]+[cC]+[cC]+[oO]+[lL]+[aA]+|[mM]+[iI]+[gG]+[nN]+[oO]+[tT]+[tT]+[aA]+|[pP]+[oO]+[rR]+[cC]+[oO]+[dD]+[iI]+[oO]+|[dD]+[iI]+[oO]+[pP]+[oO]+[rR]+[cC]+[oO]+|[pP]+[oO]+[rR]+[cC]+[aA]+[mM]+[aA]+[dD]+[oO]+[nN]+[nN]+[aA]+|[kK]+[aA]+[nN]+[kK]+[eE]+[rR]+|[kK]+[lL]+[oO]+[oO]+[tT]+[zZ]+[aA]+[kK]+|[hH]+[oO]+[eE]+[rR]+[eE]+[nN]+[zZ]+[oO]+[oO]+[nN]+|[tT]+[eE]+[rR]+[iI]+[nN]+[gG]+[lL]+[iI]+[jJ]+[eE]+[rR]+|[kK]+[uU]+[tT]+[wW]+[iI]+[jJ]+[fF]+|[gG]+[oO]+[dD]+[vV]+[eE]+[rR]+[dD]+[oO]+[mM]+|[nN]+[eE]+[uU]+[kK]+[eE]+[nN]+|[vV]+[iI]+[tT]+[tT]+[uU]+|[kK]+[uU]+[sS]+[iI]+[pP]+[aA]+[aA]+|[mM]+[uU]+[lL]+[kK]+[kK]+[uU]+|[kK]+[yY]+[rR]+[pP]+[aA]+|[rR]+[uU]+[nN]+[kK]+[kK]+[aA]+[rR]+[iI]+|[nN]+[eE]+[eE]+[kK]+[eE]+[rR]+[iI]+|[hH]+[oO]+[rR]+[uU]+[nN]+[gG]+[eE]+|[fF]+[iI]+[tT]+[tT]+[eE]+[tT]+[rR]+[yY]+[nN]+[eE]+|[pP]+[uU]+[kK]+[iI]+[mM]+[aA]+[kK]+|[kK]+[iI]+[mM]+[aA]+[kK]+|[lL]+[aA]+[nN]+[cC]+[aA]+[uU]+|[pP]+[eE]+[lL]+[aA]+[cC]+[uU]+[rR]+|[hH]+[aA]+[rR]+[aA]+[mM]+[jJ]+[aA]+[dD]+[aA]+[hH]+|[cC]+[iI]+[bB]+[aA]+[iI]+|[lL]+[aA]+[nN]+[jJ]+[iI]+[aA]+[oO]+)'
      or p ~ '(^|[^a-z])([sS]+[hH]+[iI]+[tT]+|[aA]+[sS]+[sS]+|[aA]+[nN]+[aA]+[lL]+|[aA]+[nN]+[uU]+[sS]+|[cC]+[oO]+[cC]+[kK]+|[sS]+[eE]+[xX]+|[rR]+[aA]+[pP]+[eE]+|[rR]+[aA]+[pP]+[iI]+[sS]+[tT]+|[nN]+[aA]+[zZ]+[iI]+|[tT]+[wW]+[aA]+[tT]+|[pP]+[eE]+[dD]+[oO]+|[cC]+[hH]+[iI]+[nN]+[kK]+|[gG]+[oO]+[oO]+[kK]+|[sS]+[pP]+[iI]+[cC]+|[bB]+[eE]+[aA]+[nN]+[eE]+[rR]+|[fF]+[aA]+[gG]+|[fF]+[aA]+[gG]+[sS]+|[mM]+[iI]+[lL]+[fF]+|[kK]+[yY]+[sS]+|[fF]+[uU]+[kK]+|[fF]+[cC]+[kK]+|[fF]+[uU]+[qQ]+|[rR]+[eE]+[tT]+[aA]+[rR]+[dD]+|[pP]+[oO]+[rR]+[nN]+|[cC]+[nN]+[mM]+|[wW]+[cC]+[nN]+[mM]+|[nN]+[mM]+[sS]+[lL]+|[sS]+[hH]+[aA]+[bB]+[iI]+|[sS]+[iI]+[bB]+[aA]+[lL]+|[cC]+[hH]+[iI]+[nN]+[kK]+[oO]+|[oO]+[mM]+[aA]+[nN]+[kK]+[oO]+|[pP]+[uU]+[tT]+[aA]+|[pP]+[uU]+[tT]+[oO]+|[pP]+[uU]+[tT]+[aA]+[sS]+|[pP]+[uU]+[tT]+[oO]+[sS]+|[vV]+[eE]+[rR]+[gG]+[aA]+|[cC]+[uU]+[lL]+[oO]+|[zZ]+[oO]+[rR]+[rR]+[aA]+|[pP]+[iI]+[nN]+[cC]+[hH]+[eE]+|[pP]+[oO]+[rR]+[rR]+[aA]+|[fF]+[oO]+[dD]+[aA]+|[fF]+[oO]+[dD]+[eE]+[rR]+|[vV]+[iI]+[aA]+[dD]+[oO]+|[bB]+[oO]+[sS]+[tT]+[aA]+|[pP]+[uU]+[tT]+[eE]+|[aA]+[rR]+[sS]+[cC]+[hH]+|[hH]+[uU]+[rR]+[eE]+|[fF]+[iI]+[cC]+[kK]+|[nN]+[uU]+[tT]+[tT]+[eE]+|[nN]+[eE]+[gG]+[eE]+[rR]+|[nN]+[gG]+[eE]+[wW]+[eE]+|[lL]+[oO]+[nN]+[tT]+[eE]+|[pP]+[eE]+[rR]+[eE]+[kK]+|[vV]+[cC]+[lL]+|[cC]+[lL]+[gG]+[tT]+|[dD]+[cC]+[mM]+|[gG]+[aA]+[nN]+[dD]+[uU]+|[rR]+[aA]+[nN]+[dD]+[iI]+|[lL]+[aA]+[uU]+[dD]+[aA]+|[aA]+[mM]+[kK]+|[iI]+[bB]+[nN]+[eE]+|[kK]+[aA]+[lL]+[tT]+[aA]+[kK]+|[cC]+[iI]+[pP]+[aA]+|[dD]+[uU]+[pP]+[aA]+|[cC]+[wW]+[eE]+[lL]+|[kK]+[uU]+[tT]+|[lL]+[uU]+[lL]+|[hH]+[oO]+[eE]+[rR]+|[hH]+[oO]+[eE]+[rR]+[eE]+[nN]+|[tT]+[eE]+[rR]+[iI]+[nN]+[gG]+|[tT]+[yY]+[fF]+[uU]+[sS]+|[fF]+[lL]+[iI]+[kK]+[kK]+[eE]+[rR]+|[pP]+[aA]+[sS]+[kK]+[aA]+|[hH]+[uU]+[oO]+[rR]+[aA]+|[pP]+[iI]+[lL]+[lL]+[uU]+|[fF]+[aA]+[eE]+[nN]+|[fF]+[iI]+[tT]+[tT]+[eE]+|[fF]+[iI]+[tT]+[tT]+[aA]+|[hH]+[oO]+[rR]+[eE]+|[pP]+[aA]+[kK]+[kK]+[iI]+[sS]+)([^a-z]|$)'
      or p ~ '[a-z]' and p !~ '[ \u00A0\u3000]' and b ~ '^([sS]+[hH]+[iI]+[tT]+|[aA]+[sS]+[sS]+|[aA]+[nN]+[aA]+[lL]+|[aA]+[nN]+[uU]+[sS]+|[cC]+[oO]+[cC]+[kK]+|[sS]+[eE]+[xX]+|[rR]+[aA]+[pP]+[eE]+|[rR]+[aA]+[pP]+[iI]+[sS]+[tT]+|[nN]+[aA]+[zZ]+[iI]+|[tT]+[wW]+[aA]+[tT]+|[pP]+[eE]+[dD]+[oO]+|[cC]+[hH]+[iI]+[nN]+[kK]+|[gG]+[oO]+[oO]+[kK]+|[sS]+[pP]+[iI]+[cC]+|[bB]+[eE]+[aA]+[nN]+[eE]+[rR]+|[fF]+[aA]+[gG]+|[fF]+[aA]+[gG]+[sS]+|[mM]+[iI]+[lL]+[fF]+|[kK]+[yY]+[sS]+|[fF]+[uU]+[kK]+|[fF]+[cC]+[kK]+|[fF]+[uU]+[qQ]+|[rR]+[eE]+[tT]+[aA]+[rR]+[dD]+|[pP]+[oO]+[rR]+[nN]+|[cC]+[nN]+[mM]+|[wW]+[cC]+[nN]+[mM]+|[nN]+[mM]+[sS]+[lL]+|[sS]+[hH]+[aA]+[bB]+[iI]+|[sS]+[iI]+[bB]+[aA]+[lL]+|[cC]+[hH]+[iI]+[nN]+[kK]+[oO]+|[oO]+[mM]+[aA]+[nN]+[kK]+[oO]+|[pP]+[uU]+[tT]+[aA]+|[pP]+[uU]+[tT]+[oO]+|[pP]+[uU]+[tT]+[aA]+[sS]+|[pP]+[uU]+[tT]+[oO]+[sS]+|[vV]+[eE]+[rR]+[gG]+[aA]+|[cC]+[uU]+[lL]+[oO]+|[zZ]+[oO]+[rR]+[rR]+[aA]+|[pP]+[iI]+[nN]+[cC]+[hH]+[eE]+|[pP]+[oO]+[rR]+[rR]+[aA]+|[fF]+[oO]+[dD]+[aA]+|[fF]+[oO]+[dD]+[eE]+[rR]+|[vV]+[iI]+[aA]+[dD]+[oO]+|[bB]+[oO]+[sS]+[tT]+[aA]+|[pP]+[uU]+[tT]+[eE]+|[aA]+[rR]+[sS]+[cC]+[hH]+|[hH]+[uU]+[rR]+[eE]+|[fF]+[iI]+[cC]+[kK]+|[nN]+[uU]+[tT]+[tT]+[eE]+|[nN]+[eE]+[gG]+[eE]+[rR]+|[nN]+[gG]+[eE]+[wW]+[eE]+|[lL]+[oO]+[nN]+[tT]+[eE]+|[pP]+[eE]+[rR]+[eE]+[kK]+|[vV]+[cC]+[lL]+|[cC]+[lL]+[gG]+[tT]+|[dD]+[cC]+[mM]+|[gG]+[aA]+[nN]+[dD]+[uU]+|[rR]+[aA]+[nN]+[dD]+[iI]+|[lL]+[aA]+[uU]+[dD]+[aA]+|[aA]+[mM]+[kK]+|[iI]+[bB]+[nN]+[eE]+|[kK]+[aA]+[lL]+[tT]+[aA]+[kK]+|[cC]+[iI]+[pP]+[aA]+|[dD]+[uU]+[pP]+[aA]+|[cC]+[wW]+[eE]+[lL]+|[kK]+[uU]+[tT]+|[lL]+[uU]+[lL]+|[hH]+[oO]+[eE]+[rR]+|[hH]+[oO]+[eE]+[rR]+[eE]+[nN]+|[tT]+[eE]+[rR]+[iI]+[nN]+[gG]+|[tT]+[yY]+[fF]+[uU]+[sS]+|[fF]+[lL]+[iI]+[kK]+[kK]+[eE]+[rR]+|[pP]+[aA]+[sS]+[kK]+[aA]+|[hH]+[uU]+[oO]+[rR]+[aA]+|[pP]+[iI]+[lL]+[lL]+[uU]+|[fF]+[aA]+[eE]+[nN]+|[fF]+[iI]+[tT]+[tT]+[eE]+|[fF]+[iI]+[tT]+[tT]+[aA]+|[hH]+[oO]+[rR]+[eE]+|[pP]+[aA]+[kK]+[kK]+[iI]+[sS]+)$'
  from (select a, p, regexp_replace(translate(p, '013457$@!', 'oieastsai'), '[^a-z]', '', 'g') as b
        from (select regexp_replace(normalize(w, NFC), '[\u0001-@[-`{-\u00BF\u02B0-\u036F\u2000-\u206F\u3000-\u303F\uFE00-\uFE0F\uFEFF\uFF00-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]', '', 'g') as a,
                     replace(lower(replace(replace(regexp_replace(normalize(w, NFD), '[\u0300-\u036F]', '', 'g'), U&'\0110', 'd'), U&'\0111', 'd')), U&'\00DF', 'ss') as p
              from (select translate(left(coalesce(p_nick, ''), 64),
                             U&'\FF21\FF22\FF23\FF24\FF25\FF26\FF27\FF28\FF29\FF2A\FF2B\FF2C\FF2D\FF2E\FF2F\FF30\FF31\FF32\FF33\FF34\FF35\FF36\FF37\FF38\FF39\FF3A\FF41\FF42\FF43\FF44\FF45\FF46\FF47\FF48\FF49\FF4A\FF4B\FF4C\FF4D\FF4E\FF4F\FF50\FF51\FF52\FF53\FF54\FF55\FF56\FF57\FF58\FF59\FF5A',
                             'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz') as w) s0) s1) s2;
$$;
revoke all on function private.fw_nick_bad(text) from public, anon, authenticated;
-- A pattern error would otherwise first show inside a player's score submit: stop the paste here instead.
do $$ begin
  if private.fw_nick_bad('Pilot') or private.fw_nick_bad('Pilot-7175') or private.fw_nick_bad(null)
     or not private.fw_nick_bad('fuck') or not private.fw_nick_bad(U&'\C2DC 1 \BC1C') or not private.fw_nick_bad(U&'\0110\1ECAT') then
    raise exception 'fw_nick_bad self-test failed';
  end if;
end $$;

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
    submit_day = v_row.submit_day, submit_count = v_row.submit_count + 1, last_submit_at = v_now, updated_at = v_now,
    hidden = hidden or v_soft   -- over the soft limit: off the boards for review (an admin un-hides); never un-hidden here
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
-- One RP per player, shared by 1v1 and 2v2. Win +50, loss -50, draw 0, never below 0. Matches against the AI are
-- practice: the client never reports them. Tiers (client, PTIERS): 0 / 400 / 1,000 / 2,000 / 3,600 / 5,600 / 8,000 RP.
--
-- There is still no referee: two (or four) clients play a seeded course and each decides the result on its own.
-- The server only cross-checks what the participants say:
--   versus_start(match, mode, team, nick, cc, bird)   when the countdown ends: registers the caller in the match
--   versus_report(match, result)                      'win' | 'lose' | 'draw' from the caller's TEAM's point of view
--   versus_me()                                       the caller's RP row (creates nothing) + their latest match
--                                                     + the season and the caller's unclaimed past results
--   versus_claim(season, nonce)                       the caller's result and reward for an ended season, once
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
--   3. somebody has reported and it is past the later of (first registration + settle_after) and
--      (first report + report_grace):
--        both teams present -> SETTLED as reported; silent participants get the complementary result
--                              (closing the tab does not dodge a loss)
--        one team only      -> VOID
--   4. nobody has reported by (first registration + void_after)         -> VOID. void_after is long on purpose:
--      a match is one endless seeded run and good players can fly for many minutes, so a match with no report
--      yet is normally just still being played (it used to be voided at settle_after, 5 minutes).
--      A deadline is only looked at when a participant of that match next calls versus_start, versus_report or versus_me.
--   A match with a single registered team can never give RP. Roster members who never registered are untouched.
--   Applied per participant, in player_id order: win +rp_win, loss -rp_loss floored at 0, and wins / losses / draws.
--   Values: private.fw_vs_cfg().
--
-- What a modified client can and cannot do:
--   - Write the tables, or call anything but the four functions: no (RLS without a write policy, no table
--     privilege, the bookkeeping sits in the unexposed schema, helpers are not executable by clients).
--   - Report for someone else, twice, without having registered, or change a report: no.
--   - Claim a win it did not earn: the rival's honest report contradicts it -> void. So a cheat can always turn its
--     own LOSS into a void (report "win", or never register: a match with one team is void), i.e. dodge -50, but
--     it gets no RP for it. Registering late to see how the match goes first is limited by the join window.
--   - Win by outlasting the clock: if the rival never reports before the deadline (their client was kept waiting by
--     a fake "still alive" state, they closed the tab), the lone claim stands and the rival takes the loss. Only a
--     referee (server-side simulation or replay check) closes this.
--   - Impersonate a rival inside a room (Realtime broadcasts are not signed): can make an honest player register a
--     match against the impostor's id; the impostor gains only if that player then honestly reports a loss.
--   - Two accounts that agree on results (one person with two accounts) can trade wins: nothing here can tell that
--     from a real match, and the feeder account loses nothing once it sits at 0 RP. The brakes are: ranked play
--     needs an account, not a guest (private.fw_need_account: versus_start / versus_report / versus_claim refuse
--     with fw_need_account, a guest plays unranked), pair_cap matches per pair of rivals per pair_window,
--     starts_per_hour, min_play between registering and reporting, and a season rank needs fw_vs_min_rivals()
--     different rivals. CAPTCHA on sign-in (step 3) is the next step up.
--   - Replay: a match id is registered once per player and settles once; reports after settlement change nothing.
--   - Flooding: registrations are capped per player per hour, each adds one row (plus one per match), finished
--     matches are deleted after "keep" when one of their participants next calls in. Both caps are counted under
--     a per-player lock, so a burst of parallel calls cannot slip past them.
--
-- SEASONS. A season is one calendar month in Korea time (Asia/Seoul) and has the id YYYYMM of that month
-- (202610); it changes at 00:00 KST on the 1st. private.fw_vs_season holds, in its single row, the id of the
-- season that fw_versus currently describes. A pg_cron job (end of this file, when the extension is on) calls
-- private.fw_vs_tick() every day at 00:00 KST, so the rollover normally runs there, with no timeout; as a fallback
-- every one of the four functions also calls
-- private.fw_vs_tick() as soon as its arguments have been checked (a call with bad arguments is refused before
-- it, so it can never make the server do a rollover), and the first call whose clock is in a later month than
-- that row does the rollover, inside its own transaction, before it reads or writes anything else:
--   1. every fw_versus row with at least one ranked match (wins + losses + draws > 0) is copied to
--      public.fw_vs_standing under the season that ended, with its tier and, for players with at least
--      min_matches ranked matches against at least fw_vs_min_rivals() different rivals, on an account (not a
--      guest), its rank: rp desc, wins desc, earlier updated_at, player_id — a total order, so no two players
--      share a rank. The others are kept with their numbers but without a rank (and without a reward);
--   2. rp, wins, losses, draws and rivals of every fw_versus row are reset (the row, its nick / cc / bird stay);
--   3. the state row moves to the current month and remembers the season just closed ("prev").
-- Exactly once: step 3 is in the same transaction, and the whole of it runs under the season lock (below).
-- A match that straddles the boundary belongs to the NEW season: RP is applied when a match settles, not when
-- it starts, and a settlement can only run before the rollover (then it is part of the standings) or after it
-- (then it lands on the zeroed row). Nothing but the rollover ever writes fw_vs_standing rows; settlement
-- writes fw_versus only, so no settlement can reach an archived season.
-- Months in which nobody called at all: the rollover runs once, when the next call comes. The numbers in
-- fw_versus are then still those of the last season anybody played in, and are archived under THAT season's id;
-- the silent months in between get no standings (nobody played, so there is nothing to rank) and "prev" names
-- the season that was archived. Applying this file to a database that already has fw_versus rows starts the
-- first season with those rows as they are (nothing is reset by the upgrade itself).
-- Rewards are decided here, from the archived row, by private.fw_vs_reward(): a tier reward for every ranked
-- player and the limited unit for ranks 1..top_n (numbers: private.fw_vs_season_cfg()). versus_claim marks the
-- row claimed and returns the reward; a second call returns the same answer with "already": true.
-- If the state row is ever set back by hand to a season that already has standings, the rollover keeps that
-- archive as it is and writes nothing to it (the numbers then in fw_versus are reset without being archived).
--
-- SCALE LIMIT OF THE ROLLOVER. It is one insert and one update over every played fw_versus row, inside a single
-- player's request, under the statement timeout of the API role (8 s for "authenticated" on Supabase). If it
-- cannot finish in that time the call fails and everything is rolled back, the state row stays on the old month,
-- and EVERY versus call (start, report, me, claim) tries the same rollover again and fails the same way: the
-- ranking is down until an operator rolls over by hand. Fine for tens of thousands of players; this becomes a
-- concern at around 10^5 players with a ranked match in one season. The remedy then is to take the rollover out
-- of the players' requests: a scheduled job (pg_cron, shortly after 00:00 KST on the 1st, running the block
-- below) or a batched rollover.
-- Manual recovery, as a superuser (SQL editor / psql as postgres). It does what fw_vs_tick() does, without the
-- timeout; every statement is a no-op when the state row already names the current month, so it is safe to run
-- twice or after a player's call got through:
--   begin;
--   set local statement_timeout = 0;
--   select pg_advisory_xact_lock(hashtextextended('fw_vs_season', 0));   -- the season lock, exclusive: waits for the calls in flight
--   insert into public.fw_vs_standing (season, player_id, rank, rp, tier, wins, losses, draws, matches, nick, cc, bird)
--   select x.season, x.player_id,
--          case when x.ok then (row_number() over (partition by x.ok order by x.rp desc, x.wins desc, x.updated_at, x.player_id))::integer end,
--          x.rp, private.fw_vs_tier(x.rp), x.wins, x.losses, x.draws, x.n, x.nick, x.cc, x.bird
--   from (select s.season, v.player_id, v.rp, v.wins, v.losses, v.draws, v.updated_at, v.nick, v.cc, v.bird,
--                v.wins + v.losses + v.draws as n,
--                v.wins + v.losses + v.draws >= private.fw_vs_min_matches(s.season) and not v.hidden
--                  and cardinality(v.rivals) >= private.fw_vs_min_rivals(s.season)
--                  and coalesce((select to_jsonb(u) ->> 'is_anonymous' from auth.users u where u.id = v.player_id), 'false') <> 'true' as ok
--         from public.fw_versus v cross join private.fw_vs_season s
--         where v.wins + v.losses + v.draws > 0 and s.season < private.fw_vs_season_of(now())
--           and not exists (select 1 from public.fw_vs_standing t where t.season = s.season)) x;
--   update public.fw_versus set rp = 0, wins = 0, losses = 0, draws = 0, rivals = '{}', ai = 0
--   where (rp <> 0 or wins <> 0 or losses <> 0 or draws <> 0 or ai <> 0)
--     and (select s.season from private.fw_vs_season s) < private.fw_vs_season_of(now());
--   delete from private.fw_vs_wins w where w.season < (select s.season from private.fw_vs_season s)
--     and (select s.season from private.fw_vs_season s) < private.fw_vs_season_of(now());
--   update private.fw_vs_season set prev = season, season = private.fw_vs_season_of(now()), rolled_at = now()
--   where one and season < private.fw_vs_season_of(now());
--   commit;
--
-- What the rewards change, and what a modified client can do with them:
--   - Collusion now pays in currency and in a unit, not only in a number on a board: two accounts trading wins
--     (see above) can lift one of them into a higher tier or into the top N. The brakes are the ones above plus
--     min_matches: with pair_cap matches per rival per pair_window, a farmed account needs several feeders or
--     several days, each feeder being a rate-limited anonymous sign-in. A feeder that only loses still gets the
--     Bronze reward once it has min_matches matches — kept small on purpose.
--   - Claim someone else's reward, a running season, or twice on the server: no (own row only, ended season
--     only, claimed_at set once under a row lock).
--   - The wallet and the owned units are held on the device (as purchases are today): "claimed once" stops the
--     server from answering twice with "already": false, it does not stop anyone from editing local storage and
--     giving themselves diamonds, gems or the unit. Server-held inventory is what closes that.
--   - The reward always names the unit for ranks 1..top_n. Whether the player already owns it is known only to
--     the device, so the client tells the server nothing and converts the unit into unit_gems gems on its own
--     when it is already owned; the server cannot and does not check that.
--   - Read the standings: the top 10 of any season plus one's own rows, by policy; nothing else.
--
-- Locks, in the one order every call follows (so two calls can never wait on each other in a circle):
--   0. the season lock (advisory, key = hash('fw_vs_season', 0)) — taken first by every call, holding nothing:
--      SHARED by a normal call, EXCLUSIVE by the call that does the rollover. So a rollover waits until every
--      call that is settling something has finished, and no settlement starts while a rollover runs; the
--      rollover then touches every fw_versus row with nobody else holding any of them;
--   a. versus_start only: the caller's own cap lock (advisory, key = hash(uid, 1)) — holding nothing but 0.;
--   b. the one match the call is about (row lock, waited for while holding nothing else but a.);
--   c. the caller's other open matches — only those nobody else is working on (SKIP LOCKED: never waited for;
--      a match skipped here is settled by whoever holds it, or on the next call);
--   d. a settle lock (advisory, key = hash(uid, 0)) for every participant of the matches held, in player id order;
--   e. the fw_versus rows of those players — only ever touched under d. (or by the rollover, under 0. exclusive);
--   f. versus_claim only: the caller's own fw_vs_standing row (row lock), holding nothing but 0.
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
-- After a season rollover every row is back at 0: the board lists only players with a match in the running season
-- (the client's filter is exactly this predicate), in the same order.
create index if not exists fw_versus_live_idx on public.fw_versus (rp desc, player_id) where wins > 0 or losses > 0 or draws > 0;

alter table public.fw_versus add column if not exists hidden boolean not null default false;   -- moderation: see fw_scores
-- distinct rivals of the running season (private.fw_vs_rivals); not readable by clients (the grant below lists the columns)
alter table public.fw_versus add column if not exists rivals uuid[] not null default '{}';
-- 1v1 matches against the AI counted this season (private.fw_versus_ai, first season only); private as rivals, reset by the rollover
alter table public.fw_versus add column if not exists ai integer not null default 0;
alter table public.fw_versus enable row level security;
drop policy if exists fw_versus_read on public.fw_versus;
create policy fw_versus_read on public.fw_versus for select to authenticated
using (not hidden or player_id = (select auth.uid()));
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

-- ---------- seasons: the state row and the archived standings ----------
create table if not exists private.fw_vs_season (
  one       boolean     primary key default true,           -- a single row
  season    integer     not null,                           -- YYYYMM (Asia/Seoul) of the season fw_versus describes
  prev      integer,                                        -- the season closed by the latest rollover (null: none yet)
  rolled_at timestamptz,
  constraint fw_vs_season_one_chk check (one),
  constraint fw_vs_season_id_chk  check (season between 200001 and 999912 and season % 100 between 1 and 12)
);
alter table private.fw_vs_season enable row level security;   -- no policy, as for the match bookkeeping
revoke all on table private.fw_vs_season from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_vs_season to service_role;

-- Wins per rival and season (the collusion check of the admin season view, private.fw_vs_collusion): one row per player and
-- beaten rival, written by settlement (fw_vs_tally) for every ranked win; a 2v2 win counts against both rivals, an FFA win
-- (a positive delta) against the three others. The rollover keeps the season it closes (for the review of its top 10) and
-- deletes older ones. Not readable by clients.
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

-- 1v1 matches against the AI that counted (private.fw_versus_ai, the first season only): the daily cap and the gap are read from
-- here. A player's rows older than 2 days are deleted by that player's next call.
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

create table if not exists public.fw_vs_standing (
  season     integer     not null,
  player_id  uuid        not null references auth.users (id) on delete cascade,
  rank       integer,                                       -- null: fewer than min_matches ranked matches (no reward)
  rp         integer     not null,
  tier       smallint    not null,                          -- 0..6, from rp at the rollover
  wins       integer     not null,
  losses     integer     not null,
  draws      integer     not null,
  matches    integer     not null,                          -- wins + losses + draws
  nick       text        not null,
  cc         text        not null,
  bird       text        not null,
  claimed_at timestamptz,                                   -- versus_claim
  created_at timestamptz not null default now(),            -- the rollover
  primary key (season, player_id),
  constraint fw_vs_standing_rank_chk check (rank is null or rank >= 1),
  constraint fw_vs_standing_tier_chk check (tier between 0 and 6),
  constraint fw_vs_standing_num_chk  check (rp >= 0 and wins >= 0 and losses >= 0 and draws >= 0 and matches = wins + losses + draws)
);
comment on table public.fw_vs_standing is 'Flux Wing versus ranking: final standings of ended seasons. Rows written only by private.fw_vs_tick() (rollover), claimed_at only by private.fw_versus_claim().';
-- The tier check was 0..4 while there were five tiers, and "create table if not exists" leaves a table that is already
-- there as it is: the check is replaced on every run (rows archived under five tiers hold 0..4 and pass the new one;
-- their first five floors and rewards are unchanged).
alter table public.fw_vs_standing drop constraint if exists fw_vs_standing_tier_chk;
alter table public.fw_vs_standing add constraint fw_vs_standing_tier_chk check (tier between 0 and 6);
-- the claim nonce of the first versus_claim (private, like claimed_at): a repeat answers "same" only for that nonce
alter table public.fw_vs_standing add column if not exists claim_nonce text;
-- a season's ranks in order (the past-season board: rank <= 10); unique: no shared ranks
create unique index if not exists fw_vs_standing_rank_idx on public.fw_vs_standing (season, rank) where rank is not null;
-- one player's results (versus_me, and the cascade from auth.users)
create index if not exists fw_vs_standing_player_idx on public.fw_vs_standing (player_id, season);

alter table public.fw_vs_standing enable row level security;
-- Read: the top 10 of a season and the caller's own rows, nothing else. (The 10 is what the board shows. It equals
-- top_n today, but it is a display limit: a policy cannot call the config function, which clients may not execute.)
drop policy if exists fw_vs_standing_read on public.fw_vs_standing;
create policy fw_vs_standing_read on public.fw_vs_standing for select to authenticated
using (rank <= 10 or player_id = (select auth.uid()));
-- No INSERT / UPDATE / DELETE policy on purpose (same model as fw_versus).
revoke all on table public.fw_vs_standing from public, anon, authenticated;
grant select (season, player_id, rank, rp, tier, wins, losses, draws, nick, cc, bird) on table public.fw_vs_standing to authenticated;   -- claimed_at and the timestamps stay private
grant select, insert, update, delete on table public.fw_vs_standing to service_role;   -- server-side moderation only

-- ---------- the numbers, in one place ----------
drop function if exists private.fw_vs_cfg();   -- its OUT columns changed (void_after): "create or replace" cannot do that
create or replace function private.fw_vs_cfg(
  out rp_win integer, out rp_loss integer,
  out join_window interval,      -- after the first registration nobody else can register in that match
  out min_play interval,         -- a report sooner than this after the caller registered is refused
  out settle_after interval,     -- once somebody has reported: deadline, from the first registration ...
  out report_grace interval,     -- ... but never sooner than this after the first report
  out void_after interval,       -- nobody has reported this long after the first registration: void
  out starts_per_hour integer,   -- registrations per player per rolling hour
  out pair_cap integer,          -- ranked matches (not void) against one and the same rival, in any mode ...
  out pair_window interval,      -- ... per this rolling window; further ones are refused at versus_start (played unranked)
  out keep interval,             -- finished matches older than this are deleted
  out ffa_rp integer[]           -- 4-player FFA: RP by placement, 1st..4th (ties share the average, toward zero). MIRRORS THE CLIENT'S FFA_RP
) language sql immutable set search_path = '' as $$
  select 50, 50, interval '20 seconds', interval '4 seconds', interval '5 minutes', interval '60 seconds', interval '20 minutes', 30, 5, interval '24 hours', interval '3 days', array[50, 20, -20, -50];
$$;
-- Seasons and their rewards. Arrays are per tier, Bronze first (7 tiers: bronze, silver, gold, platinum, diamond,
-- transcend, demigod). tier_rp MIRRORS THE CLIENT'S TIERS (index.html: the floors in PTIERS =
-- [0, 400, 1000, 2000, 3600, 5600, 8000]); the server's copy decides the reward, the client's only draws the badge.
create or replace function private.fw_vs_season_cfg(
  out tz text,                   -- a season is one calendar month in this time zone
  out min_matches integer,       -- settled ranked matches (wins + losses + draws) in the season to get a rank and a reward
  out tier_rp integer[],         -- lowest RP of each tier
  out tier_dia integer[],        -- tier reward: diamonds ...
  out tier_gems integer[],       -- ... and gems
  out top_n integer,             -- ranks 1..top_n also get ...
  out top_unit text,             -- ... this unit (an id in private.fw_units())
  out unit_gems integer          -- what the client grants instead when the device already owns that unit
) language sql immutable set search_path = '' as $$
  select 'Asia/Seoul', 10, array[0, 400, 1000, 2000, 3600, 5600, 8000], array[1000, 2500, 5000, 9000, 15000, 22000, 30000], array[0, 3, 8, 15, 30, 50, 80], 10, 'monarch', 30;
$$;

-- ---------- helpers (not executable by clients; they run inside the definer functions below) ----------
-- (private.fw_units(), the unit whitelist shared with submit_score, is defined just above fw_submit_score.)
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

-- same rules as fw_submit_score: control characters, zero-width / bidi marks and <> removed, whitespace collapsed, 14 chars max.
-- The character class is written with \u escapes only (no raw invisible characters in this file); at most 64 characters are looked at.
create or replace function private.fw_vs_nick(p_nick text) returns text
language sql immutable set search_path = '' as $$
  select case when char_length(n) < 2 or private.fw_nick_bad(n) then 'Pilot' else n end
  from (select btrim(left(btrim(regexp_replace(
          regexp_replace(left(coalesce(p_nick, ''), 64), '[\u0001-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF<>]', '', 'g'),
          '\s+', ' ', 'g')), 14)) as n) s;
$$;

-- Ranked play and season rewards need an account: a guest (anonymous sign-in, free and only IP-rate-limited) could otherwise feed
-- wins to another guest and farm a top-10 rank and its unit. Both the token claim and the auth.users row are read (as fw_admin_gate):
-- a guest who links a provider keeps auth.uid() and passes once the new token arrives. Guests still play versus, unranked.
create or replace function private.fw_need_account(p_uid uuid) returns void
language plpgsql stable set search_path = '' as $$
begin
  if coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true'
     or coalesce((select to_jsonb(u) ->> 'is_anonymous' from auth.users u where u.id = p_uid), 'false') = 'true' then
    raise exception 'fw_need_account: ranked play and season rewards need a signed-in account' using errcode = '42501';
  end if;
end;
$$;
-- A season rank also needs this many different rivals in ranked matches (as well as min_matches matches): a pair of accounts
-- trading wins with each other alone stays unranked. From season 202611 on: the rivals are counted from the release of this rule,
-- so the season running then (202610) could not have them all and is ranked as before.
create or replace function private.fw_vs_min_rivals(p_season integer) returns integer
language sql immutable set search_path = '' as $$
  select case when p_season >= 202611 then 3 else 0 end;
$$;
-- The first season (owner's decision 2026-10-28: at launch few players are online at once, and 10 ranked matches against
-- people were out of reach for most). It is a season id, not a date: every season up to and including first_season (202611,
-- the launch month; 202610 before it is the testers' month) is a "first season". There:
--   - a rank needs min_matches settled matches (instead of fw_vs_season_cfg().min_matches), still against fw_vs_min_rivals()
--     different rivals and on an account;
--   - a 1v1 against the AI counts (public.versus_ai): ai_pct percent of rp_win / rp_loss (50 -> +25 / -25, a draw 0, never below
--     0 RP), as a win / loss / draw of the season, but never as a rival. At most ai_per_day of them per day (Asia/Seoul), at
--     least ai_gap apart, and at most ai_per_season in the season: AI RP alone tops out at ai_per_season x 25 = 1,000 RP, the
--     Gold floor, so the AI cannot carry anyone into the top tiers or the top 10.
-- The client's rule line (vsRulesS1, every language) prints the per-match RP and ai_per_day: tests/server-integrity.test.js.
create or replace function private.fw_vs_first_cfg(
  out first_season integer, out min_matches integer, out ai_pct integer, out ai_per_day integer, out ai_per_season integer, out ai_gap interval
) language sql immutable set search_path = '' as $$
  select 202611, 3, 50, 5, 40, interval '20 seconds';
$$;
-- settled matches a rank needs in season p_season
create or replace function private.fw_vs_min_matches(p_season integer) returns integer
language sql immutable set search_path = '' as $$
  select case when p_season <= f.first_season then f.min_matches else c.min_matches end
  from private.fw_vs_first_cfg() f, private.fw_vs_season_cfg() c;
$$;
-- What versus_me tells the client about counting a match against the AI in season p_season: null outside the first season, else
-- the RP of a win (rp), the daily cap (per_day) and how many may still count today (left; 0 once today's or the season's are used)
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
-- One settled ranked win of p_uid over p_rivals, in the running season (settlement runs under the season lock, so the state row
-- is the season the match belongs to)
create or replace function private.fw_vs_tally(p_uid uuid, p_rivals uuid[]) returns void
language sql set search_path = '' as $$
  insert into private.fw_vs_wins as w (season, player_id, rival_id, n)
  select s.season, p_uid, x.id, 1 from private.fw_vs_season s, (select distinct r as id from unnest(p_rivals) r) x
  where x.id is not null and x.id <> p_uid
  on conflict (season, player_id, rival_id) do update set n = w.n + 1;
$$;
-- Collusion check (owner's decision 2026-10-28, for the review of the top 10 before a rollover): a player is flagged when they
-- have at least min_wins ranked wins in the season and at least `share` of them came from their max_foes most-beaten rivals,
-- i.e. the wins come mostly from fewer than 3 different rivals. A flag is a reason to look, not a verdict: at launch, with few
-- players online, honest players meet the same rivals too. The admin hides a colluder (admin_set_hidden) before the rollover.
create or replace function private.fw_vs_collude_cfg(out min_wins integer, out max_foes integer, out share numeric)
language sql immutable set search_path = '' as $$
  select 5, 2, 0.66;
$$;
-- beat: ranked wins over people in the season (a 2v2 win counts once per beaten rival), foes: different rivals beaten,
-- top2: the share of the max_foes most-beaten rivals (null without a win), flag: see fw_vs_collude_cfg
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
-- The rivals of the running season, kept on the player's fw_versus row (fw_vs_part rows are deleted after "keep", 3 days, so
-- they cannot be counted at the rollover): the distinct ids met in settled ranked matches, at most 16 (only "at least
-- fw_vs_min_rivals()" is ever asked, so a full list stops growing). Emptied by the rollover with rp / wins / losses / draws.
create or replace function private.fw_vs_rivals(p_have uuid[], p_new uuid[]) returns uuid[]
language sql immutable set search_path = '' as $$
  select array(select distinct x from unnest(coalesce(p_have, '{}') || coalesce(p_new, '{}')) x where x is not null order by x limit 16);
$$;
-- RP for one ranked 1v1 / 2v2 result (owner's decision 2026-10-27; MIRRORS THE CLIENT'S rpDelta, index.html rp block): Elo by the two sides'
-- average RP, scale 1000 RP: 50 at equal RP, more for beating a stronger side and less for losing to it, clamped to 20..80. p_rep: earlier
-- ranked matches settled against the same rival within the pair window: the result counts x1, x0.5, then x0.25. A draw is 0. FFA keeps ffa_rp.
create or replace function private.fw_vs_delta(p_me integer, p_opp integer, p_out text, p_rep integer) returns integer
language sql immutable set search_path = '' as $$
  select case when p_out not in ('win', 'lose') then 0 else
    (case when p_out = 'win' then 1 else -1 end)
    * round(least(80, greatest(20, 100 * (case when p_out = 'win' then 1 - e else e end)))
            * (case least(2, greatest(0, coalesce(p_rep, 0))) when 0 then 1 when 1 then .5 else .25 end))::integer end
  from (select 1 / (1 + power(10::numeric, (p_opp - p_me) / 1000.0)) as e) x;
$$;

-- Names stored before the filter existed are NOT renamed by this file: a rename cannot be undone, so it is a by-hand step.
-- 1. Read what would change (a word list also catches innocent names):
--      select 'scores' as t, nick, count(*) from public.fw_scores      where private.fw_nick_bad(nick) group by nick
--      union all select 'versus',   nick, count(*) from public.fw_versus      where private.fw_nick_bad(nick) group by nick
--      union all select 'standing', nick, count(*) from public.fw_vs_standing where private.fw_nick_bad(nick) group by nick
--      union all select 'match',    nick, count(*) from private.fw_vs_part    where private.fw_nick_bad(nick) group by nick
--      order by 3 desc;
-- 2. If the list holds only names that should go:
--      update public.fw_scores      set nick = 'Pilot' where private.fw_nick_bad(nick);
--      update public.fw_versus      set nick = 'Pilot' where private.fw_nick_bad(nick);
--      update public.fw_vs_standing set nick = 'Pilot' where private.fw_nick_bad(nick);
--      update private.fw_vs_part    set nick = 'Pilot' where private.fw_nick_bad(nick);

-- Season id (YYYYMM in the season time zone) of an instant, and the instant a season ends (= the next one starts).
-- The month is added to the local wall-clock time, not to the timestamptz: "+ 1 month" on a timestamptz is done in
-- the session's time zone and would land a day off.
create or replace function private.fw_vs_season_of(p_at timestamptz) returns integer
language sql stable set search_path = '' as $$
  select (extract(year from l.t) * 100 + extract(month from l.t))::integer
  from (select p_at at time zone (select c.tz from private.fw_vs_season_cfg() c) as t) l;
$$;
create or replace function private.fw_vs_season_end(p_season integer) returns timestamptz
language sql stable set search_path = '' as $$
  select (make_timestamp(p_season / 100, p_season % 100, 1, 0, 0, 0) + interval '1 month') at time zone (select c.tz from private.fw_vs_season_cfg() c);
$$;
create or replace function private.fw_vs_tier(p_rp integer) returns integer
language sql immutable set search_path = '' as $$
  select coalesce(max(i), 1) - 1 from private.fw_vs_season_cfg() c, generate_subscripts(c.tier_rp, 1) i where p_rp >= c.tier_rp[i];
$$;
-- The reward of an archived row: null without a rank.
create or replace function private.fw_vs_reward(p_rank integer, p_tier integer) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_rank is null then null else jsonb_build_object(
           'dia', c.tier_dia[p_tier + 1], 'gems', c.tier_gems[p_tier + 1],
           'unit', case when p_rank <= c.top_n then c.top_unit end, 'unit_gems', c.unit_gems) end
  from private.fw_vs_season_cfg() c;
$$;
-- One archived result as the client is told it (versus_me, versus_claim).
create or replace function private.fw_vs_result(p_uid uuid, p_season integer) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('season', t.season, 'rank', t.rank, 'tier', t.tier, 'rp', t.rp, 'wins', t.wins, 'losses', t.losses,
           'draws', t.draws, 'matches', t.matches, 'reward', private.fw_vs_reward(t.rank, t.tier))
  from public.fw_vs_standing t where t.season = p_season and t.player_id = p_uid;
$$;

-- The season gate: what every entry point does right after checking its arguments, before it touches any row. Takes
-- the season lock (lock order 0) and, when the month has changed, does the rollover described in the section header.
-- Returns the id of the running season.
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
-- The first season is the month in which this file is first applied.
insert into private.fw_vs_season (season) values (private.fw_vs_season_of(now())) on conflict (one) do nothing;

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

-- Lazy settlement for one player: every open match they are in (oldest first), then the clean-up of their old ones.
-- Lock order c-d-e of the section header: the open matches are taken without waiting (a match another call is working on is left
-- to that call), then the settle locks of all their participants in player id order, and only then is anything settled. The
-- caller's own match (versus_start / versus_report) is already locked when this runs and is simply part of the set.
create or replace function private.fw_vs_sweep(p_uid uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_ids text[];
  v_id  text;
  v_pl  uuid;
begin
  select coalesce(array_agg(x.id), '{}') into v_ids
  from (select m.id from private.fw_vs_match m
        where m.status = 'open'
          and exists (select 1 from private.fw_vs_part p where p.match_id = m.id and p.player_id = p_uid)
        order by m.id
        for update of m skip locked) x;
  for v_pl in select distinct p.player_id from private.fw_vs_part p where p.match_id = any (v_ids) order by p.player_id loop
    perform pg_advisory_xact_lock(hashtextextended(v_pl::text, 0));
  end loop;
  for v_id in select m.id from private.fw_vs_match m where m.id = any (v_ids) order by m.started_at, m.id loop
    perform private.fw_vs_settle(v_id);
  end loop;
  delete from private.fw_vs_match d
  where d.id in (select m.id from private.fw_vs_match m
                 where m.status <> 'open' and m.started_at < now() - (select keep from private.fw_vs_cfg())
                   and exists (select 1 from private.fw_vs_part p where p.match_id = m.id and p.player_id = p_uid)
                 for update of m skip locked);
end;
$$;

-- What the client is told about itself and about one of its matches. "ranked": a settled match in the running season
-- (the row itself outlives the season reset).
create or replace function private.fw_vs_row(p_uid uuid) returns jsonb
language sql set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('rp', v.rp, 'wins', v.wins, 'losses', v.losses, 'draws', v.draws, 'ranked', v.wins + v.losses + v.draws > 0)
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

-- ---------- the four entry points ----------
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
  perform private.fw_need_account(v_uid);   -- ranked play is for accounts: a guest plays versus unranked
  -- Everything that depends only on the arguments and the caller's id is checked BEFORE the season gate: these checks
  -- read no table and take no lock, so a call refused here can never do (and then roll back) a rollover.
  if p_match is null or char_length(p_match) > 160   -- length first: nothing longer reaches the regular expressions
     or p_mode is null or p_mode not in ('1v1', '2v2', 'ffa') or p_team is null or p_team not in (0, 1, 2, 3)
     or (p_mode <> 'ffa' and p_team not in (0, 1))
     or p_bird is null or not (p_bird = any (private.fw_units()))
     or char_length(coalesce(p_nick, '')) > 200 or char_length(coalesce(p_cc, '')) > 8 then
    raise exception 'fw_bad_input: unknown mode, team or unit, or a field too long' using errcode = '22023';
  end if;
  if p_mode = 'ffa' then
    v_t0 := private.fw_vs_roster_ffa(p_match);   -- all four seats, sorted; the seat index is the "team"
    v_team := array_position(v_t0, v_uid) - 1;
  else
    select t0, t1 into v_t0, v_t1 from private.fw_vs_roster(p_match);
    if cardinality(v_t0) <> (case p_mode when '2v2' then 2 else 1 end) then
      raise exception 'fw_bad_input: roster does not fit the mode' using errcode = '22023';
    end if;
    v_team := case when v_uid = any (v_t0) then 0 when v_uid = any (v_t1) then 1 end;
  end if;
  if v_team is null then
    raise exception 'fw_vs_not_in_match: this match is between other players' using errcode = '42501';
  end if;
  if v_team <> p_team then
    raise exception 'fw_bad_input: wrong team for this match id' using errcode = '22023';
  end if;

  -- What follows needs the database (the match's mode and join window, the caps), so it can only come after the gate:
  -- a well-formed call that is refused below may still have paid for a rollover that its error rolls back. Accepted.
  perform private.fw_vs_tick();   -- lock order 0: the season lock (and the rollover, when the month has changed)
  -- the caps below are read-then-insert: one start at a time per player, or parallel calls would each see the count before the others' rows
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 1));   -- lock order a: after the season lock, as before
  select * into c from private.fw_vs_cfg();

  -- the match: created by its first registration. Its row is locked before anything else of the ranking (lock order b);
  -- a call refused further down raises, which takes the row back out.
  insert into private.fw_vs_match (id, mode) values (p_match, p_mode) on conflict (id) do nothing;
  select * into strict v_m from private.fw_vs_match where id = p_match for update;

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
  -- the per-rival cap, every mode: a 1v1/2v2 rival is anyone on the other team, an FFA rival is every other seat. The
  -- (pair_cap + 1)th ranked match against the same rival inside pair_window is refused here, so the client plays it
  -- unranked and says so (vsCap). Two accounts trading wins therefore move at most pair_cap * rp_win RP a day.
  foreach v_rival in array (case when p_mode = 'ffa' then array_remove(v_t0, v_uid) when v_team = 0 then v_t1 else v_t0 end) loop
    -- my registrations against this rival in any mode, whether or not the rival has registered yet (the roster is in the id:
    -- an FFA id holds all four seats in its 2nd part, a team id holds team 0 in its 2nd part and team 1 in its 3rd), so the
    -- answer does not depend on which of the two got in first
    select count(*) into v_cnt
    from private.fw_vs_part a
    join private.fw_vs_match m on m.id = a.match_id
    where a.player_id = v_uid and a.joined_at > v_now - c.pair_window and m.status <> 'void'
      and v_rival::text = any (string_to_array(split_part(m.id, '.', case when m.mode = 'ffa' then 2 when a.team = 0 then 3 else 2 end), '+'));
    if v_cnt >= c.pair_cap then
      raise exception 'fw_vs_pair_cap: ranked matches against this rival are used up for now' using errcode = 'P0001';
    end if;
  end loop;

  -- joinable for a short window only
  if v_m.mode <> p_mode then
    raise exception 'fw_bad_input: this match was started in another mode' using errcode = '22023';
  end if;
  if v_m.status <> 'open' or v_now > v_m.started_at + c.join_window then
    raise exception 'fw_vs_closed: too late to join this match' using errcode = 'P0001';
  end if;
  begin
    insert into private.fw_vs_part (match_id, player_id, team, nick, cc, bird)
    values (p_match, v_uid, v_team, private.fw_vs_nick(p_nick), case when coalesce(p_cc, '') ~ '^[A-Za-z]{2}$' then upper(p_cc) else '' end, p_bird);
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
  perform private.fw_need_account(v_uid);   -- ranked play is for accounts: a guest plays versus unranked
  if p_match is null or char_length(p_match) > 160 or p_result is null
     or not (p_result in ('win', 'lose', 'draw') or private.fw_vs_ffa_vec_ok(p_result)) then
    raise exception 'fw_bad_input: unknown result' using errcode = '22023';
  end if;
  select * into c from private.fw_vs_cfg();
  perform private.fw_vs_tick();   -- lock order 0. A match started in the season that has just ended settles into the new one.
  perform 1 from private.fw_vs_match where id = p_match for update;   -- lock order b: this match first, then the sweep
  perform private.fw_vs_sweep(v_uid);   -- a report that comes after the deadline finds the match already settled

  select * into v_m from private.fw_vs_match where id = p_match;      -- as the sweep left it
  if found then
    select * into v_p from private.fw_vs_part p where p.match_id = p_match and p.player_id = v_uid;
  end if;
  if v_p.player_id is null then
    raise exception 'fw_vs_not_started: no such match for this player' using errcode = 'P0001';
  end if;
  if v_p.result is not null then
    raise exception 'fw_vs_reported: result already reported' using errcode = 'P0001';
  end if;
  if (v_m.mode = 'ffa') <> (p_result ~ '^[1-4]') then
    raise exception 'fw_bad_input: result does not fit the mode' using errcode = '22023';
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

-- The caller's result and reward for an ended season. The first call marks it claimed and keeps its nonce (a random id the device
-- made for this claim and keeps until its grant is saved); any later one returns the same answer with "already": true and
-- "same": whether it carries that nonce. So the device whose answer was lost grants on its retry, and a second device (another
-- nonce) never does. p_nonce is optional for the installed 1.0.0 builds (they call versus_claim(p_season) and get "same": false
-- on a repeat). The old one-argument function is dropped first: two versions would make a one-argument call ambiguous.
drop function if exists public.versus_claim(integer);
drop function if exists private.fw_versus_claim(integer);
create or replace function private.fw_versus_claim(p_season integer, p_nonce text default null) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_season integer;
  v_rank   integer;
  v_at     timestamptz;
  v_nonce  text;
begin
  if v_uid is null then
    raise exception 'fw_auth: sign-in required' using errcode = '28000';
  end if;
  perform private.fw_need_account(v_uid);   -- ranked play is for accounts: a guest plays versus unranked
  if p_season is null or p_season < 200001 or p_season > 999912 or p_nonce !~ '^[0-9a-f]{32}$' then   -- before the season gate: a call refused here does no rollover
    raise exception 'fw_bad_input: bad season or nonce' using errcode = '22023';
  end if;
  -- The checks below need the database (which season is running, the caller's archived row) and so come after the gate:
  -- a well-formed claim that is refused may still have paid for a rollover that its error rolls back. Accepted.
  v_season := private.fw_vs_tick();   -- lock order 0
  if p_season >= v_season then
    raise exception 'fw_vs_season_open: this season has not ended' using errcode = 'P0001';
  end if;
  select t.rank, t.claimed_at, t.claim_nonce into v_rank, v_at, v_nonce from public.fw_vs_standing t
  where t.season = p_season and t.player_id = v_uid for update;   -- lock order f: a double tap waits here and then sees claimed_at
  if not found then
    raise exception 'fw_vs_no_result: no result for this player in that season' using errcode = 'P0001';
  end if;
  if v_rank is null then
    raise exception 'fw_vs_unranked: too few ranked matches in that season, no reward' using errcode = 'P0001';
  end if;
  if v_at is null then
    update public.fw_vs_standing set claimed_at = now(), claim_nonce = p_nonce where season = p_season and player_id = v_uid;
  end if;
  return private.fw_vs_result(v_uid, p_season) || jsonb_build_object('already', v_at is not null,
    'same', v_at is null or (p_nonce is not null and v_nonce = p_nonce));
end;
$$;

-- A finished 1v1 against the AI, in the first season only (private.fw_vs_first_cfg). The device reports its own result: nobody
-- referees an AI match, so a modified client can always report a win. The caps bound what that buys (ai_per_day, ai_gap,
-- ai_per_season: at most 1,000 RP a season), and the AI is never a rival, so it never helps toward the fw_vs_min_rivals() a
-- rank needs. Answers {counted: false, why: season | cap | soon | full} without raising (the client shows the match as
-- practice), or {counted: true, delta, left, me}. A win / loss / draw of the season, as a ranked one.
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
create or replace function public.versus_claim(p_season integer, p_nonce text default null) returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.fw_versus_claim(p_season, p_nonce);
$$;

revoke all on function private.fw_vs_cfg()                  from public, anon, authenticated;
revoke all on function private.fw_vs_season_cfg()           from public, anon, authenticated;
revoke all on function private.fw_vs_season_of(timestamptz) from public, anon, authenticated;
revoke all on function private.fw_vs_season_end(integer)    from public, anon, authenticated;
revoke all on function private.fw_vs_tier(integer)          from public, anon, authenticated;
revoke all on function private.fw_vs_reward(integer, integer) from public, anon, authenticated;
revoke all on function private.fw_vs_result(uuid, integer)  from public, anon, authenticated;
revoke all on function private.fw_vs_tick()                 from public, anon, authenticated;
revoke all on function private.fw_vs_roster(text)           from public, anon, authenticated;
revoke all on function private.fw_vs_nick(text)             from public, anon, authenticated;
revoke all on function private.fw_need_account(uuid)        from public, anon, authenticated;
revoke all on function private.fw_vs_min_rivals(integer)    from public, anon, authenticated;
revoke all on function private.fw_vs_first_cfg()            from public, anon, authenticated;
revoke all on function private.fw_vs_min_matches(integer)   from public, anon, authenticated;
revoke all on function private.fw_vs_ai_state(uuid, integer) from public, anon, authenticated;
revoke all on function private.fw_vs_tally(uuid, uuid[])    from public, anon, authenticated;
revoke all on function private.fw_vs_collude_cfg()          from public, anon, authenticated;
revoke all on function private.fw_vs_collusion(integer, uuid) from public, anon, authenticated;
revoke all on function private.fw_vs_rivals(uuid[], uuid[]) from public, anon, authenticated;
revoke all on function private.fw_vs_delta(integer, integer, text, integer) from public, anon, authenticated;
revoke all on function private.fw_vs_settle(text)           from public, anon, authenticated;
revoke all on function private.fw_vs_sweep(uuid)            from public, anon, authenticated;
revoke all on function private.fw_vs_row(uuid)              from public, anon, authenticated;
revoke all on function private.fw_vs_state(uuid, text)      from public, anon, authenticated;
revoke all on function private.fw_versus_start(text, text, integer, text, text, text)  from public, anon, authenticated;
revoke all on function private.fw_versus_report(text, text) from public, anon, authenticated;
revoke all on function private.fw_versus_me()               from public, anon, authenticated;
revoke all on function private.fw_versus_claim(integer, text) from public, anon, authenticated;
revoke all on function public.versus_start(text, text, integer, text, text, text)      from public, anon, authenticated;
revoke all on function public.versus_report(text, text)     from public, anon, authenticated;
revoke all on function public.versus_me()                   from public, anon, authenticated;
revoke all on function public.versus_claim(integer, text)   from public, anon, authenticated;
revoke all on function private.fw_versus_ai(text, text, text, text) from public, anon, authenticated;
revoke all on function public.versus_ai(text, text, text, text)      from public, anon, authenticated;
grant execute on function private.fw_versus_start(text, text, integer, text, text, text) to authenticated, service_role;
grant execute on function private.fw_versus_report(text, text) to authenticated, service_role;
grant execute on function private.fw_versus_me()               to authenticated, service_role;
grant execute on function private.fw_versus_claim(integer, text) to authenticated, service_role;
grant execute on function public.versus_start(text, text, integer, text, text, text)     to authenticated, service_role;
grant execute on function public.versus_report(text, text)     to authenticated, service_role;
grant execute on function public.versus_me()                   to authenticated, service_role;
grant execute on function public.versus_claim(integer, text)   to authenticated, service_role;
grant execute on function private.fw_versus_ai(text, text, text, text) to authenticated, service_role;
grant execute on function public.versus_ai(text, text, text, text)      to authenticated, service_role;

-- ---------- name change: set_nick(name) ----------
-- The name form calls this instead of a score submit (which cost a rate-limited submit, needed a score row and could be
-- refused for an unrelated reason). The name is cleaned and filtered exactly as every other stored name (private.fw_vs_nick:
-- control, zero-width and bidi characters and <> removed, 14 characters, a refused word becomes Pilot) and written to the
-- caller's leaderboard row and versus row, where they exist. fw_vs_standing holds ended seasons only: an archived name stays
-- as it was at the rollover. Returns the name stored, which the device keeps. Its own light limit: 2 s apart, 20 a UTC day.
create table if not exists private.fw_nick_set (
  player_id  uuid        primary key references auth.users (id) on delete cascade,
  set_day    date        not null,
  set_count  integer     not null default 0,
  last_at    timestamptz not null default now()
);
alter table private.fw_nick_set enable row level security;   -- no policy: only private.fw_set_nick writes it
revoke all on table private.fw_nick_set from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_nick_set to service_role;

create or replace function private.fw_set_nick(p_nick text) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_min_gap constant interval := interval '2 seconds';
  c_day_cap constant integer  := 20;
  v_uid   uuid := (select auth.uid());
  v_today date := (now() at time zone 'utc')::date;
  v_row   private.fw_nick_set%rowtype;
  v_nick  text;
begin
  if v_uid is null then
    raise exception 'fw_auth: sign-in required' using errcode = '28000';
  end if;
  if p_nick is null or char_length(p_nick) > 200 then
    raise exception 'fw_bad_input: no name, or a name too long' using errcode = '22023';
  end if;
  begin
    insert into private.fw_nick_set (player_id, set_day, last_at) values (v_uid, v_today, now() - interval '1 day') on conflict (player_id) do nothing;
  exception when foreign_key_violation then
    raise exception 'fw_auth: unknown player' using errcode = '28000';   -- token of a deleted user: the client signs in again
  end;
  select * into strict v_row from private.fw_nick_set where player_id = v_uid for update;
  if v_row.set_day is distinct from v_today then v_row.set_day := v_today; v_row.set_count := 0; end if;
  if now() - v_row.last_at < c_min_gap or v_row.set_count >= c_day_cap then
    raise exception 'fw_rate_limited: too many name changes, try later' using errcode = 'P0001';
  end if;
  update private.fw_nick_set set set_day = v_row.set_day, set_count = v_row.set_count + 1, last_at = now() where player_id = v_uid;
  v_nick := private.fw_vs_nick(p_nick);
  update public.fw_scores set nick = v_nick, updated_at = now() where player_id = v_uid;
  update public.fw_versus set nick = v_nick where player_id = v_uid;
  return v_nick;
end;
$$;
create or replace function public.set_nick(p_nick text) returns text
language sql
security invoker
set search_path = ''
as $$
  select private.fw_set_nick(p_nick);
$$;
revoke all on function private.fw_set_nick(text) from public, anon, authenticated;
revoke all on function public.set_nick(text)     from public, anon, authenticated;
grant execute on function private.fw_set_nick(text) to authenticated, service_role;
grant execute on function public.set_nick(text)     to authenticated, service_role;

-- ---------- Realtime: versus rooms are PRIVATE channels ----------
-- The game uses Broadcast + Presence only (no table changes), on topics
--   fw-v<N>-fw-lobby            quick-match lobby (1v1)
--   fw-v<N>-m-<peer>-<peer>     quick-match room (1v1)
--   fw-v<N>-c-<4 digits>        code room (1000-4999: 1v1, 5000-9999: 2v2)
--   fw-v<N>-m-lobby-2v2         quick-match lobby (2v2)   } both are of the m-<x>-<y> shape:
--   fw-v<N>-m-<peer>-<seed>     quick-match room (2v2)    } the policies below did not have to change
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


-- =====================================================================================================
-- CLOUD SAVE — one row per signed-in (NOT anonymous) player: the device save index.html syncs (cloud block, FS_KEYS).
-- The client merges (fsMerge); the server only stores it, with a revision number for compare-and-set:
--   save_get()             {rev: 0, data: null} when there is no row, else {rev, data, updated_at}
--   save_put(p_rev, data)  writes only when p_rev is the stored rev (0 = no row yet): {ok: true, rev: rev + 1};
--                          otherwise writes nothing and answers {ok: false, rev, data} so the client merges and retries.
-- No clocks are compared anywhere: the order of writes is the rev. The economy is not checked here (as before: the
-- wallet is the device's); what is checked is the caller (an account, not an anonymous player), the shape (a JSON
-- object with "v": 1) and the size. Deleting the auth user deletes the row (on delete cascade).
-- =====================================================================================================
create table if not exists public.fw_saves (
  player_id  uuid        primary key references auth.users (id) on delete cascade,
  rev        bigint      not null default 1,
  data       jsonb       not null,
  put_day    date,
  put_count  integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fw_saves_rev_chk  check (rev >= 1),
  constraint fw_saves_data_chk check (jsonb_typeof(data) = 'object'),
  constraint fw_saves_size_chk check (octet_length(data::text) <= 16384)
);
comment on table public.fw_saves is 'Flux Wing cloud save: one row per account. Written only by private.fw_save_put().';
alter table public.fw_saves enable row level security;
-- No policy on purpose: clients reach their row only through save_get / save_put.
revoke all on table public.fw_saves from public, anon, authenticated;
grant select, insert, update, delete on table public.fw_saves to service_role;

-- The caller's id, for accounts only. Reads auth.users (not the JWT claim), so a token issued before the
-- anonymous player was upgraded does not lock the new account out, and an anonymous player never gets a row.
create or replace function private.fw_save_me() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_anon boolean;
begin
  if v_uid is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  select u.is_anonymous into v_anon from auth.users u where u.id = v_uid;
  if not found then raise exception 'fw_auth: unknown player' using errcode = '28000'; end if;
  if v_anon then raise exception 'fw_save_anon: an account is required' using errcode = '42501'; end if;
  return v_uid;
end $$;

create or replace function private.fw_save_get() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := private.fw_save_me(); v_row public.fw_saves%rowtype;
begin
  select * into v_row from public.fw_saves where player_id = v_uid;
  if not found then return jsonb_build_object('rev', 0, 'data', null); end if;
  return jsonb_build_object('rev', v_row.rev, 'data', v_row.data, 'updated_at', v_row.updated_at);
end $$;

create or replace function private.fw_save_put(p_rev bigint, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c_max_bytes constant integer := 16384;   -- FS_CFG.maxBytes in index.html (tests/cloud-sql.test.js keeps the two equal)
  c_day_cap   constant integer := 1500;    -- accepted writes per account per UTC day
  -- Plausibility caps (FS_CFG.caps / FS_CFG.neverOwned in index.html; tests/cloud-sql.test.js keeps them equal).
  -- An expert earns ~2,115 coins a run, so c_cap_coins is 20,000+ runs; nobody reaches these by playing.
  c_cap_coins constant bigint := 50000000;
  c_cap_dia   constant bigint := 10000000;
  c_cap_gems  constant bigint := 100000;
  c_cap_lvl   constant bigint := 100000;   -- a skilled player gains ~1 level a run
  c_never_owned constant text[] := array['aurora','tempest','pleiad'];   -- units with no earning path (monarch is a season grant)
  v_uid   uuid := private.fw_save_me();
  v_today date := (now() at time zone 'utc')::date;
  v_row   public.fw_saves%rowtype;
  v_rev   bigint;
begin
  if p_rev is null or p_rev < 0 or p_data is null or jsonb_typeof(p_data) <> 'object' or (p_data ->> 'v') is distinct from '1' then
    raise exception 'fw_bad_input: save must be a v1 object' using errcode = '22023';
  end if;
  if octet_length(p_data::text) > c_max_bytes then
    raise exception 'fw_bad_input: save too large' using errcode = '22023';
  end if;
  if (jsonb_typeof(p_data -> 'w' -> 'coins') = 'number' and (p_data -> 'w' ->> 'coins')::numeric > c_cap_coins)
     or (jsonb_typeof(p_data -> 'w' -> 'dia') = 'number' and (p_data -> 'w' ->> 'dia')::numeric > c_cap_dia)
     or (jsonb_typeof(p_data -> 'w' -> 'gems') = 'number' and (p_data -> 'w' ->> 'gems')::numeric > c_cap_gems)
     or (jsonb_typeof(p_data -> 'w' -> 'lvl') = 'number' and (p_data -> 'w' ->> 'lvl')::numeric > c_cap_lvl) then
    raise exception 'fw_bad_input: save out of range' using errcode = '22023';
  end if;
  if jsonb_typeof(p_data -> 'owned') = 'array' and exists (
       select 1 from jsonb_array_elements_text(p_data -> 'owned') o(id) where o.id = any (c_never_owned)) then
    raise exception 'fw_bad_input: save owns a unit nobody can earn' using errcode = '22023';
  end if;
  select * into v_row from public.fw_saves where player_id = v_uid for update;
  if not found then
    if p_rev <> 0 then return jsonb_build_object('ok', false, 'rev', 0, 'data', null); end if;
    insert into public.fw_saves (player_id, rev, data, put_day, put_count) values (v_uid, 1, p_data, v_today, 1)
    on conflict (player_id) do nothing returning rev into v_rev;
    if v_rev is null then   -- another call created it first
      select * into v_row from public.fw_saves where player_id = v_uid;
      return jsonb_build_object('ok', false, 'rev', v_row.rev, 'data', v_row.data);
    end if;
    return jsonb_build_object('ok', true, 'rev', v_rev);
  end if;
  if v_row.rev <> p_rev then return jsonb_build_object('ok', false, 'rev', v_row.rev, 'data', v_row.data); end if;
  if v_row.put_day is not distinct from v_today and v_row.put_count >= c_day_cap then
    raise exception 'fw_rate_limited: daily save limit reached' using errcode = 'P0001';
  end if;
  update public.fw_saves set rev = rev + 1, data = p_data, updated_at = now(),
    put_day = v_today, put_count = case when put_day is not distinct from v_today then put_count + 1 else 1 end
  where player_id = v_uid returning rev into v_rev;
  return jsonb_build_object('ok', true, 'rev', v_rev);
end $$;

create or replace function public.save_get() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_save_get(); $$;
create or replace function public.save_put(p_rev bigint, p_data jsonb) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_save_put(p_rev, p_data); $$;

revoke all on function private.fw_save_me()                from public, anon, authenticated;
revoke all on function private.fw_save_get()               from public, anon, authenticated;
revoke all on function private.fw_save_put(bigint, jsonb)  from public, anon, authenticated;
revoke all on function public.save_get()                   from public, anon, authenticated;
revoke all on function public.save_put(bigint, jsonb)      from public, anon, authenticated;
grant execute on function private.fw_save_get()               to authenticated, service_role;
grant execute on function private.fw_save_put(bigint, jsonb)  to authenticated, service_role;
grant execute on function public.save_get()                   to authenticated, service_role;
grant execute on function public.save_put(bigint, jsonb)      to authenticated, service_role;


-- ---------- scheduled season rollover (pg_cron) ----------
-- Dashboard: Database > Extensions > pg_cron ON (it is on for the production project since 2026-10-15). Without the
-- extension this block does nothing and the rollover stays with the first versus call of a month, as before.
-- The job runs as the database owner, so the 8 s API timeout does not apply; fw_vs_tick() is a no-op on every other
-- day (one row read under a shared lock). pg_cron reads schedules in UTC: 15:00 UTC is 00:00 in Asia/Seoul.
-- cron.schedule() with a job name replaces the job of that name, so re-running this file keeps exactly one job.
-- Check:   select jobname, schedule, command, active from cron.job;
--          select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fw_vs_rollover', '0 15 * * *', 'set statement_timeout = 0; select private.fw_vs_tick();');
    perform cron.schedule('fw_social_feed_gc', '30 15 * * *',
      'set statement_timeout = 0; delete from private.fw_social_feed where at < now() - interval ''3 days'';');
    perform cron.schedule('fw_client_errors_gc', '40 15 * * *',
      'set statement_timeout = 0; delete from private.fw_client_errors where at < now() - interval ''30 days'';');
  end if;
end
$do$;

-- =====================================================================================================
-- SOCIAL — FRIENDS (plan-social.md P1)
-- Mutual friendships made with a server-issued 8-char Crockford-base32 friend code (or a uuid picked from
-- a leaderboard / versus screen). Everything a client writes goes through the definer RPCs below; the only
-- readable table is public.fw_friends, and RLS lets a player see no rows but their own.
create table if not exists private.fw_social (
  player_id uuid        primary key references auth.users (id) on delete cascade,
  code      text        not null unique,
  last_seen timestamptz,
  hello_at  timestamptz,          -- last time friends were told "online" (15 min batching, P2)
  req_day   date,                 -- friend requests sent today (rate limit)
  req_count integer     not null default 0,
  created_at timestamptz not null default now(),
  constraint fw_social_code_chk check (code ~ '^[0-9A-HJKMNP-TV-Z]{8}$')
);
alter table private.fw_social enable row level security;   -- no policy: not exposed
revoke all on table private.fw_social from public, anon, authenticated;

create table if not exists public.fw_friends (
  a     uuid not null references auth.users (id) on delete cascade,
  b     uuid not null references auth.users (id) on delete cascade,
  since timestamptz not null default now(),
  primary key (a, b),
  constraint fw_friends_ord_chk check (a < b)
);
create index if not exists fw_friends_b on public.fw_friends (b);
alter table public.fw_friends enable row level security;
drop policy if exists fw_friends_read on public.fw_friends;
create policy fw_friends_read on public.fw_friends for select to authenticated
using ((select auth.uid()) in (a, b));
revoke all on table public.fw_friends from public, anon, authenticated;
grant select on table public.fw_friends to authenticated;
grant select, insert, update, delete on table public.fw_friends to service_role;

create table if not exists private.fw_friend_req (
  from_id uuid not null references auth.users (id) on delete cascade,
  to_id   uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now(),
  primary key (from_id, to_id),
  constraint fw_friend_req_self_chk check (from_id <> to_id)
);
create index if not exists fw_friend_req_to on private.fw_friend_req (to_id);
alter table private.fw_friend_req enable row level security;
revoke all on table private.fw_friend_req from public, anon, authenticated;

-- the caller's social row, created (with a fresh code) on first touch. Locked FOR UPDATE when p_lock.
create or replace function private.fw_social_row(p_uid uuid, p_lock boolean default false) returns private.fw_social
language plpgsql security definer set search_path = '' as $$
declare
  c_alph constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_row  private.fw_social%rowtype;
  v_code text;
begin
  if p_lock then
    select * into v_row from private.fw_social where player_id = p_uid for update;
  else
    select * into v_row from private.fw_social where player_id = p_uid;
  end if;
  if found then return v_row; end if;
  for i in 1..20 loop
    v_code := '';
    for j in 1..8 loop v_code := v_code || substr(c_alph, 1 + floor(random() * 32)::integer, 1); end loop;
    begin
      insert into private.fw_social (player_id, code) values (p_uid, v_code)
      on conflict (player_id) do nothing returning * into v_row;             -- a concurrent first touch: take that row
      if v_row.player_id is null then
        if p_lock then select * into strict v_row from private.fw_social where player_id = p_uid for update;
        else select * into strict v_row from private.fw_social where player_id = p_uid; end if;
      end if;
      return v_row;
    exception
      when unique_violation then null;     -- code collision: roll again
      when foreign_key_violation then raise exception 'fw_auth: unknown player' using errcode = '28000';
    end;
  end loop;
  raise exception 'fw_social_code: could not issue a code' using errcode = 'P0001';
end;
$$;

-- caps and limits, in one place
create or replace function private.fw_social_cfg(
  out friend_cap integer, out pending_cap integer, out req_per_day integer,
  out online_window interval, out hello_gap interval, out best_gap interval, out feed_keep interval
) language sql immutable set search_path = '' as $$
  select 100, 30, 200, interval '2 minutes', interval '15 minutes', interval '10 minutes', interval '3 days';
$$;

create or replace function private.fw_friend_request(p_code text, p_uid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c    record := private.fw_social_cfg();
  v_me uuid   := (select auth.uid());
  v_to uuid;
  v_today date := (now() at time zone 'utc')::date;
  v_row private.fw_social%rowtype;
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_me::text, 2));   -- serialise this caller's friend writes
  v_row := private.fw_social_row(v_me, true);
  -- rate limit per UTC day
  if v_row.req_day is distinct from v_today then v_row.req_day := v_today; v_row.req_count := 0; end if;
  if v_row.req_count >= c.req_per_day then
    raise exception 'fw_rate_limited: too many friend requests today' using errcode = 'P0001';
  end if;
  update private.fw_social set req_day = v_row.req_day, req_count = v_row.req_count + 1 where player_id = v_me;
  -- resolve the target
  if p_code is not null then
    select s.player_id into v_to from private.fw_social s where s.code = upper(p_code);
    -- unknown code: answer instead of raising, so the spent request above COMMITS — probing codes costs quota
    if v_to is null then return jsonb_build_object('status', 'unknown'); end if;
  elsif p_uid is not null then
    v_to := p_uid;
    if not exists (select 1 from public.fw_scores sc where sc.player_id = v_to)
       and not exists (select 1 from public.fw_versus v where v.player_id = v_to) then
      raise exception 'fw_bad_input: unknown player' using errcode = '22023';
    end if;
  else
    raise exception 'fw_bad_input: code or uuid required' using errcode = '22023';
  end if;
  if v_to = v_me then raise exception 'fw_friend_self: that is you' using errcode = 'P0001'; end if;
  if exists (select 1 from public.fw_friends f where f.a = least(v_me, v_to) and f.b = greatest(v_me, v_to)) then
    raise exception 'fw_friend_dupe: already friends' using errcode = 'P0001';
  end if;
  if (select count(*) from public.fw_friends f where v_me in (f.a, f.b)) >= c.friend_cap
     or (select count(*) from public.fw_friends f where v_to in (f.a, f.b)) >= c.friend_cap then
    raise exception 'fw_friend_cap: friend list is full' using errcode = 'P0001';
  end if;
  -- a request the other way makes the friendship at once
  if exists (select 1 from private.fw_friend_req r where r.from_id = v_to and r.to_id = v_me) then
    insert into public.fw_friends (a, b) values (least(v_me, v_to), greatest(v_me, v_to)) on conflict do nothing;
    delete from private.fw_friend_req r where (r.from_id, r.to_id) in ((v_me, v_to), (v_to, v_me));
    return jsonb_build_object('status', 'friends');
  end if;
  if exists (select 1 from private.fw_friend_req r where r.from_id = v_me and r.to_id = v_to) then
    raise exception 'fw_friend_dupe: already requested' using errcode = 'P0001';
  end if;
  if (select count(*) from private.fw_friend_req r where r.from_id = v_me) >= c.pending_cap then
    raise exception 'fw_friend_cap: too many pending requests' using errcode = 'P0001';
  end if;
  insert into private.fw_friend_req (from_id, to_id) values (v_me, v_to);
  return jsonb_build_object('status', 'sent');
end;
$$;

create or replace function private.fw_friend_respond(p_from uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c    record := private.fw_social_cfg();
  v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  if p_from is null or p_accept is null then raise exception 'fw_bad_input: bad arguments' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_me::text, 2));
  if not exists (select 1 from private.fw_friend_req r where r.from_id = p_from and r.to_id = v_me) then
    raise exception 'fw_bad_input: no such request' using errcode = '22023';
  end if;
  delete from private.fw_friend_req r where (r.from_id, r.to_id) in ((p_from, v_me), (v_me, p_from));
  if p_accept then
    if (select count(*) from public.fw_friends f where v_me in (f.a, f.b)) >= c.friend_cap
       or (select count(*) from public.fw_friends f where p_from in (f.a, f.b)) >= c.friend_cap then
      raise exception 'fw_friend_cap: friend list is full' using errcode = 'P0001';
    end if;
    insert into public.fw_friends (a, b) values (least(v_me, p_from), greatest(v_me, p_from)) on conflict do nothing;
  end if;
  return jsonb_build_object('status', case when p_accept then 'friends' else 'declined' end);
end;
$$;

create or replace function private.fw_friend_remove(p_uid uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  if p_uid is null then raise exception 'fw_bad_input: bad arguments' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_me::text, 2));
  delete from public.fw_friends f where f.a = least(v_me, p_uid) and f.b = greatest(v_me, p_uid);
  delete from private.fw_friend_req r where (r.from_id, r.to_id) in ((v_me, p_uid), (p_uid, v_me));
  return jsonb_build_object('status', 'removed');
end;
$$;

-- everything the friends screen needs, in one call
create or replace function private.fw_social_me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c    record := private.fw_social_cfg();
  v_me uuid := (select auth.uid());
  v_row private.fw_social%rowtype;
  v_friends jsonb;
  v_reqs jsonb;
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  v_row := private.fw_social_row(v_me);
  select coalesce(jsonb_agg(jsonb_build_object(
      'player_id', o.uid, 'nick', coalesce(sc.nick, vs.nick, 'Pilot'), 'cc', coalesce(sc.cc, vs.cc, ''),
      'bird', coalesce(sc.bird, vs.bird, ''), 'best', coalesce(sc.best, 0), 'rp', coalesce(vs.rp, 0),
      'online', (s.last_seen is not null and s.last_seen > now() - c.online_window)) order by coalesce(sc.best, 0) desc), '[]'::jsonb)
    into v_friends
  from (select case when f.a = v_me then f.b else f.a end as uid from public.fw_friends f where v_me in (f.a, f.b)) o
  left join public.fw_scores  sc on sc.player_id = o.uid
  left join public.fw_versus  vs on vs.player_id = o.uid
  left join private.fw_social s  on s.player_id = o.uid;
  select coalesce(jsonb_agg(jsonb_build_object('from_id', r.from_id, 'nick', coalesce(sc.nick, vs.nick, 'Pilot')) order by r.at desc), '[]'::jsonb)
    into v_reqs
  from private.fw_friend_req r
  left join public.fw_scores sc on sc.player_id = r.from_id
  left join public.fw_versus vs on vs.player_id = r.from_id
  where r.to_id = v_me;
  return jsonb_build_object('code', v_row.code, 'friends', v_friends, 'reqs', v_reqs);
end;
$$;

create or replace function public.friend_request(p_code text default null, p_uid uuid default null) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_friend_request(p_code, p_uid); $$;
create or replace function public.friend_respond(p_from uuid, p_accept boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_friend_respond(p_from, p_accept); $$;
create or replace function public.friend_remove(p_uid uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_friend_remove(p_uid); $$;
create or replace function public.social_me() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_social_me(); $$;

revoke all on function private.fw_social_row(uuid, boolean)            from public, anon, authenticated;
revoke all on function private.fw_social_cfg()                         from public, anon, authenticated;
revoke all on function private.fw_friend_request(text, uuid)           from public, anon, authenticated;
revoke all on function private.fw_friend_respond(uuid, boolean)        from public, anon, authenticated;
revoke all on function private.fw_friend_remove(uuid)                  from public, anon, authenticated;
revoke all on function private.fw_social_me()                          from public, anon, authenticated;
revoke all on function public.friend_request(text, uuid)               from public, anon, authenticated;
revoke all on function public.friend_respond(uuid, boolean)            from public, anon, authenticated;
revoke all on function public.friend_remove(uuid)                      from public, anon, authenticated;
revoke all on function public.social_me()                              from public, anon, authenticated;
grant execute on function private.fw_friend_request(text, uuid)        to authenticated, service_role;
grant execute on function private.fw_friend_respond(uuid, boolean)     to authenticated, service_role;
grant execute on function private.fw_friend_remove(uuid)               to authenticated, service_role;
grant execute on function private.fw_social_me()                       to authenticated, service_role;
grant execute on function public.friend_request(text, uuid)            to authenticated, service_role;
grant execute on function public.friend_respond(uuid, boolean)         to authenticated, service_role;
grant execute on function public.friend_remove(uuid)                   to authenticated, service_role;
grant execute on function public.social_me()                           to authenticated, service_role;

-- =====================================================================================================
-- SOCIAL — 4-PLAYER FFA (plan-social.md P3)
-- Match id: <seed base36>.<u1>+<u2>+<u3>+<u4> (uids sorted ascending). "team" is the seat = the uid's index
-- in that order (0..3). A report is the whole ranking as seen by the reporter, in seat order: '1,3,2,4'
-- (competition ranking: ties share the better place). Settlement needs all four registered and either
-- every report in and equal, or at the deadline at least TWO equal reports (one player alone may not rank
-- the other three). RP by placement from fw_vs_cfg().ffa_rp, tie groups averaging their span toward zero.
alter table private.fw_vs_match drop constraint if exists fw_vs_match_mode_chk;
alter table private.fw_vs_match add constraint fw_vs_match_mode_chk check (mode in ('1v1', '2v2', 'ffa'));
alter table private.fw_vs_part drop constraint if exists fw_vs_part_team_chk;
alter table private.fw_vs_part add constraint fw_vs_part_team_chk check (team between 0 and 3);
alter table private.fw_vs_part drop constraint if exists fw_vs_part_result_chk;
alter table private.fw_vs_part add constraint fw_vs_part_result_chk
  check (result is null or result in ('win', 'lose', 'draw') or result ~ '^[1-4](,[1-4]){3}$');
alter table private.fw_vs_part drop constraint if exists fw_vs_part_final_chk;
alter table private.fw_vs_part add constraint fw_vs_part_final_chk
  check (final is null or final in ('win', 'lose', 'draw') or final ~ '^[1-4](,[1-4]){3}$');

-- a well-formed competition ranking of four: values 1..4; sorted ascending, each value is its position + 1 or repeats the one before
create or replace function private.fw_vs_ffa_vec_ok(p_vec text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare v integer[]; srt integer[];
begin
  if p_vec is null or p_vec !~ '^[1-4](,[1-4]){3}$' then return false; end if;
  v := string_to_array(p_vec, ',')::integer[];
  select array_agg(x order by x) into srt from unnest(v) x;
  for i in 1..4 loop
    if srt[i] <> i and (i = 1 or srt[i] <> srt[i-1]) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function private.fw_vs_roster_ffa(p_match text) returns uuid[]
language plpgsql immutable set search_path = '' as $$
declare
  c_u constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  v text[]; ids uuid[];
begin
  if p_match is null or p_match !~ ('^[0-9a-z]{1,8}\.' || c_u || '(\+' || c_u || '){3}$') then
    raise exception 'fw_bad_input: bad match id' using errcode = '22023';
  end if;
  ids := string_to_array(split_part(p_match, '.', 2), '+')::uuid[];
  for i in 2..4 loop
    if ids[i-1] >= ids[i] then
      raise exception 'fw_bad_input: match id is not canonical' using errcode = '22023';
    end if;
  end loop;
  return ids;
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

revoke all on function private.fw_vs_ffa_vec_ok(text)   from public, anon, authenticated;
revoke all on function private.fw_vs_roster_ffa(text)   from public, anon, authenticated;
revoke all on function private.fw_vs_settle_ffa(text)   from public, anon, authenticated;

-- =====================================================================================================
-- SOCIAL — FRIEND ALERTS (plan-social.md P2)
-- The feed table is the source of truth; clients POLL it (visible 30 s / hidden 60 s) through
-- social_hello(p_since), which also refreshes last_seen (the friends-list online dot). A realtime
-- signal was considered and dropped (P0: polling-first); the batching below keeps the table small:
-- 'on' at most once per hello_gap per player, 'best' folded per pair inside best_gap.
create table if not exists private.fw_social_feed (
  id      bigint      generated always as identity primary key,
  to_id   uuid        not null references auth.users (id) on delete cascade,
  from_id uuid        not null references auth.users (id) on delete cascade,
  kind    text        not null,
  val     integer     not null default 0,
  at      timestamptz not null default now(),
  constraint fw_social_feed_kind_chk check (kind in ('on', 'best'))
);
create index if not exists fw_social_feed_to on private.fw_social_feed (to_id, id);
create index if not exists fw_social_feed_fold on private.fw_social_feed (to_id, from_id, kind, at);
alter table private.fw_social_feed enable row level security;
revoke all on table private.fw_social_feed from public, anon, authenticated;

create or replace function private.fw_social_hello(p_since bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c     record := private.fw_social_cfg();
  v_me  uuid   := (select auth.uid());
  v_now timestamptz := now();
  v_row private.fw_social%rowtype;
  v_rows jsonb;
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  v_row := private.fw_social_row(v_me, true);
  update private.fw_social set last_seen = v_now where player_id = v_me;
  -- came (back) online: only when the previous sighting is older than the online window (a player who stayed
  -- on just keeps polling), and then at most once per hello_gap
  if (v_row.last_seen is null or v_row.last_seen < v_now - c.online_window)
     and (v_row.hello_at is null or v_row.hello_at < v_now - c.hello_gap) then
    update private.fw_social set hello_at = v_now where player_id = v_me;
    insert into private.fw_social_feed (to_id, from_id, kind)
    select case when f.a = v_me then f.b else f.a end, v_me, 'on' from public.fw_friends f where v_me in (f.a, f.b);
  end if;
  delete from private.fw_social_feed where to_id = v_me and at < v_now - c.feed_keep;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'from_id', x.from_id, 'nick', coalesce(sc.nick, vs.nick, 'Pilot'),
           'kind', x.kind, 'val', x.val, 'at', x.at) order by x.id), '[]'::jsonb)
    into v_rows
  from (select * from private.fw_social_feed d where d.to_id = v_me and d.id > coalesce(p_since, 0)
        and d.at > v_now - interval '1 hour' order by d.id limit 50) x   -- stale backlog is skipped, the cursor (max below) still passes it
  left join public.fw_scores sc on sc.player_id = x.from_id
  left join public.fw_versus vs on vs.player_id = x.from_id;
  return jsonb_build_object('rows', v_rows,
    'max', coalesce((select max(d.id) from private.fw_social_feed d where d.to_id = v_me), coalesce(p_since, 0)));
end;
$$;

-- a new endless best tells the friends (folded per pair inside best_gap)
create or replace function private.fw_scores_best_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c record := private.fw_social_cfg(); v_now timestamptz := now(); r record;
begin
  if tg_op = 'UPDATE' and new.best <= old.best then return new; end if;
  if new.best <= 0 then return new; end if;
  for r in select case when f.a = new.player_id then f.b else f.a end as fid from public.fw_friends f where new.player_id in (f.a, f.b) loop
    -- fold inside best_gap by replacing (a fresh id): an updated-in-place row would hide behind the reader's cursor
    delete from private.fw_social_feed d
    where d.to_id = r.fid and d.from_id = new.player_id and d.kind = 'best' and d.at > v_now - c.best_gap;
    insert into private.fw_social_feed (to_id, from_id, kind, val) values (r.fid, new.player_id, 'best', new.best);
  end loop;
  return new;
end;
$$;
drop trigger if exists fw_scores_best_notify on public.fw_scores;
create trigger fw_scores_best_notify after insert or update of best on public.fw_scores
for each row execute function private.fw_scores_best_notify();

create or replace function public.social_hello(p_since bigint default 0) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_social_hello(p_since); $$;

revoke all on function private.fw_social_hello(bigint)       from public, anon, authenticated;
revoke all on function private.fw_scores_best_notify()       from public, anon, authenticated;
revoke all on function public.social_hello(bigint)           from public, anon, authenticated;
grant execute on function private.fw_social_hello(bigint)    to authenticated, service_role;
grant execute on function public.social_hello(bigint)        to authenticated, service_role;

-- A guest (anonymous) account younger than 10 minutes: telemetry gives it a small cap of its own and leaves its rows out of the
-- global hourly counts, so a few dozen fresh guest accounts cannot fill a global cap and blind the launch numbers.
-- (to_jsonb: the column may be absent on a local rehearsal stub)
create or replace function private.fw_fresh_guest(p_uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users u where u.id = p_uid and u.created_at > now() - interval '10 minutes'
                   and coalesce(to_jsonb(u) ->> 'is_anonymous', 'false') = 'true');
$$;
revoke all on function private.fw_fresh_guest(uuid) from public, anon, authenticated;

-- ---------- CLIENT ERRORS: the game reports its own uncaught errors ----------
-- No third-party tracker: the client (index.html errlog block) sends an uncaught error or rejection once per distinct
-- bug, at most 5 a session, through public.report_error(). A row holds the message, the stack, a build fingerprint,
-- the page path (never the query: an OAuth return carries a code there), the user agent and a small context object.
-- Caps: 10 reports an hour per player and 500 an hour overall (a bug on every screen must not fill the database);
-- a guest account younger than 10 minutes (private.fw_fresh_guest) gets 3 an hour instead and its reports do not count
-- toward the overall cap; over a cap the call returns false and stores nothing. Rows older than 30 days go with the pg_cron job
-- fw_client_errors_gc (scheduled with the other jobs above). A deleted account leaves its rows without a player.
-- Read:  select at, player_id, build, msg, left(stack, 200) as stack, url, extra
--        from private.fw_client_errors order by at desc limit 50;
create table if not exists private.fw_client_errors (
  id        bigserial   primary key,
  at        timestamptz not null default now(),
  player_id uuid        references auth.users (id) on delete set null,
  build     text        not null,
  msg       text        not null,
  stack     text,
  url       text,
  ua        text,
  extra     jsonb
);
create index if not exists fw_client_errors_at_idx        on private.fw_client_errors (at desc);
create index if not exists fw_client_errors_player_at_idx on private.fw_client_errors (player_id, at desc);
alter table private.fw_client_errors enable row level security;   -- no policy: the schema is not exposed, the function below writes it
revoke all on table private.fw_client_errors from public, anon, authenticated;
grant select, delete on table private.fw_client_errors to service_role;

create or replace function private.fw_report_error(p_msg text, p_stack text, p_build text, p_url text, p_ua text, p_extra jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_msg text := left(btrim(regexp_replace(coalesce(p_msg, ''), '\s+', ' ', 'g')), 300);
  c_cap_player constant int := 10;
  c_cap_guest  constant int := 3;
  c_cap_all    constant int := 500;
  v_fresh boolean; v_cap int;
begin
  if v_uid is null or v_msg = '' then return false; end if;
  v_fresh := private.fw_fresh_guest(v_uid);
  v_cap := case when v_fresh then c_cap_guest else c_cap_player end;
  if (select count(*) from private.fw_client_errors e where e.player_id = v_uid and e.at > now() - interval '1 hour') >= v_cap then return false; end if;
  if not v_fresh and (select count(*) from private.fw_client_errors e where e.at > now() - interval '1 hour'
                        and not exists (select 1 from auth.users u where u.id = e.player_id and e.at < u.created_at + interval '10 minutes'
                                          and coalesce(to_jsonb(u) ->> 'is_anonymous', 'false') = 'true')) >= c_cap_all then return false; end if;
  insert into private.fw_client_errors (player_id, build, msg, stack, url, ua, extra)
  values (v_uid, left(coalesce(p_build, ''), 40), v_msg, left(p_stack, 2000), left(p_url, 200), left(p_ua, 200),
          case when jsonb_typeof(p_extra) = 'object' and length(p_extra::text) <= 500 then p_extra else null end);
  return true;
end $$;
create or replace function public.report_error(p_msg text, p_stack text, p_build text, p_url text, p_ua text, p_extra jsonb)
returns boolean language sql security invoker set search_path = '' as $$ select private.fw_report_error(p_msg, p_stack, p_build, p_url, p_ua, p_extra); $$;
revoke all on function private.fw_report_error(text, text, text, text, text, jsonb) from public, anon;
grant execute on function private.fw_report_error(text, text, text, text, text, jsonb) to authenticated, service_role;   -- the invoker wrapper runs it as the caller
revoke all on function public.report_error(text, text, text, text, text, jsonb)     from public, anon;
grant execute on function public.report_error(text, text, text, text, text, jsonb) to authenticated;

-- ---------- testers: accounts that fly every released unit without buying it (QA) ----------
-- The flag is a server row, never a nickname (a nickname can be typed by anyone). Add a tester with
--   insert into private.fw_testers (player_id, note) values ('<auth.users id>', 'who');
-- and find an id by nickname with
--   select player_id, nick, updated_at from public.fw_scores where nick in ('민황', '브레통');
-- The client calls public.tester_me() after start-up and after each sign-in; when true it treats every released
-- (non-hidden) unit as owned for the session and shows a TESTER badge in the hangar. Nothing is written to the wallet,
-- the owned list or the cloud save, so deleting the row locks the units again on the next start.
create table if not exists private.fw_testers (
  player_id uuid primary key references auth.users (id) on delete cascade,
  note      text,
  added_at  timestamptz not null default now()
);
alter table private.fw_testers enable row level security;   -- no policy: the schema is not exposed, the function below reads it
revoke all on table private.fw_testers from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_testers to service_role;

create or replace function private.fw_tester_me() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.fw_testers x where x.player_id = (select auth.uid()));
$$;
create or replace function public.tester_me() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.fw_tester_me(); $$;
revoke all on function private.fw_tester_me() from public, anon;
grant execute on function private.fw_tester_me() to authenticated, service_role;   -- the invoker wrapper runs it as the caller; the private schema is not exposed by the API
revoke all on function public.tester_me()     from public, anon;
grant execute on function public.tester_me() to authenticated;

-- ---------- ACCOUNT DELETION: the player deletes their own account from the game ----------
-- Privacy law wants a way to withdraw. The client's "계정 삭제" calls public.delete_me(): one delete of the caller's
-- auth.users row, and every game table (fw_scores, fw_saves, fw_versus, fw_vs_part, fw_vs_standing, fw_social,
-- fw_friends, fw_friend_req, fw_social_feed, fw_testers, fw_events, fw_referrals, fw_ref_inviter, fw_ref_payouts, fw_reports, fw_push) references
-- auth.users (id) on delete cascade, and so does fw_admins (an admin's row goes with the account), as do the auth schema's own
-- identities/sessions/refresh tokens. Nothing is anonymised or kept,
-- except that fw_client_errors and private.fw_admin_log keep their rows with the account's id set to null (fw_admin_log keeps its rows
-- so the audit trail outlives an admin account; its target column has no reference at all). A guest has no account to delete
-- (the client never offers it); a call without a user does nothing and returns false.
create or replace function private.fw_delete_me() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid());
begin
  if v_uid is null then return false; end if;
  delete from auth.users u where u.id = v_uid;
  return found;
end $$;
create or replace function public.delete_me() returns boolean
language sql security invoker set search_path = '' as $$ select private.fw_delete_me(); $$;
revoke all on function private.fw_delete_me() from public, anon;
grant execute on function private.fw_delete_me() to authenticated, service_role;   -- the invoker wrapper runs it as the caller; the private schema is not exposed by the API
revoke all on function public.delete_me()     from public, anon;
grant execute on function public.delete_me() to authenticated;

-- ---------- PRODUCT EVENTS: what players do, for the launch KPIs (supabase/checks/kpi.sql) ----------
-- No third-party analytics: the client (index.html events block) queues first_open (once per device), session_start /
-- session_end (props.dur = visible seconds of the session so far; a session can end more than once, the max counts),
-- tutorial_done, run_end, daily_done, shop_buy (the shop is a test build: nothing is paid), ad_view, share and level_up,
-- and sends them in batches through public.track(). 'purchase' is reserved for real payments and is not accepted from a
-- client (a server-side receipt check will write it). A batch is a json array
-- of {k: kind, s: session id (16 base-36 chars), p: props object up to 1 KB}; an element that is not valid is skipped,
-- oversized props are dropped. Caps: 300 events an hour per player (a beginner's runs can end every 10 s) and 20,000 an
-- hour overall, at most 50 a call; a guest account younger than 10 minutes (private.fw_fresh_guest) gets 60 an hour and
-- its events do not count toward (nor wait on) the overall cap; over a cap the rest of the batch is not stored. at is the server's insert time
-- (the client sends within 30 s). Rows are deleted with the account (delete_me) and after 400 days by the pg_cron job
-- fw_events_gc (long enough for a D30 cohort a year back).
-- Read:  select at, player_id, kind, session, props from private.fw_events order by at desc limit 50;
create table if not exists private.fw_events (
  id        bigserial   primary key,
  player_id uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind      text        not null check (kind in ('first_open', 'session_start', 'session_end', 'tutorial_done', 'run_end', 'daily_done',
                                                 'shop_buy', 'purchase', 'ad_view', 'share', 'level_up')),
  at        timestamptz not null default now(),
  session   text        check (session ~ '^[0-9a-z]{16}$'),
  props     jsonb       check (props is null or (jsonb_typeof(props) = 'object' and length(props::text) <= 1024)),
  build     text        not null default ''
);
create index if not exists fw_events_kind_at_idx   on private.fw_events (kind, at);
create index if not exists fw_events_player_at_idx on private.fw_events (player_id, at);
create index if not exists fw_events_at_idx        on private.fw_events (at);   -- the global cap and the retention job
alter table private.fw_events enable row level security;   -- no policy: the schema is not exposed, the function below writes it
revoke all on table private.fw_events from public, anon, authenticated;
grant select, delete on table private.fw_events to service_role;

create or replace function private.fw_track(p_events jsonb, p_build text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_cap_player constant int := 300;
  v_cap_guest  constant int := 60;
  v_cap_all    constant int := 20000;
  v_room int; v_n int; v_fresh boolean;
begin
  if v_uid is null or jsonb_typeof(p_events) is distinct from 'array' then return 0; end if;
  v_fresh := private.fw_fresh_guest(v_uid);
  v_room := least(50, case when v_fresh then v_cap_guest else v_cap_player end
                      - (select count(*) from private.fw_events e where e.player_id = v_uid and e.at > now() - interval '1 hour'));
  if v_room <= 0 then return 0; end if;
  if not v_fresh then
    v_room := least(v_room, v_cap_all - (select count(*) from private.fw_events e where e.at > now() - interval '1 hour'
                                           and not exists (select 1 from auth.users u where u.id = e.player_id and e.at < u.created_at + interval '10 minutes'
                                                             and coalesce(to_jsonb(u) ->> 'is_anonymous', 'false') = 'true')));
    if v_room <= 0 then return 0; end if;
  end if;
  insert into private.fw_events (player_id, kind, session, props, build)
  select v_uid, x.e->>'k', x.e->>'s',
         case when jsonb_typeof(x.e->'p') = 'object' and length((x.e->'p')::text) <= 1024 then x.e->'p' end,
         left(coalesce(p_build, ''), 40)
  from jsonb_array_elements(p_events) with ordinality as x(e, i)
  where jsonb_typeof(x.e) = 'object'
    and x.e->>'k' in ('first_open', 'session_start', 'session_end', 'tutorial_done', 'run_end', 'daily_done',
                      'shop_buy', 'ad_view', 'share', 'level_up')   -- not 'purchase': real payments only, written server-side
    and coalesce(x.e->>'s', '') ~ '^[0-9a-z]{16}$'
  order by x.i
  limit v_room;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
create or replace function public.track(p_events jsonb, p_build text)
returns integer language sql security invoker set search_path = '' as $$ select private.fw_track(p_events, p_build); $$;
revoke all on function private.fw_track(jsonb, text) from public, anon;
grant execute on function private.fw_track(jsonb, text) to authenticated, service_role;   -- the invoker wrapper runs it as the caller; the private schema is not exposed by the API
revoke all on function public.track(jsonb, text)     from public, anon;
grant execute on function public.track(jsonb, text) to authenticated;

do $do$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('fw_events_gc', '50 15 * * *',
      'set statement_timeout = 0; delete from private.fw_events where at < now() - interval ''400 days'';');
  end if;
end
$do$;
-- =====================================================================================================
-- REFERRALS — friend invites, "play together and earn" (the marketing plan's 친구 초대 크레딧)
-- The invite link is the game address with the inviter's friend code: https://swishby.com/?r=<fw_social.code>. The invited
-- friend's device sends the code once after its first sign-in (referral_link); from then on it reports, once a UTC day after a
-- finished run (or sooner when the stage reached went up), the stage it has reached (referral_progress). The invite counts when
-- the friend has reported on fw_ref_cfg().days distinct UTC days (server clock), reached STAGE fw_ref_cfg().stage, and holds a
-- server-checked best (public.fw_scores, written only by fw_submit_score) of at least min_best: a run that reached STAGE 10 cleared
-- STAGE 9 and so scored at least its gate goal. The stage number itself is the device's word; the days and the best are not.
-- The inviter is paid in gems (the shop's premium currency, never an unlock): `gems` per counted friend, plus ms_gems at 3, 10 and
-- 25 counted friends (each milestone once; the game has no skin system, so the plan's limited skin / shield slot is a bigger gem
-- bundle), at most month_cap friends per calendar month (Asia/Seoul, as the versus seasons): the rest wait for the next month.
-- The invited friend gets nothing for joining (store rules refuse install incentives), only the normal welcome. Both become friends.
-- Payment mirrors versus_claim: the wallet is the device's, so referral_claim() books a payout row and returns every payout not
-- acknowledged yet; the client grants each payout id once (it keeps the ids it granted), then calls referral_ack(id). An answer
-- lost on the way is returned again by the next claim, and an acknowledged payout is never returned again.
-- Anti-abuse: one inviter per invitee (primary key), no self-invite (check) and no invite cycle, the invitee's auth user must be
-- younger than new_window (a fresh player, not an old account opening a link), and when more than burst_n friends link to one
-- inviter within burst_window, every unpaid invite of that inviter from the window is held for review. Since 2026-10-28 (owner's
-- decision, audit: scripted guest invitees): the invitee must be a signed-in account, not a guest (private.fw_need_account in
-- referral_link and referral_progress), min_best is a real-play score (fw_ref_cfg), and a counted friend is paid no sooner than
-- fw_ref_hold() (24 h) after the link. A guest who signs in later than new_window after its first start is an 'old' account then.
-- Review by hand:
--   select r.*, s.nick, s.best from private.fw_referrals r left join public.fw_scores s on s.player_id = r.invitee_id
--   where r.held order by r.inviter_id, r.linked_at;
--   update private.fw_referrals set held = false where inviter_id = '<uuid>' and held;   -- release after review
-- Deleting either auth user deletes their rows (on delete cascade); counters live on the inviter's own row, so a friend who
-- deletes their account later does not make a milestone payable twice.
-- =====================================================================================================
create table if not exists private.fw_referrals (
  invitee_id uuid        primary key references auth.users (id) on delete cascade,
  inviter_id uuid        not null references auth.users (id) on delete cascade,
  linked_at  timestamptz not null default now(),
  days       integer     not null default 0,   -- distinct UTC days with a progress report (server clock)
  last_day   date,                             -- UTC day of the last counted report
  stage      integer     not null default 0,   -- highest stage reached (1-based), as the invitee's device reports it
  done_at    timestamptz,                      -- the goal was met
  held       boolean     not null default false,
  payout_id  bigint,                           -- the inviter's payout that counted it (null = not paid yet)
  constraint fw_referrals_self_chk  check (invitee_id <> inviter_id),
  constraint fw_referrals_days_chk  check (days >= 0),
  constraint fw_referrals_stage_chk check (stage between 0 and 50)
);
create index if not exists fw_referrals_inviter_idx on private.fw_referrals (inviter_id, linked_at);
alter table private.fw_referrals enable row level security;   -- no policy: the schema is not exposed, the functions below write it
revoke all on table private.fw_referrals from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_referrals to service_role;

create table if not exists private.fw_ref_inviter (
  player_id uuid    primary key references auth.users (id) on delete cascade,
  paid      integer not null default 0,   -- friends paid for, ever
  ms_paid   integer not null default 0,   -- milestones paid (0..3, in order)
  constraint fw_ref_inviter_chk check (paid >= 0 and ms_paid between 0 and 3)
);
alter table private.fw_ref_inviter enable row level security;
revoke all on table private.fw_ref_inviter from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_ref_inviter to service_role;

create table if not exists private.fw_ref_payouts (
  id         bigint      generated always as identity primary key,
  inviter_id uuid        not null references auth.users (id) on delete cascade,
  gems       integer     not null,
  invites    integer     not null,              -- friends counted (the monthly cap counts these)
  ms         integer[]   not null default '{}', -- milestones paid with it (3, 10, 25)
  at         timestamptz not null default now(),
  acked_at   timestamptz,                       -- the device said it granted the gems
  constraint fw_ref_payouts_chk check (gems > 0 and invites >= 0)
);
-- the nonce of the device whose referral_claim first returned this payout: only that device grants it ("same")
alter table private.fw_ref_payouts add column if not exists nonce text;
create index if not exists fw_ref_payouts_inviter_idx on private.fw_ref_payouts (inviter_id, at);
alter table private.fw_ref_payouts enable row level security;
revoke all on table private.fw_ref_payouts from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_ref_payouts to service_role;

-- the numbers, in one place (REF_CFG in index.html holds the same; tests/referral.test.js keeps them equal).
-- min_best 30 (was 14, owner's decision 2026-10-28): a score of real play, not the lowest goal a run that reached STAGE 10 needed.
-- Measured with scripts/balance.mjs (VOLT, form I, STAGE 9, 20 runs each, 2026-10-28): a weak bot (--aim 40, clears STAGE 9 in 30%
-- of its runs) scores 30 or more in about one run in ten (p90 30); a middling one (--aim 25, 65% clears) in most runs (mean 48).
-- A friend who reached STAGE 10 over 3 days of play has flown dozens of runs, so a genuine new player has it; 14 was within
-- reach of the first runs of stage 1.
create or replace function private.fw_ref_cfg(
  out days integer, out stage integer, out min_best integer, out gems integer, out ms integer[], out ms_gems integer[],
  out month_cap integer, out new_window interval, out burst_n integer, out burst_window interval
) language sql immutable set search_path = '' as $$
  select 3, 10, 30, 30, array[3,10,25], array[50,150,500], 25, interval '24 hours', 5, interval '1 hour';
$$;
-- A counted friend is paid only this long after the link (owner's decision 2026-10-28, burst protection): a burst of links found
-- later (fw_referral_link holds every unpaid invite of a burst) still catches invites that met their goal quickly. Its own
-- function, so fw_ref_cfg keeps its OUT columns (changing them needs a drop).
create or replace function private.fw_ref_hold() returns interval
language sql immutable set search_path = '' as $$
  select interval '24 hours';
$$;

-- The invited friend's device sends the code from ?r= once. Answers a status instead of raising, so the spent request quota
-- (shared with friend requests) commits and probing codes costs it: linked | already | unknown | self | old.
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

-- The invited friend's progress report: p_stage = highest stage reached (1-based). A new UTC day counts once (server clock);
-- the stage only goes up. Answers none (not invited) | open | done.
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

-- payouts not acknowledged yet, oldest first (helpers run inside the definer functions below: no privileges of their own).
-- same: the payout carries the caller's device nonce (null without one: referral_me, the 1.0.0 builds)
drop function if exists private.fw_ref_unacked(uuid);
create or replace function private.fw_ref_unacked(p_uid uuid, p_nonce text default null) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'gems', p.gems, 'invites', p.invites, 'ms', to_jsonb(p.ms), 'same', p.nonce = p_nonce) order by p.id), '[]'::jsonb)
  from private.fw_ref_payouts p where p.inviter_id = p_uid and p.acked_at is null;
$$;

-- friends counted this calendar month (Asia/Seoul)
create or replace function private.fw_ref_month(p_uid uuid) returns integer
language sql stable set search_path = '' as $$
  select coalesce(sum(p.invites), 0)::integer from private.fw_ref_payouts p
  where p.inviter_id = p_uid and p.at >= (date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
$$;

-- everything the friends screen shows: my invite code, progress (paid toward 3 / 10 / 25), this month against the cap,
-- the friends I invited with their days and stage, and payouts waiting for this device
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

-- Books one payout for every counted friend not paid yet (oldest goal first, within this month's room) plus the milestones that
-- crosses, then returns every payout not acknowledged yet. A second call books nothing new. p_nonce: the calling device's id; every
-- unacknowledged payout no device has taken yet is stamped with it, and only payouts with "same": true are that device's to grant
-- (two devices of one inviter cannot both grant one payout). Optional for the 1.0.0 builds, which stamp nothing.
drop function if exists public.referral_claim();
drop function if exists private.fw_referral_claim();
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

-- the device granted payout p_id: it is not returned again. true when this call acknowledged it
create or replace function private.fw_referral_ack(p_id bigint) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  update private.fw_ref_payouts p set acked_at = now() where p.id = p_id and p.inviter_id = v_me and p.acked_at is null;
  return found;
end $$;

create or replace function public.referral_link(p_code text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_referral_link(p_code); $$;
create or replace function public.referral_progress(p_stage integer) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_referral_progress(p_stage); $$;
create or replace function public.referral_me() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_referral_me(); $$;
create or replace function public.referral_claim(p_nonce text default null) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_referral_claim(p_nonce); $$;
create or replace function public.referral_ack(p_id bigint) returns boolean
language sql security invoker set search_path = '' as $$ select private.fw_referral_ack(p_id); $$;

revoke all on function private.fw_ref_cfg()                  from public, anon, authenticated;
revoke all on function private.fw_ref_hold()                 from public, anon, authenticated;
revoke all on function private.fw_ref_unacked(uuid, text)    from public, anon, authenticated;
revoke all on function private.fw_ref_month(uuid)            from public, anon, authenticated;
-- the invoker wrappers run their private function as the caller, so it needs execute (production answered 403 without it on 2026-10-20)
revoke all on function private.fw_referral_link(text)        from public, anon;
revoke all on function private.fw_referral_progress(integer) from public, anon;
revoke all on function private.fw_referral_me()              from public, anon;
revoke all on function private.fw_referral_claim(text)       from public, anon;
revoke all on function private.fw_referral_ack(bigint)       from public, anon;
grant execute on function private.fw_referral_link(text)        to authenticated, service_role;
grant execute on function private.fw_referral_progress(integer) to authenticated, service_role;
grant execute on function private.fw_referral_me()              to authenticated, service_role;
grant execute on function private.fw_referral_claim(text)       to authenticated, service_role;
grant execute on function private.fw_referral_ack(bigint)       to authenticated, service_role;
revoke all on function public.referral_link(text)            from public, anon;
revoke all on function public.referral_progress(integer)     from public, anon;
revoke all on function public.referral_me()                  from public, anon;
revoke all on function public.referral_claim(text)           from public, anon;
revoke all on function public.referral_ack(bigint)           from public, anon;
grant execute on function public.referral_link(text)            to authenticated;
grant execute on function public.referral_progress(integer)     to authenticated;
grant execute on function public.referral_me()                  to authenticated;
grant execute on function public.referral_claim(text)           to authenticated;
grant execute on function public.referral_ack(bigint)           to authenticated;
-- =====================================================================================================
-- REPORTS — report another player (store UGC rules: a way to report and to block). Blocking lives on the device only
-- (index.html, report block: fw27_block); a report is one row here, sent from a name on the boards, the friends screen or a
-- versus result through public.report_player(target, reason, place, seen). Reasons and places are private.fw_rpt_cfg()'s lists
-- (tests/report.test.js keeps them equal to the client's RPT_CFG). One report per reporter, target and reason a UTC day (a
-- second one answers 'dup'), day_cap reports a reporter a day, never yourself. nick is the target's name as the server has it
-- (fw_scores, else fw_versus); seen is the name the reporter's screen showed (the client's word, kept for review).
-- Auto-hide: when hide_at different players have reported the same name for 'name', the target leaves every board
-- (hidden = true on fw_scores and fw_versus, as the by-hand moderation above). Only some reports count, so nobody can hide a
-- player with throwaway accounts or by impersonation: the reporter is signed in with a real identity (not a guest, which costs
-- nothing to make), the account is older than min_age_h hours and holds a best; and seen equals nick (in a match the peer
-- sends its own player id, so a cheat could show a rude name under somebody else's id: that report is kept but never counts).
-- A new name starts from zero (the count is per name). Review and undo, by hand as the database owner:
--   select r.target_id, r.nick, r.reason, count(*) n, max(r.at) last from private.fw_reports r
--   group by 1, 2, 3 order by n desc, last desc limit 50;
--   update public.fw_scores set hidden = false where player_id = '<uuid>';   -- and fw_versus; a name that keeps its old
--   delete from private.fw_reports where target_id = '<uuid>' and reason = 'name';   -- reports would be hidden again
-- Deleting either auth user deletes their rows (on delete cascade).
-- =====================================================================================================
create or replace function private.fw_rpt_cfg() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('reasons', array['name', 'cheat', 'other'], 'places', array['board', 'friend', 'versus'],
                            'hide_at', 3, 'day_cap', 20, 'min_age_h', 24);
$$;

create table if not exists private.fw_reports (
  id          bigserial   primary key,
  reporter_id uuid        not null references auth.users (id) on delete cascade,
  target_id   uuid        not null references auth.users (id) on delete cascade,
  nick        text        not null default '',
  seen        text        not null default '',
  reason      text        not null check (reason in ('name', 'cheat', 'other')),
  place       text        not null check (place in ('board', 'friend', 'versus')),
  day         date        not null default (now() at time zone 'utc')::date,
  at          timestamptz not null default now(),
  constraint fw_reports_self_chk check (reporter_id <> target_id),
  constraint fw_reports_day_key  unique (reporter_id, target_id, reason, day)
);
create index if not exists fw_reports_target_idx on private.fw_reports (target_id, reason, nick);
alter table private.fw_reports enable row level security;   -- no policy: the schema is not exposed, the function below writes it
revoke all on table private.fw_reports from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_reports to service_role;

create or replace function private.fw_report(p_target uuid, p_reason text, p_place text, p_seen text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_me  uuid := (select auth.uid());
  v_cfg jsonb := private.fw_rpt_cfg();
  v_day date := (now() at time zone 'utc')::date;
  v_nick text; v_n int;
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  if p_target is null or not (v_cfg->'reasons') ? coalesce(p_reason, '') or not (v_cfg->'places') ? coalesce(p_place, '')
     or not exists (select 1 from auth.users u where u.id = p_target) then
    raise exception 'fw_bad_input: unknown player, reason or place' using errcode = 'P0001';
  end if;
  if p_target = v_me then raise exception 'fw_report_self: you cannot report yourself' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtext('fw_report:' || v_me::text));         -- the day cap holds under parallel calls
  perform pg_advisory_xact_lock(hashtext('fw_report_t:' || p_target::text));   -- and the count: parallel reports cannot all miss hide_at
  if exists (select 1 from private.fw_reports r where r.reporter_id = v_me and r.target_id = p_target and r.reason = p_reason and r.day = v_day) then
    return jsonb_build_object('status', 'dup');
  end if;
  if (select count(*) from private.fw_reports r where r.reporter_id = v_me and r.day = v_day) >= (v_cfg->>'day_cap')::int then
    raise exception 'fw_rate_limited: % reports a day', v_cfg->>'day_cap' using errcode = 'P0001';
  end if;
  v_nick := coalesce((select s.nick from public.fw_scores s where s.player_id = p_target),
                     (select v.nick from public.fw_versus v where v.player_id = p_target), '');
  insert into private.fw_reports (reporter_id, target_id, nick, seen, reason, place, day)
  values (v_me, p_target, v_nick, left(coalesce(p_seen, ''), 14), p_reason, p_place, v_day);
  if p_reason = 'name' and v_nick <> '' then
    select count(distinct r.reporter_id) into v_n
    from private.fw_reports r
    join auth.users u on u.id = r.reporter_id
    where r.target_id = p_target and r.reason = 'name' and r.nick = v_nick and r.seen = r.nick
      and not u.is_anonymous
      and u.created_at < now() - make_interval(hours => (v_cfg->>'min_age_h')::int)
      and exists (select 1 from public.fw_scores s where s.player_id = r.reporter_id and s.best > 0);
    if v_n >= (v_cfg->>'hide_at')::int then
      update public.fw_scores s set hidden = true where s.player_id = p_target and not s.hidden;
      update public.fw_versus v set hidden = true where v.player_id = p_target and not v.hidden;
    end if;
  end if;
  return jsonb_build_object('status', 'ok');
end $$;
create or replace function public.report_player(p_target uuid, p_reason text, p_place text, p_seen text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_report(p_target, p_reason, p_place, p_seen); $$;

revoke all on function private.fw_rpt_cfg()                 from public, anon, authenticated;
revoke all on function private.fw_report(uuid, text, text, text)  from public, anon;
grant execute on function private.fw_report(uuid, text, text, text) to authenticated, service_role;   -- the invoker wrapper runs it as the caller; the private schema is not exposed by the API
revoke all on function public.report_player(uuid, text, text, text) from public, anon;
grant execute on function public.report_player(uuid, text, text, text) to authenticated;
-- =====================================================================================================
-- PUSH — friend alerts as iOS push notifications (the app: ios/App, Capacitor PushNotifications). While its alerts are on, the app
-- registers the APNs device token with the kinds it keeps on and its language (push_register); turning alerts off removes it
-- (push_unregister). A token is one device: registering it again moves it to the caller (a reinstall, another account), and a player
-- keeps at most 5 (the oldest go). A new feed row (fw_social_feed, above) wakes the push-send edge function through pg_net with
-- everything it needs, only for the recipient's devices that keep that kind on; the function sends to APNs and hands dead tokens to
-- push_drop (service role only). The hook needs pg_net and two vault secrets: push_hook_url (the function URL) and push_hook_secret,
-- which never leaves the database: the function asks push_hook_ok (service role only) whether the header it got is the one. Without
-- them the hook does nothing, and it never blocks the feed. Set them once as the database owner:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push-send', 'push_hook_url');
--   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'push_hook_secret');
-- Deleting the account deletes its tokens (on delete cascade).
-- =====================================================================================================
create table if not exists private.fw_push (
  token      text        primary key,
  player_id  uuid        not null references auth.users (id) on delete cascade,
  kinds      jsonb       not null default '{"on": true, "best": true}'::jsonb,
  lang       text        not null default 'en',
  updated_at timestamptz not null default now(),
  constraint fw_push_token_chk check (token ~ '^[0-9a-f]{64,200}$'),
  constraint fw_push_lang_chk  check (lang ~ '^[a-z]{2}(_[A-Z]{2})?$')
);
alter table private.fw_push drop constraint if exists fw_push_lang_chk;
alter table private.fw_push add constraint fw_push_lang_chk check (lang ~ '^[a-z]{2}(_[A-Z]{2})?$');
create index if not exists fw_push_player_idx on private.fw_push (player_id, updated_at);
alter table private.fw_push enable row level security;   -- no policy: the schema is not exposed, the functions below write it
revoke all on table private.fw_push from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_push to service_role;

create or replace function private.fw_push_register(p_token text, p_kinds jsonb, p_lang text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := (select auth.uid());
  v_kinds jsonb := jsonb_build_object('on', coalesce(p_kinds -> 'on', 'true'::jsonb) <> 'false'::jsonb,
                                      'best', coalesce(p_kinds -> 'best', 'true'::jsonb) <> 'false'::jsonb);
  v_lang text := case when coalesce(p_lang, '') ~ '^[a-z]{2}(_[A-Z]{2})?$' then p_lang else 'en' end;
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  if coalesce(p_token, '') !~ '^[0-9a-f]{64,200}$' then raise exception 'fw_bad_input: device token' using errcode = 'P0001'; end if;
  insert into private.fw_push (token, player_id, kinds, lang, updated_at) values (p_token, v_me, v_kinds, v_lang, clock_timestamp())
  on conflict (token) do update set player_id = excluded.player_id, kinds = excluded.kinds, lang = excluded.lang, updated_at = excluded.updated_at;
  delete from private.fw_push p where p.player_id = v_me and p.token in
    (select q.token from private.fw_push q where q.player_id = v_me order by q.updated_at desc offset 5);
  return true;
end $$;

create or replace function private.fw_push_unregister(p_token text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_me uuid := (select auth.uid());
begin
  if v_me is null then raise exception 'fw_auth: sign-in required' using errcode = '28000'; end if;
  delete from private.fw_push p where p.token = p_token and p.player_id = v_me;
  return found;
end $$;

create or replace function private.fw_push_drop(p_tokens text[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  delete from private.fw_push p where p.token = any (p_tokens);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create or replace function private.fw_push_hook_ok(p_secret text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  if to_regclass('vault.decrypted_secrets') is null or coalesce(p_secret, '') = '' then return false; end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v using 'push_hook_secret';
  return v is not null and v = p_secret;
end $$;

create or replace function private.fw_push_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text; v_body jsonb;
begin
  if not exists (select 1 from private.fw_push p where p.player_id = new.to_id) then return null; end if;
  if to_regproc('net.http_post') is null or to_regclass('vault.decrypted_secrets') is null then return null; end if;
  begin
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'push_hook_url';
    execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'push_hook_secret';
    if v_url is null or v_secret is null then return null; end if;
    select jsonb_build_object('kind', new.kind, 'val', new.val,
             'nick', coalesce((select s.nick from public.fw_scores s where s.player_id = new.from_id),
                              (select v.nick from public.fw_versus v where v.player_id = new.from_id), 'Pilot'),
             'devices', coalesce(jsonb_agg(jsonb_build_object('token', p.token, 'lang', p.lang)), '[]'::jsonb))
      into v_body
    from private.fw_push p
    where p.player_id = new.to_id and coalesce(p.kinds -> new.kind, 'true'::jsonb) <> 'false'::jsonb;
    if jsonb_array_length(v_body -> 'devices') = 0 then return null; end if;
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using v_url, v_body, jsonb_build_object('content-type', 'application/json', 'x-push-secret', v_secret);
  exception when others then
    null;   -- a push must never block the feed
  end;
  return null;
end $$;
drop trigger if exists fw_push_hook on private.fw_social_feed;
create trigger fw_push_hook after insert on private.fw_social_feed
for each row execute function private.fw_push_hook();

create or replace function public.push_register(p_token text, p_kinds jsonb, p_lang text) returns boolean
language sql security invoker set search_path = '' as $$ select private.fw_push_register(p_token, p_kinds, p_lang); $$;
create or replace function public.push_unregister(p_token text) returns boolean
language sql security invoker set search_path = '' as $$ select private.fw_push_unregister(p_token); $$;
create or replace function public.push_drop(p_tokens text[]) returns integer
language sql security invoker set search_path = '' as $$ select private.fw_push_drop(p_tokens); $$;
create or replace function public.push_hook_ok(p_secret text) returns boolean
language sql security invoker set search_path = '' as $$ select private.fw_push_hook_ok(p_secret); $$;

revoke all on function private.fw_push_hook()                       from public, anon, authenticated;
revoke all on function private.fw_push_register(text, jsonb, text)  from public, anon;
revoke all on function private.fw_push_unregister(text)             from public, anon;
revoke all on function private.fw_push_drop(text[])                 from public, anon, authenticated;
grant execute on function private.fw_push_register(text, jsonb, text) to authenticated, service_role;   -- the invoker wrappers run them as the caller
grant execute on function private.fw_push_unregister(text)            to authenticated, service_role;
grant execute on function private.fw_push_drop(text[])                to service_role;
revoke all on function public.push_register(text, jsonb, text) from public, anon;
grant execute on function public.push_register(text, jsonb, text) to authenticated;
revoke all on function public.push_unregister(text) from public, anon;
grant execute on function public.push_unregister(text) to authenticated;
revoke all on function public.push_drop(text[]) from public, anon, authenticated;
grant execute on function public.push_drop(text[]) to service_role;
revoke all on function private.fw_push_hook_ok(text) from public, anon, authenticated;
grant execute on function private.fw_push_hook_ok(text) to service_role;
revoke all on function public.push_hook_ok(text) from public, anon, authenticated;
grant execute on function public.push_hook_ok(text) to service_role;
-- =====================================================================================================
-- ADMIN — the operator's page (admin.html, docs/admin.md): what the by-hand SQL in this file's comments does (hide, reset a name,
-- clear reports, testers, held referrals, the season, account deletion), as server functions an operator calls from the page.
-- The page is a static file anyone can read, and so is the publishable key: hiding a screen protects nothing, so EVERY decision is
-- made here. Each private.fw_admin_* is a definer function whose first statement is private.fw_admin_gate(role): it answers the
-- caller's id only when the caller is signed in, is not a guest (the JWT's is_anonymous claim, and auth.users.is_anonymous, so a
-- token from before an upgrade cannot get round it either way), has a row in private.fw_admins, and holds the role asked for;
-- otherwise it raises 'fw_admin: not allowed' (42501). Owner powers also need the session's second factor (the JWT's aal = 'aal2',
-- Supabase MFA), else 'fw_admin_mfa: second factor required' (42501); admin_me tells the page the session's aal so it can ask for it.
-- public.admin_* are the invoker wrappers the page calls; anon reaches none.
-- Roles: mod  = read everything but the e-mail, admin roles and the log; hide / unhide and reset a name to Pilot (never an admin's);
--        clear reports;
--        owner = all of that plus testers, held referrals, running the season rollover, deleting an account, e-mails, the log.
--        An owner session without aal2 has mod powers only.
-- Admins are added and removed ONLY by hand, as the database owner (no function writes fw_admins):
--   insert into private.fw_admins (user_id, role, note) values ('<auth.users id>', 'owner', '대표');
--   update private.fw_admins set role = 'mod' where user_id = '<uuid>';   delete from private.fw_admins where user_id = '<uuid>';
-- and the id of an account is found with
--   select id, email, created_at from auth.users where email = '<address>';
-- Every write function adds a row to private.fw_admin_log (who, what, whom, details), and so does an owner's admin_player read
-- ('view_player': it shows the e-mail). The service role can only read the log. admin_id is set to null when that admin's
-- account is deleted and target has no reference, so the log keeps rows about deleted players. Read it (or admin_log):
--   select at, admin_id, action, target, detail from private.fw_admin_log order by id desc limit 50;
-- Input: ids are uuids by type; limits are 1..200; strings are length-checked; anything else is 'fw_bad_input' (22023).
-- =====================================================================================================
create table if not exists private.fw_admins (
  user_id  uuid        primary key references auth.users (id) on delete cascade,
  role     text        not null check (role in ('owner', 'mod')),
  note     text,
  added_at timestamptz not null default now()
);
alter table private.fw_admins enable row level security;   -- no policy: the schema is not exposed, only the database owner writes it
revoke all on table private.fw_admins from public, anon, authenticated;
grant select, insert, update, delete on table private.fw_admins to service_role;

create table if not exists private.fw_admin_log (
  id       bigserial   primary key,
  at       timestamptz not null default now(),
  admin_id uuid        references auth.users (id) on delete set null,
  action   text        not null,
  target   uuid,
  detail   jsonb
);
alter table private.fw_admin_log enable row level security;   -- no policy: the functions below write it
revoke all on table private.fw_admin_log from public, anon, authenticated, service_role;
grant select on table private.fw_admin_log to service_role;   -- read-only: only the admin functions (as the owner) write it; nobody updates or deletes

-- The gate (see the header). Internal: it runs inside the definer functions below, clients cannot call it.
create or replace function private.fw_admin_gate(p_role text) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_role text;
begin
  if p_role is null or p_role not in ('owner', 'mod') then raise exception 'fw_bad_input: role' using errcode = '22023'; end if;
  if v_uid is null
     or coalesce((select auth.jwt()) ->> 'is_anonymous', 'false') = 'true'
     or coalesce((select to_jsonb(u) ->> 'is_anonymous' from auth.users u where u.id = v_uid), 'false') = 'true' then
    raise exception 'fw_admin: not allowed' using errcode = '42501';   -- no user, or a guest (to_jsonb: the column may be absent)
  end if;
  select a.role into v_role from private.fw_admins a where a.user_id = v_uid;
  if v_role is null or (p_role = 'owner' and v_role <> 'owner') then
    raise exception 'fw_admin: not allowed' using errcode = '42501';
  end if;
  -- every admin call (owner and mod: the mod functions show every player's sign-ins, events and errors, and hide players)
  -- needs a session signed in with a second factor (Supabase MFA: aal2)
  if coalesce((select auth.jwt()) ->> 'aal', '') <> 'aal2' then
    raise exception 'fw_admin_mfa: second factor required' using errcode = '42501';
  end if;
  return v_uid;
end $$;

-- inside a gated function: does the caller (already through the gate) hold owner powers right now (owner row and aal2)?
create or replace function private.fw_adm_is_owner(p_uid uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists (select 1 from private.fw_admins a where a.user_id = p_uid and a.role = 'owner')
     and coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$$;

-- a page size: null = the default, otherwise 1..200
create or replace function private.fw_adm_limit(p_limit integer, p_default integer) returns integer
language plpgsql immutable set search_path = '' as $$
begin
  if p_limit is null then return p_default; end if;
  if p_limit < 1 or p_limit > 200 then raise exception 'fw_bad_input: limit must be 1..200' using errcode = '22023'; end if;
  return p_limit;
end $$;

-- the page's first call: never raises, so the page can tell "no rights" from an error. aal: the session's assurance level
-- ('aal1', 'aal2' or null); an owner on aal1 is asked for the second factor before the owner tabs work
create or replace function private.fw_admin_me() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_role text; v_aal text;
begin
  begin
    v_aal := (select auth.jwt()) ->> 'aal';
    v_uid := private.fw_admin_gate('mod');
  exception when others then
    -- the gate asks for the second factor only after every other check passed: an admin on aal1 keeps its role here, so the
    -- page can ask for the TOTP code; any other refusal (no user, a guest, not an admin) is "not an admin"
    if sqlerrm like 'fw_admin_mfa:%' then v_uid := (select auth.uid()); else v_uid := null; end if;
  end;
  select a.role into v_role from private.fw_admins a where a.user_id = v_uid;
  return jsonb_build_object('admin', v_role is not null, 'role', v_role, 'aal', v_aal);
end $$;

create or replace function private.fw_admin_overview() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_cron jsonb := '[]'::jsonb; v jsonb;
begin
  perform private.fw_admin_gate('mod');
  -- pg_cron may be absent (the rehearsal, a fresh project): read its tables with dynamic SQL only when they exist
  if to_regclass('cron.job') is not null then
    begin
      if to_regclass('cron.job_run_details') is not null then
        execute 'select coalesce(jsonb_agg(jsonb_build_object(''job'', j.jobname, ''schedule'', j.schedule, ''active'', j.active,
                   ''last_status'', d.status, ''last_at'', d.start_time) order by j.jobname), ''[]''::jsonb)
                 from cron.job j left join lateral (select r.status, r.start_time from cron.job_run_details r
                   where r.jobid = j.jobid order by r.start_time desc nulls last limit 1) d on true' into v_cron;
      else
        execute 'select coalesce(jsonb_agg(jsonb_build_object(''job'', j.jobname, ''schedule'', j.schedule, ''active'', j.active,
                   ''last_status'', null, ''last_at'', null) order by j.jobname), ''[]''::jsonb) from cron.job j' into v_cron;
      end if;
    exception when insufficient_privilege or undefined_table or undefined_column then
      v_cron := '[]'::jsonb;   -- an unexpected pg_cron version must not take the whole overview down
    end;
  end if;
  select jsonb_build_object(
    'users', (select jsonb_build_object('total', count(*), 'guests', count(*) filter (where x.guest), 'signed_in', count(*) filter (where not x.guest),
                       'new_1d', count(*) filter (where x.created_at > now() - interval '1 day'),
                       'new_7d', count(*) filter (where x.created_at > now() - interval '7 days'))
              from (select u.created_at, coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false) as guest from auth.users u) x),
    'players', jsonb_build_object('scores', (select count(*) from public.fw_scores), 'versus', (select count(*) from public.fw_versus),
                 'hidden', (select count(*) from (select s.player_id from public.fw_scores s where s.hidden
                                                  union select v.player_id from public.fw_versus v where v.hidden) h)),
    'season', (select jsonb_build_object('season', s.season, 'prev', s.prev, 'rolled_at', s.rolled_at) from private.fw_vs_season s),
    'reports', jsonb_build_object('open_targets', (select count(distinct r.target_id) from private.fw_reports r),
                 'last_1d', (select count(*) from private.fw_reports r where r.at > now() - interval '1 day')),
    'errors', jsonb_build_object('last_1d', (select count(*) from private.fw_client_errors e where e.at > now() - interval '1 day')),
    'push', jsonb_build_object('devices', (select count(*) from private.fw_push)),
    'testers', jsonb_build_object('count', (select count(*) from private.fw_testers)),
    'admins', jsonb_build_object('count', (select count(*) from private.fw_admins)),
    'cron', v_cron) into v;
  return v;
end $$;

-- supabase/checks/kpi.sql (queries 1, 2, 5 and 3) over the last p_days Korean days, newest first
create or replace function private.fw_admin_kpi(p_days integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_days integer; v_today date; v_from date; v_t0 timestamptz; v jsonb;
begin
  perform private.fw_admin_gate('mod');
  v_days := coalesce(p_days, 30);
  if v_days < 1 or v_days > 120 then raise exception 'fw_bad_input: days must be 1..120' using errcode = '22023'; end if;
  v_today := (now() at time zone 'Asia/Seoul')::date;
  v_from  := v_today - (v_days - 1);
  v_t0    := v_from::timestamp at time zone 'Asia/Seoul';
  with inst as (
    select e.player_id, (min(e.at) at time zone 'Asia/Seoul')::date as d0 from private.fw_events e where e.kind = 'first_open' group by e.player_id
  ), act as (
    select distinct e.player_id, (e.at at time zone 'Asia/Seoul')::date as d from private.fw_events e where e.kind = 'session_start' and e.at >= v_t0
  ), ses as (
    select e.session, min(e.at) as t0,
           coalesce(max(case when e.kind = 'session_end' and jsonb_typeof(e.props -> 'dur') = 'number' then (e.props ->> 'dur')::numeric end),
                    extract(epoch from max(e.at) - min(e.at))) as sec
    from private.fw_events e where e.session is not null and e.at >= v_t0 group by e.session
  )
  select jsonb_build_object(
    'installs', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'installs', x.installs) order by x.day desc), '[]'::jsonb)
                 from (select i.d0 as day, count(*) as installs from inst i where i.d0 >= v_from group by i.d0) x),
    'retention', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'installs', x.installs, 'd1', x.d1, 'd7', x.d7, 'd30', x.d30) order by x.day desc), '[]'::jsonb)
                  from (select i.d0 as day, count(*) as installs,
                               case when i.d0 + 1  < v_today then round(100.0 * count(a1.player_id)  / count(*), 1) end as d1,
                               case when i.d0 + 7  < v_today then round(100.0 * count(a7.player_id)  / count(*), 1) end as d7,
                               case when i.d0 + 30 < v_today then round(100.0 * count(a30.player_id) / count(*), 1) end as d30
                        from inst i
                        left join act a1  on a1.player_id  = i.player_id and a1.d  = i.d0 + 1
                        left join act a7  on a7.player_id  = i.player_id and a7.d  = i.d0 + 7
                        left join act a30 on a30.player_id = i.player_id and a30.d = i.d0 + 30
                        where i.d0 >= v_from group by i.d0) x),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'dau', x.dau, 'runs_per_dau', x.runs_per_dau, 'share_rate', x.share_rate,
                       'purchase_conversion', x.purchase_conversion, 'ad_views', x.ad_views, 'daily_runs', x.daily_runs) order by x.day desc), '[]'::jsonb)
              from (select (e.at at time zone 'Asia/Seoul')::date as day,
                           count(distinct e.player_id) as dau,
                           round(count(*) filter (where e.kind = 'run_end')::numeric / count(distinct e.player_id), 2) as runs_per_dau,
                           round(100.0 * count(distinct e.player_id) filter (where e.kind = 'share') / count(distinct e.player_id), 1) as share_rate,
                           round(100.0 * count(distinct e.player_id) filter (where e.kind in ('shop_buy', 'purchase')) / count(distinct e.player_id), 2) as purchase_conversion,
                           count(*) filter (where e.kind = 'ad_view') as ad_views,
                           count(*) filter (where e.kind = 'daily_done') as daily_runs
                    from private.fw_events e where e.at >= v_t0 group by 1) x),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object('day', x.day, 'sessions', x.sessions, 'avg_min', x.avg_min, 'median_min', x.median_min) order by x.day desc), '[]'::jsonb)
                 from (select (s.t0 at time zone 'Asia/Seoul')::date as day, count(*) as sessions,
                              round(avg(s.sec) / 60, 2) as avg_min,
                              round((percentile_cont(.5) within group (order by s.sec))::numeric / 60, 2) as median_min
                       from ses s group by 1) x)) into v;
  return v;
end $$;

-- search: a uuid finds that one account, anything else is a part of a name (fw_scores, else fw_versus); empty = newest accounts
create or replace function private.fw_admin_players(p_q text, p_limit integer, p_offset integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lim integer; v_off integer; v_q text; v_id uuid; v_pat text; v jsonb;
begin
  perform private.fw_admin_gate('mod');
  v_lim := private.fw_adm_limit(p_limit, 50);
  v_off := coalesce(p_offset, 0);
  if v_off < 0 then raise exception 'fw_bad_input: offset must be >= 0' using errcode = '22023'; end if;
  v_q := nullif(btrim(coalesce(p_q, '')), '');
  if char_length(v_q) > 64 then raise exception 'fw_bad_input: query too long' using errcode = '22023'; end if;
  if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_id := v_q::uuid;
  elsif v_q is not null then
    v_pat := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  with m as (
    select u.id, to_jsonb(u) as uj, u.created_at, s.nick as s_nick, s.cc as s_cc, s.best, s.hidden as s_hidden,
           v.nick as v_nick, v.cc as v_cc, v.rp, v.hidden as v_hidden
    from auth.users u
    left join public.fw_scores s on s.player_id = u.id
    left join public.fw_versus v on v.player_id = u.id
    where (v_id is null or u.id = v_id)
      and (v_pat is null or s.nick ilike v_pat or v.nick ilike v_pat)
  )
  select jsonb_build_object('total', (select count(*) from m),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nick', coalesce(p.s_nick, p.v_nick), 'cc', coalesce(p.s_cc, p.v_cc),
                       'best', p.best, 'rp', p.rp, 'hidden', coalesce(p.s_hidden, false) or coalesce(p.v_hidden, false),
                       'guest', coalesce((p.uj ->> 'is_anonymous')::boolean, false), 'provider', p.uj -> 'raw_app_meta_data' -> 'provider',
                       'created_at', p.created_at, 'last_sign_in_at', p.uj -> 'last_sign_in_at',
                       'reports', (select count(*) from private.fw_reports r where r.target_id = p.id)) order by p.created_at desc, p.id), '[]'::jsonb)
             from (select * from m order by m.created_at desc, m.id limit v_lim offset v_off) p)) into v;
  return v;
end $$;

create or replace function private.fw_admin_player(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_owner boolean; v jsonb;
begin
  v_me := private.fw_admin_gate('mod');
  v_owner := private.fw_adm_is_owner(v_me);
  select jsonb_build_object('id', u.id, 'guest', coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false),
    'provider', to_jsonb(u) -> 'raw_app_meta_data' -> 'provider',
    'email', case when v_owner then to_jsonb(u) -> 'email' end,
    'created_at', u.created_at, 'last_sign_in_at', to_jsonb(u) -> 'last_sign_in_at',
    'tester', exists (select 1 from private.fw_testers t where t.player_id = u.id),
    'admin_role', case when v_owner then (select a.role from private.fw_admins a where a.user_id = u.id) end,
    'scores', (select jsonb_build_object('nick', s.nick, 'cc', s.cc, 'best', s.best, 'gates', s.gates, 'bird', s.bird, 'daily_key', s.daily_key,
                 'daily_score', s.daily_score, 'hidden', s.hidden, 'last_submit_at', s.last_submit_at) from public.fw_scores s where s.player_id = u.id),
    'versus', (select jsonb_build_object('nick', x.nick, 'rp', x.rp, 'wins', x.wins, 'losses', x.losses, 'draws', x.draws, 'hidden', x.hidden)
               from public.fw_versus x where x.player_id = u.id),
    'standings', (select coalesce(jsonb_agg(jsonb_build_object('season', t.season, 'rank', t.rank, 'rp', t.rp, 'tier', t.tier, 'claimed_at', t.claimed_at)
                    order by t.season desc), '[]'::jsonb) from public.fw_vs_standing t where t.player_id = u.id),
    'save', (select jsonb_build_object('rev', f.rev, 'updated_at', f.updated_at) from public.fw_saves f where f.player_id = u.id),
    'reports_received', (select coalesce(jsonb_agg(jsonb_build_object('reason', r.reason, 'place', r.place, 'nick', r.nick, 'seen', r.seen, 'at', r.at)
                           order by r.at desc, r.id desc), '[]'::jsonb)
                         from (select * from private.fw_reports r where r.target_id = u.id order by r.at desc, r.id desc limit 100) r),
    'reports_sent', (select count(*) from private.fw_reports r where r.reporter_id = u.id),
    'referrals', jsonb_build_object('invited', (select count(*) from private.fw_referrals r where r.inviter_id = u.id),
                   'held', (select count(*) from private.fw_referrals r where r.inviter_id = u.id and r.held)),
    'push_devices', (select count(*) from private.fw_push p where p.player_id = u.id),
    'events', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'kind', e.kind, 'props', e.props) order by e.at desc, e.id desc), '[]'::jsonb)
               from (select * from private.fw_events e where e.player_id = u.id order by e.at desc, e.id desc limit 20) e),
    'errors', (select coalesce(jsonb_agg(jsonb_build_object('at', e.at, 'build', e.build, 'msg', e.msg) order by e.at desc, e.id desc), '[]'::jsonb)
               from (select * from private.fw_client_errors e where e.player_id = u.id order by e.at desc, e.id desc limit 10) e))
  into v from auth.users u where u.id = p_id;
  if v is null then raise exception 'fw_bad_input: unknown player' using errcode = '22023'; end if;
  if v_owner then   -- the owner's view shows the e-mail: who looked at whom is logged
    insert into private.fw_admin_log (admin_id, action, target, detail) values (v_me, 'view_player', p_id, null);
  end if;
  return v;
end $$;

-- hide / unhide on both boards (the by-hand moderation of fw_scores / fw_versus)
create or replace function private.fw_admin_set_hidden(p_id uuid, p_hidden boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_s integer; v_v integer;
begin
  v_me := private.fw_admin_gate('mod');
  if p_id is null or p_hidden is null or not exists (select 1 from auth.users u where u.id = p_id) then
    raise exception 'fw_bad_input: unknown player or flag' using errcode = '22023';
  end if;
  if exists (select 1 from private.fw_admins a where a.user_id = p_id) and not private.fw_adm_is_owner(v_me) then
    raise exception 'fw_bad_input: only an owner can hide an admin' using errcode = '22023';
  end if;
  update public.fw_scores s set hidden = p_hidden where s.player_id = p_id;
  get diagnostics v_s = row_count;
  update public.fw_versus x set hidden = p_hidden where x.player_id = p_id;
  get diagnostics v_v = row_count;
  insert into private.fw_admin_log (admin_id, action, target, detail)
  values (v_me, case when p_hidden then 'hide' else 'unhide' end, p_id, jsonb_build_object('scores', v_s, 'versus', v_v));
  return jsonb_build_object('id', p_id, 'hidden', p_hidden);
end $$;

-- the name goes back to Pilot on the boards and in the latest archived season (the past-season board); no free renaming
create or replace function private.fw_admin_reset_nick(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_prev text;
begin
  v_me := private.fw_admin_gate('mod');
  if p_id is null or not exists (select 1 from auth.users u where u.id = p_id) then
    raise exception 'fw_bad_input: unknown player' using errcode = '22023';
  end if;
  if exists (select 1 from private.fw_admins a where a.user_id = p_id) and not private.fw_adm_is_owner(v_me) then
    raise exception 'fw_bad_input: only an owner can reset an admin''s name' using errcode = '22023';
  end if;
  v_prev := coalesce((select s.nick from public.fw_scores s where s.player_id = p_id), (select x.nick from public.fw_versus x where x.player_id = p_id));
  update public.fw_scores s set nick = 'Pilot' where s.player_id = p_id;
  update public.fw_versus x set nick = 'Pilot' where x.player_id = p_id;
  update public.fw_vs_standing t set nick = 'Pilot'
  where t.player_id = p_id and t.season in (select q.season from private.fw_vs_season q union select q.prev from private.fw_vs_season q);
  insert into private.fw_admin_log (admin_id, action, target, detail) values (v_me, 'reset_nick', p_id, jsonb_build_object('prev', v_prev));
  return jsonb_build_object('id', p_id, 'nick', 'Pilot');
end $$;

-- reports by target and reason, newest first. counted = the distinct reporters private.fw_report counts toward the auto-hide
-- (reason 'name', the name the server has now, seen = nick, a real account older than min_age_h with a best)
create or replace function private.fw_admin_reports(p_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lim integer; v_cfg jsonb; v jsonb;
begin
  perform private.fw_admin_gate('mod');
  v_lim := private.fw_adm_limit(p_limit, 100);
  v_cfg := private.fw_rpt_cfg();
  select coalesce(jsonb_agg(jsonb_build_object('target', g.target_id, 'nick', g.nick, 'reason', g.reason, 'n', g.n, 'counted', g.counted,
           'last', g.last, 'places', g.places, 'hidden', g.hidden) order by g.last desc, g.target_id, g.reason), '[]'::jsonb) into v
  from (select k.target_id, k.reason, k.n, k.last, k.places, k.nick, k.hidden,
               case when k.reason = 'name' and k.nick <> '' then
                 (select count(distinct r.reporter_id) from private.fw_reports r join auth.users u on u.id = r.reporter_id
                  where r.target_id = k.target_id and r.reason = 'name' and r.nick = k.nick and r.seen = r.nick
                    and not coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, false)
                    and u.created_at < now() - make_interval(hours => (v_cfg ->> 'min_age_h')::int)
                    and exists (select 1 from public.fw_scores s where s.player_id = r.reporter_id and s.best > 0))
               else 0 end as counted
        from (select r.target_id, r.reason, count(*) as n, max(r.at) as last, jsonb_agg(distinct r.place) as places,
                     coalesce((select s.nick from public.fw_scores s where s.player_id = r.target_id),
                              (select x.nick from public.fw_versus x where x.player_id = r.target_id), '') as nick,
                     coalesce((select s.hidden from public.fw_scores s where s.player_id = r.target_id), false)
                       or coalesce((select x.hidden from public.fw_versus x where x.player_id = r.target_id), false) as hidden
              from private.fw_reports r group by r.target_id, r.reason
              order by max(r.at) desc, r.target_id, r.reason limit v_lim) k) g;
  return v;
end $$;

create or replace function private.fw_admin_reports_clear(p_target uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_n integer;
begin
  v_me := private.fw_admin_gate('mod');
  if p_target is null or p_reason is null or p_reason not in ('name', 'cheat', 'other', 'all') then
    raise exception 'fw_bad_input: target or reason' using errcode = '22023';
  end if;
  delete from private.fw_reports r where r.target_id = p_target and (p_reason = 'all' or r.reason = p_reason);
  get diagnostics v_n = row_count;
  insert into private.fw_admin_log (admin_id, action, target, detail)
  values (v_me, 'reports_clear', p_target, jsonb_build_object('reason', p_reason, 'deleted', v_n));
  return jsonb_build_object('deleted', v_n);
end $$;

create or replace function private.fw_admin_testers() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.fw_admin_gate('owner');
  select coalesce(jsonb_agg(jsonb_build_object('id', t.player_id,
           'nick', coalesce((select s.nick from public.fw_scores s where s.player_id = t.player_id),
                            (select x.nick from public.fw_versus x where x.player_id = t.player_id)),
           'note', t.note, 'added_at', t.added_at) order by t.added_at desc, t.player_id), '[]'::jsonb) into v
  from private.fw_testers t;
  return v;
end $$;

create or replace function private.fw_admin_tester_set(p_id uuid, p_on boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_note text;
begin
  v_me := private.fw_admin_gate('owner');
  v_note := nullif(btrim(coalesce(p_note, '')), '');
  if p_id is null or p_on is null or char_length(v_note) > 100 or not exists (select 1 from auth.users u where u.id = p_id) then
    raise exception 'fw_bad_input: unknown player, flag or note' using errcode = '22023';
  end if;
  if p_on then
    insert into private.fw_testers (player_id, note) values (p_id, v_note)
    on conflict (player_id) do update set note = coalesce(excluded.note, private.fw_testers.note);
  else
    delete from private.fw_testers t where t.player_id = p_id;
  end if;
  insert into private.fw_admin_log (admin_id, action, target, detail)
  values (v_me, case when p_on then 'tester_on' else 'tester_off' end, p_id, jsonb_build_object('note', v_note));
  return jsonb_build_object('id', p_id, 'tester', p_on);
end $$;

create or replace function private.fw_admin_errors(p_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lim integer; v jsonb;
begin
  perform private.fw_admin_gate('mod');
  v_lim := private.fw_adm_limit(p_limit, 50);
  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'at', e.at, 'player_id', e.player_id, 'build', e.build, 'msg', e.msg,
           'stack', left(e.stack, 500), 'url', e.url, 'ua', e.ua) order by e.at desc, e.id desc), '[]'::jsonb) into v
  from (select * from private.fw_client_errors e order by e.at desc, e.id desc limit v_lim) e;
  return v;
end $$;

-- invites held for review (the burst rule of fw_referral_link), by inviter
create or replace function private.fw_admin_referrals_held() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  perform private.fw_admin_gate('owner');
  select coalesce(jsonb_agg(jsonb_build_object('invitee', r.invitee_id, 'inviter', r.inviter_id,
           'inviter_nick', (select s.nick from public.fw_scores s where s.player_id = r.inviter_id),
           'invitee_nick', si.nick, 'invitee_best', si.best, 'linked_at', r.linked_at, 'days', r.days, 'stage', r.stage)
           order by r.inviter_id, r.linked_at, r.invitee_id), '[]'::jsonb) into v
  from private.fw_referrals r left join public.fw_scores si on si.player_id = r.invitee_id
  where r.held;
  return v;
end $$;

create or replace function private.fw_admin_referral_release(p_inviter uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_n integer;
begin
  v_me := private.fw_admin_gate('owner');
  if p_inviter is null then raise exception 'fw_bad_input: inviter' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_inviter::text, 3));   -- the inviter's referral writes (fw_referral_claim takes the same lock)
  update private.fw_referrals r set held = false where r.inviter_id = p_inviter and r.held;
  get diagnostics v_n = row_count;
  insert into private.fw_admin_log (admin_id, action, target, detail) values (v_me, 'ref_release', p_inviter, jsonb_build_object('released', v_n));
  return jsonb_build_object('released', v_n);
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

-- the season gate by hand: rolls over when the month has changed (as the pg_cron job does), otherwise does nothing
create or replace function private.fw_admin_season_tick() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_season integer;
begin
  v_me := private.fw_admin_gate('owner');
  v_season := private.fw_vs_tick();
  insert into private.fw_admin_log (admin_id, action, target, detail) values (v_me, 'season_tick', null, jsonb_build_object('season', v_season));
  return jsonb_build_object('season', v_season);
end $$;

-- deletes the account (every game row goes with it, see ACCOUNT DELETION). The page makes the operator type the id again,
-- and so does this: p_confirm must be p_id as text. Never yourself, never an admin (remove the fw_admins row by hand first).
create or replace function private.fw_admin_delete_player(p_id uuid, p_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me uuid; v_nick text; v_done boolean;
begin
  v_me := private.fw_admin_gate('owner');
  if p_id is null or p_confirm is distinct from p_id::text then
    raise exception 'fw_bad_input: the confirmation does not match the id' using errcode = '22023';
  end if;
  if p_id = v_me then raise exception 'fw_bad_input: you cannot delete yourself' using errcode = '22023'; end if;
  if exists (select 1 from private.fw_admins a where a.user_id = p_id) then
    raise exception 'fw_bad_input: an admin account cannot be deleted here' using errcode = '22023';
  end if;
  v_nick := coalesce((select s.nick from public.fw_scores s where s.player_id = p_id), (select x.nick from public.fw_versus x where x.player_id = p_id));
  delete from auth.users u where u.id = p_id;
  v_done := found;
  insert into private.fw_admin_log (admin_id, action, target, detail)
  values (v_me, 'delete_player', p_id, jsonb_build_object('nick', v_nick, 'deleted', v_done));
  return jsonb_build_object('deleted', v_done);
end $$;

create or replace function private.fw_admin_log(p_limit integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lim integer; v jsonb;
begin
  perform private.fw_admin_gate('owner');
  v_lim := private.fw_adm_limit(p_limit, 100);
  select coalesce(jsonb_agg(jsonb_build_object('at', l.at, 'admin_id', l.admin_id,
           'admin_nick', coalesce((select s.nick from public.fw_scores s where s.player_id = l.admin_id),
                                  (select a.note from private.fw_admins a where a.user_id = l.admin_id)),
           'action', l.action, 'target', l.target, 'detail', l.detail) order by l.id desc), '[]'::jsonb) into v
  from (select * from private.fw_admin_log l order by l.id desc limit v_lim) l;
  return v;
end $$;

create or replace function public.admin_me() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_me(); $$;
create or replace function public.admin_overview() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_overview(); $$;
create or replace function public.admin_kpi(p_days integer default 30) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_kpi(p_days); $$;
create or replace function public.admin_players(p_q text default null, p_limit integer default 50, p_offset integer default 0) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_players(p_q, p_limit, p_offset); $$;
create or replace function public.admin_player(p_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_player(p_id); $$;
create or replace function public.admin_set_hidden(p_id uuid, p_hidden boolean) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_set_hidden(p_id, p_hidden); $$;
create or replace function public.admin_reset_nick(p_id uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_reset_nick(p_id); $$;
create or replace function public.admin_reports(p_limit integer default 100) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_reports(p_limit); $$;
create or replace function public.admin_reports_clear(p_target uuid, p_reason text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_reports_clear(p_target, p_reason); $$;
create or replace function public.admin_testers() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_testers(); $$;
create or replace function public.admin_tester_set(p_id uuid, p_on boolean, p_note text default null) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_tester_set(p_id, p_on, p_note); $$;
create or replace function public.admin_errors(p_limit integer default 50) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_errors(p_limit); $$;
create or replace function public.admin_referrals_held() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_referrals_held(); $$;
create or replace function public.admin_referral_release(p_inviter uuid) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_referral_release(p_inviter); $$;
create or replace function public.admin_season() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_season(); $$;
create or replace function public.admin_season_tick() returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_season_tick(); $$;
create or replace function public.admin_delete_player(p_id uuid, p_confirm text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_delete_player(p_id, p_confirm); $$;
create or replace function public.admin_log(p_limit integer default 100) returns jsonb
language sql security invoker set search_path = '' as $$ select private.fw_admin_log(p_limit); $$;

revoke all on function private.fw_admin_gate(text)          from public, anon, authenticated;
revoke all on function private.fw_adm_limit(integer, integer) from public, anon, authenticated;
revoke all on function private.fw_adm_is_owner(uuid)         from public, anon, authenticated;
-- the invoker wrappers run their private function as the caller, so it needs execute; the gate inside decides
revoke all on function private.fw_admin_me()                              from public, anon;
revoke all on function private.fw_admin_overview()                        from public, anon;
revoke all on function private.fw_admin_kpi(integer)                      from public, anon;
revoke all on function private.fw_admin_players(text, integer, integer)   from public, anon;
revoke all on function private.fw_admin_player(uuid)                      from public, anon;
revoke all on function private.fw_admin_set_hidden(uuid, boolean)         from public, anon;
revoke all on function private.fw_admin_reset_nick(uuid)                  from public, anon;
revoke all on function private.fw_admin_reports(integer)                  from public, anon;
revoke all on function private.fw_admin_reports_clear(uuid, text)         from public, anon;
revoke all on function private.fw_admin_testers()                         from public, anon;
revoke all on function private.fw_admin_tester_set(uuid, boolean, text)   from public, anon;
revoke all on function private.fw_admin_errors(integer)                   from public, anon;
revoke all on function private.fw_admin_referrals_held()                  from public, anon;
revoke all on function private.fw_admin_referral_release(uuid)            from public, anon;
revoke all on function private.fw_admin_season()                          from public, anon;
revoke all on function private.fw_admin_season_tick()                     from public, anon;
revoke all on function private.fw_admin_delete_player(uuid, text)         from public, anon;
revoke all on function private.fw_admin_log(integer)                      from public, anon;
grant execute on function private.fw_admin_me()                             to authenticated, service_role;
grant execute on function private.fw_admin_overview()                       to authenticated, service_role;
grant execute on function private.fw_admin_kpi(integer)                     to authenticated, service_role;
grant execute on function private.fw_admin_players(text, integer, integer)  to authenticated, service_role;
grant execute on function private.fw_admin_player(uuid)                     to authenticated, service_role;
grant execute on function private.fw_admin_set_hidden(uuid, boolean)        to authenticated, service_role;
grant execute on function private.fw_admin_reset_nick(uuid)                 to authenticated, service_role;
grant execute on function private.fw_admin_reports(integer)                 to authenticated, service_role;
grant execute on function private.fw_admin_reports_clear(uuid, text)        to authenticated, service_role;
grant execute on function private.fw_admin_testers()                        to authenticated, service_role;
grant execute on function private.fw_admin_tester_set(uuid, boolean, text)  to authenticated, service_role;
grant execute on function private.fw_admin_errors(integer)                  to authenticated, service_role;
grant execute on function private.fw_admin_referrals_held()                 to authenticated, service_role;
grant execute on function private.fw_admin_referral_release(uuid)           to authenticated, service_role;
grant execute on function private.fw_admin_season()                         to authenticated, service_role;
grant execute on function private.fw_admin_season_tick()                    to authenticated, service_role;
grant execute on function private.fw_admin_delete_player(uuid, text)        to authenticated, service_role;
grant execute on function private.fw_admin_log(integer)                     to authenticated, service_role;
revoke all on function public.admin_me()                             from public, anon;
revoke all on function public.admin_overview()                       from public, anon;
revoke all on function public.admin_kpi(integer)                     from public, anon;
revoke all on function public.admin_players(text, integer, integer)  from public, anon;
revoke all on function public.admin_player(uuid)                     from public, anon;
revoke all on function public.admin_set_hidden(uuid, boolean)        from public, anon;
revoke all on function public.admin_reset_nick(uuid)                 from public, anon;
revoke all on function public.admin_reports(integer)                 from public, anon;
revoke all on function public.admin_reports_clear(uuid, text)        from public, anon;
revoke all on function public.admin_testers()                        from public, anon;
revoke all on function public.admin_tester_set(uuid, boolean, text)  from public, anon;
revoke all on function public.admin_errors(integer)                  from public, anon;
revoke all on function public.admin_referrals_held()                 from public, anon;
revoke all on function public.admin_referral_release(uuid)           from public, anon;
revoke all on function public.admin_season()                         from public, anon;
revoke all on function public.admin_season_tick()                    from public, anon;
revoke all on function public.admin_delete_player(uuid, text)        from public, anon;
revoke all on function public.admin_log(integer)                     from public, anon;
grant execute on function public.admin_me()                             to authenticated;
grant execute on function public.admin_overview()                       to authenticated;
grant execute on function public.admin_kpi(integer)                     to authenticated;
grant execute on function public.admin_players(text, integer, integer)  to authenticated;
grant execute on function public.admin_player(uuid)                     to authenticated;
grant execute on function public.admin_set_hidden(uuid, boolean)        to authenticated;
grant execute on function public.admin_reset_nick(uuid)                 to authenticated;
grant execute on function public.admin_reports(integer)                 to authenticated;
grant execute on function public.admin_reports_clear(uuid, text)        to authenticated;
grant execute on function public.admin_testers()                        to authenticated;
grant execute on function public.admin_tester_set(uuid, boolean, text)  to authenticated;
grant execute on function public.admin_errors(integer)                  to authenticated;
grant execute on function public.admin_referrals_held()                 to authenticated;
grant execute on function public.admin_referral_release(uuid)           to authenticated;
grant execute on function public.admin_season()                         to authenticated;
grant execute on function public.admin_season_tick()                    to authenticated;
grant execute on function public.admin_delete_player(uuid, text)        to authenticated;
grant execute on function public.admin_log(integer)                     to authenticated;
