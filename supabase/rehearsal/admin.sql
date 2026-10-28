-- Admin rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/admin.sql).
-- Calls every public.admin_* AS THE API ROLE (set role authenticated, the caller in request.jwt.claim.sub and request.jwt.claims)
-- as nobody, a guest (auth.users.is_anonymous), a guest by its token (the is_anonymous claim), a plain signed-in player, a mod,
-- a mod and an owner without a second factor (aal1: 'fw_admin_mfa' on every function they hold, 2026-10-28) and an owner with one (aal2), and checks that each is allowed or refused ('fw_admin: not allowed', 42501) exactly as docs/admin.md's table
-- says, that admin_me never raises, and that a refused call writes nothing. Then the effects: hide / unhide on both boards, the
-- name reset, the report groups and their auto-hide count, clearing reports, testers, the held referrals, the season, KPIs, the
-- input checks (fw_bad_input), account deletion (confirmation, yourself, another admin, the cascade) and the audit log rows
-- (fw_admin_log) every write leaves. Setup and the checks of stored rows are done as the database owner.
\set ON_ERROR_STOP on
\pset footer off

create function pg_temp.u(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
-- the caller of the next calls (local to the transaction, i.e. the do block)
create function pg_temp.who(p_sub uuid, p_claims jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_sub::text, ''), true);
  perform set_config('request.jwt.claims', coalesce(p_claims::text, ''), true);
end $$;
-- one call: 'ok:<answer>', 'refused' (the gate) or 'err:<sqlstate>:<message>'
create function pg_temp.try(p_call text) returns text language plpgsql as $$
declare r jsonb;
begin
  execute 'select public.' || p_call into r;
  return 'ok:' || coalesce(r::text, 'null');
exception when others then
  if sqlstate = '42501' and sqlerrm = 'fw_admin: not allowed' then return 'refused'; end if;
  if sqlstate = '42501' and sqlerrm = 'fw_admin_mfa: second factor required' then return 'mfa'; end if;
  return 'err:' || sqlstate || ':' || sqlerrm;
end $$;
create function pg_temp.q(p_call text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  execute 'select public.' || p_call into r;
  return r;
end $$;
create function pg_temp.bad(p_call text) returns boolean language sql as $$ select pg_temp.try(p_call) like 'err:22023:fw_bad_input%' $$;
grant execute on function pg_temp.u(text), pg_temp.who(uuid, jsonb), pg_temp.try(text), pg_temp.q(text), pg_temp.bad(text) to authenticated;

-- O owner, M mod, N a plain signed-in player, G a guest with a mod row (by auth.users), J a guest with a mod row (by its token)
\echo === against the bare stub (auth.users without is_anonymous / email): the gate and the reads still work ===
insert into auth.users (id, created_at) values (pg_temp.u('a1'), now() - interval '30 days');
insert into private.fw_admins (user_id, role, note) values (pg_temp.u('a1'), 'owner', '대표');
set role authenticated;
do $$
declare r jsonb;
begin
  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal2"}');
  r := pg_temp.q('admin_me()');
  if r <> '{"admin": true, "role": "owner", "aal": "aal2"}' then raise exception 'admin_me on the bare stub: %', r; end if;
  r := pg_temp.q(format('admin_player(%L)', pg_temp.u('a1')));
  if (r ->> 'guest')::boolean or r -> 'email' <> 'null' or r ->> 'admin_role' <> 'owner' then raise exception 'admin_player on the bare stub: %', r; end if;
  if (pg_temp.q('admin_overview()') #>> '{users,total}')::int <> 1 then raise exception 'overview on the bare stub'; end if;
end $$;
reset role;

-- the columns Supabase's auth.users has and the stub does not
alter table auth.users add column if not exists is_anonymous boolean not null default false;
alter table auth.users add column if not exists email text;
alter table auth.users add column if not exists raw_app_meta_data jsonb;
alter table auth.users add column if not exists last_sign_in_at timestamptz;
update auth.users set email = 'owner@example.com', raw_app_meta_data = '{"provider": "google"}' where id = pg_temp.u('a1');
insert into auth.users (id, created_at, email, is_anonymous) values
  (pg_temp.u('a2'), now() - interval '30 days', 'mod@example.com', false),
  (pg_temp.u('a3'), now() - interval '30 days', 'user@example.com', false),
  (pg_temp.u('a4'), now() - interval '30 days', null, true),
  (pg_temp.u('a5'), now() - interval '30 days', null, false);
insert into private.fw_admins (user_id, role, note) values (pg_temp.u('a2'), 'mod', 'mod'), (pg_temp.u('a4'), 'mod', 'guest'), (pg_temp.u('a5'), 'mod', 'token');
-- P the player under review, X the matrix's target, D the account to delete, Q a hidden versus player,
-- c1..c3 old reporters with a best, c4 a guest reporter, c5 a fresh reporter, d1 an inviter with d2, d3 held and d4 not
insert into auth.users (id, created_at, email, raw_app_meta_data, last_sign_in_at) values
  (pg_temp.u('b1'), now() - interval '20 days', 'p@example.com', '{"provider": "apple"}', now()),
  (pg_temp.u('b2'), now() - interval '20 days', null, null, null),
  (pg_temp.u('b3'), now() - interval '20 days', 'd@example.com', '{"provider": "email"}', null),
  (pg_temp.u('b4'), now() - interval '20 days', null, null, null);
insert into auth.users (id, created_at) select pg_temp.u('c' || g), now() - interval '9 days' from generate_series(1, 3) g;
insert into auth.users (id, created_at, is_anonymous) values (pg_temp.u('c4'), now() - interval '9 days', true), (pg_temp.u('c5'), now(), false);
insert into auth.users (id, created_at) select pg_temp.u('d' || g), now() - interval '5 days' from generate_series(1, 4) g;
insert into public.fw_scores (player_id, nick, best, hidden) values
  (pg_temp.u('b1'), 'BadName', 50, false), (pg_temp.u('b2'), 'Target', 5, false), (pg_temp.u('b3'), 'Doomed', 7, false),
  (pg_temp.u('a2'), 'Moddy', 3, false), (pg_temp.u('c4'), 'Guest', 10, false), (pg_temp.u('c5'), 'Fresh', 10, false),
  (pg_temp.u('d1'), 'Inviter', 9, false), (pg_temp.u('d2'), 'Friend2', 40, false);
insert into public.fw_scores (player_id, nick, best) select pg_temp.u('c' || g), 'R' || g, 10 + g from generate_series(1, 3) g;
insert into public.fw_versus (player_id, nick, rp, wins, losses) values
  (pg_temp.u('b1'), 'BadName', 100, 2, 0), (pg_temp.u('b3'), 'Doomed', 50, 1, 0), (pg_temp.u('b4'), 'Shady', 900, 9, 0);
update public.fw_versus set hidden = true where player_id = pg_temp.u('b4');
update private.fw_vs_season set prev = 202609, rolled_at = now() - interval '21 days';
insert into public.fw_vs_standing (season, player_id, rank, rp, tier, wins, losses, draws, matches, nick, cc, bird) values
  (202609, pg_temp.u('b1'), 1, 600, 1, 12, 0, 0, 12, 'BadName', '', 'volt'),
  (202608, pg_temp.u('b1'), 1, 500, 1, 10, 0, 0, 10, 'BadName', '', 'volt'),
  (202609, pg_temp.u('b3'), 2, 400, 1, 10, 2, 0, 12, 'Doomed', '', 'volt');
insert into private.fw_reports (reporter_id, target_id, nick, seen, reason, place) values
  (pg_temp.u('c1'), pg_temp.u('b1'), 'BadName', 'BadName', 'name', 'board'),     -- counts
  (pg_temp.u('c2'), pg_temp.u('b1'), 'BadName', 'BadName', 'name', 'versus'),    -- counts
  (pg_temp.u('c4'), pg_temp.u('b1'), 'BadName', 'BadName', 'name', 'board'),     -- a guest: does not count
  (pg_temp.u('c5'), pg_temp.u('b1'), 'BadName', 'BadName', 'name', 'friend'),    -- a fresh account: does not count
  (pg_temp.u('c3'), pg_temp.u('b1'), 'BadName', 'Other', 'name', 'versus'),      -- impersonation (saw another name): does not count
  (pg_temp.u('c3'), pg_temp.u('b1'), 'BadName', 'BadName', 'cheat', 'versus'),
  (pg_temp.u('c1'), pg_temp.u('b3'), 'Doomed', 'Doomed', 'other', 'board'),
  (pg_temp.u('b3'), pg_temp.u('c1'), 'R1', 'R1', 'other', 'board');            -- sent by D: goes with D
insert into private.fw_testers (player_id, note) values (pg_temp.u('b3'), 'doomed tester');
insert into private.fw_push (token, player_id) values (repeat('ab', 32), pg_temp.u('b3'));
insert into private.fw_events (player_id, kind, session, props) values
  (pg_temp.u('b3'), 'first_open', 'aaaaaaaaaaaaaaaa', null), (pg_temp.u('b3'), 'session_start', 'aaaaaaaaaaaaaaaa', null),
  (pg_temp.u('b3'), 'run_end', 'aaaaaaaaaaaaaaaa', '{"score": 7}'), (pg_temp.u('b3'), 'session_end', 'aaaaaaaaaaaaaaaa', '{"dur": 120}');
insert into private.fw_client_errors (player_id, build, msg, stack) values (pg_temp.u('b3'), 'L1', 'TypeError: x', repeat('s', 900));
insert into private.fw_referrals (invitee_id, inviter_id, days, stage, held) values
  (pg_temp.u('d2'), pg_temp.u('d1'), 2, 8, true), (pg_temp.u('d3'), pg_temp.u('d1'), 1, 3, true), (pg_temp.u('d4'), pg_temp.u('d1'), 0, 1, false);

\echo === the matrix: every function as nobody, a guest, a guest by token, a player, a mod on aal1 and aal2, an owner on aal1 and an owner on aal2 ===
set role authenticated;
do $$
declare
  w record; c record; got text; want text; me jsonb;
  x constant text := pg_temp.u('b2')::text;
begin
  for w in select * from (values
      ('nobody',    null::uuid,      null::jsonb,                    0, null::text),
      ('guest',     pg_temp.u('a4'), '{}'::jsonb,                    0, null),
      ('guest_jwt', pg_temp.u('a5'), '{"is_anonymous": true}'::jsonb, 0, null),
      ('player',    pg_temp.u('a3'), '{"is_anonymous": false}'::jsonb, 0, null),
      ('mod_aal1',  pg_temp.u('a2'), '{"aal": "aal1"}'::jsonb,       0, 'mod'),
      ('mod',       pg_temp.u('a2'), '{"aal": "aal2"}'::jsonb,       1, 'mod'),
      ('owner_aal1', pg_temp.u('a1'), '{"aal": "aal1"}'::jsonb,      0, 'owner'),
      ('owner',     pg_temp.u('a1'), '{"aal": "aal2"}'::jsonb,       2, 'owner')) v(label, sub, claims, lvl, role) loop
    perform pg_temp.who(w.sub, w.claims);
    for c in select * from (values
        ('admin_overview()', 1), ('admin_kpi(30)', 1), ('admin_players(null, 10, 0)', 1), (format('admin_player(%L)', x), 1),
        (format('admin_set_hidden(%L, false)', x), 1), (format('admin_reset_nick(%L)', x), 1), ('admin_reports(10)', 1),
        (format('admin_reports_clear(%L, ''all'')', x), 1), ('admin_errors(10)', 1), ('admin_season()', 1),
        ('admin_testers()', 2), (format('admin_tester_set(%L, false, null)', x), 2), ('admin_referrals_held()', 2),
        (format('admin_referral_release(%L)', x), 2), ('admin_season_tick()', 2), (format('admin_delete_player(%L, ''nope'')', x), 2),
        ('admin_log(10)', 2)) f(call, need) loop
      got := pg_temp.try(c.call);
      if w.lvl < c.need then
        -- aal1: fw_admin_mfa on every function the role holds (a mod on an owner function: refused by role first)
        want := case when w.label = 'owner_aal1' or (w.label = 'mod_aal1' and c.need = 1) then 'mfa' else 'refused' end;
        if got <> want then raise exception '% calling %: must be refused (%), got %', w.label, c.call, want, got; end if;
      elsif c.call like 'admin_delete_player%' then
        if got not like 'err:22023:fw_bad_input%' then raise exception '% calling %: past the gate to the confirmation check, got %', w.label, c.call, got; end if;
      elsif got not like 'ok:%' then
        raise exception '% calling %: must be allowed, got %', w.label, c.call, got;
      end if;
    end loop;
    me := pg_temp.q('admin_me()');   -- never raises
    if me <> jsonb_build_object('admin', w.role is not null, 'role', w.role, 'aal', w.claims ->> 'aal') then raise exception 'admin_me as %: %', w.label, me; end if;
  end loop;
  -- the private functions are reachable by the API role (the wrappers need that) but the gate is inside them
  perform pg_temp.who(pg_temp.u('a3'), '{}');
  begin
    perform private.fw_admin_overview();
    raise exception 'a player calling the private function directly must be refused';
  exception when insufficient_privilege then
    if sqlerrm <> 'fw_admin: not allowed' then raise; end if;
  end;
end $$;
reset role;
do $$
begin
  if (select count(*) from private.fw_admin_log where admin_id = pg_temp.u('a2')) <> 3 then raise exception 'mod: 3 writes logged (hide, name, reports)'; end if;
  if (select count(*) from private.fw_admin_log where admin_id = pg_temp.u('a1')) <> 8 then
    raise exception 'owner: 8 rows (bare-stub view, 7 on aal2 incl. view_player; the refused delete and every aal1 call are not logged)';
  end if;
  if (select count(*) from private.fw_admin_log where action = 'view_player' and admin_id = pg_temp.u('a1') and target = pg_temp.u('b2')) <> 1 then raise exception 'only the aal2 owner view of X is logged'; end if;
  if exists (select 1 from private.fw_admin_log where admin_id not in (pg_temp.u('a1'), pg_temp.u('a2'))) then raise exception 'a refused call wrote the log'; end if;
  if not exists (select 1 from auth.users where id = pg_temp.u('b2')) then raise exception 'X must still exist'; end if;
end $$;

\echo === reads: overview, players, player (e-mail for owners only), KPIs, errors ===
set role authenticated;
do $$
declare r jsonb; ok boolean; P constant uuid := pg_temp.u('b1');
begin
  perform pg_temp.who(pg_temp.u('a2'), '{"aal": "aal2"}');
  r := pg_temp.q('admin_overview()');
  if r -> 'cron' <> '[]' then raise exception 'without pg_cron, cron is []: %', r -> 'cron'; end if;
  if (r #>> '{users,guests}')::int <> 2 or (r #>> '{users,total}')::int <> (r #>> '{users,guests}')::int + (r #>> '{users,signed_in}')::int then raise exception 'users: %', r -> 'users'; end if;
  if (r #>> '{admins,count}')::int <> 4 or (r #>> '{testers,count}')::int <> 1 or (r #>> '{push,devices}')::int <> 1 then raise exception 'counts: %', r; end if;
  if (r #>> '{players,hidden}')::int <> 1 or (r #>> '{reports,open_targets}')::int <> 3 or (r #>> '{season,prev}')::int <> 202609 then raise exception 'players / reports / season: %', r; end if;
  if (r #>> '{errors,last_1d}')::int <> 1 then raise exception 'errors: %', r -> 'errors'; end if;

  r := pg_temp.q('admin_players(''adn'', 50, 0)');
  if (r ->> 'total')::int <> 1 or r #>> '{rows,0,id}' <> P::text or (r #>> '{rows,0,reports}')::int <> 6 or r #>> '{rows,0,provider}' <> 'apple'
     or (r #>> '{rows,0,rp}')::int <> 100 or (r #>> '{rows,0,guest}')::boolean or r #>> '{rows,0,last_sign_in_at}' is null then
    raise exception 'a part of a name finds P: %', r;
  end if;
  r := pg_temp.q(format('admin_players(%L, 50, 0)', upper(P::text)));
  if (r ->> 'total')::int <> 1 or r #>> '{rows,0,nick}' <> 'BadName' then raise exception 'a uuid finds exactly that account: %', r; end if;
  if (pg_temp.q('admin_players(''%'', 50, 0)') ->> 'total')::int <> 0 then raise exception '%% is a character, not a wildcard'; end if;
  r := pg_temp.q('admin_players()');
  if (r ->> 'total')::int <> 18 or (r ->> 'total')::int <> jsonb_array_length(r -> 'rows') or (r #>> '{rows,0,created_at}')::timestamptz < now() - interval '1 minute' then
    raise exception 'an empty query lists every account, newest first: %', r ->> 'total';
  end if;
  if pg_temp.q('admin_players('''', 50, 0)') <> r or pg_temp.q('admin_players(''   '', 50, 0)') <> r then raise exception 'an empty or blank query is the same as none (the page sends '''')'; end if;
  if (pg_temp.q('admin_players(''  adn '', 50, 0)') ->> 'total')::int <> 1 then raise exception 'the query is trimmed'; end if;
  if (pg_temp.q('admin_players(null, 2, 1)') -> 'rows') -> 1 is null then raise exception 'limit and offset page the list'; end if;
  if not pg_temp.bad('admin_players(null, 201, 0)') or not pg_temp.bad('admin_players(null, 0, 0)') or not pg_temp.bad('admin_players(null, 10, -1)')
     or not pg_temp.bad(format('admin_players(%L, 10, 0)', repeat('x', 65))) then raise exception 'players input checks must answer fw_bad_input'; end if;

  r := pg_temp.q(format('admin_player(%L)', P));
  if r -> 'email' <> 'null' then raise exception 'a mod never sees the e-mail: %', r -> 'email'; end if;
  if r #>> '{scores,nick}' <> 'BadName' or (r #>> '{versus,rp}')::int <> 100 or jsonb_array_length(r -> 'standings') <> 2
     or jsonb_array_length(r -> 'reports_received') <> 6 or (r ->> 'reports_sent')::int <> 0 or r -> 'save' <> 'null'
     or r ->> 'provider' <> 'apple' or (r ->> 'tester')::boolean or r -> 'admin_role' <> 'null' then raise exception 'admin_player P: %', r; end if;
  r := pg_temp.q(format('admin_player(%L)', pg_temp.u('b3')));
  if jsonb_array_length(r -> 'events') <> 4 or jsonb_array_length(r -> 'errors') <> 1 or (r ->> 'push_devices')::int <> 1 or not (r ->> 'tester')::boolean
     or (r ->> 'reports_sent')::int <> 1 or r -> 'versus' = 'null' then raise exception 'admin_player D: %', r; end if;
  r := pg_temp.q(format('admin_player(%L)', pg_temp.u('d1')));
  if r -> 'referrals' <> '{"invited": 3, "held": 2}' or r -> 'versus' <> 'null' then raise exception 'admin_player inviter: %', r; end if;
  if not pg_temp.bad(format('admin_player(%L)', gen_random_uuid())) then raise exception 'an unknown id is fw_bad_input'; end if;
  if pg_temp.q(format('admin_player(%L)', pg_temp.u('a1'))) -> 'admin_role' <> 'null' then raise exception 'a mod is not told who the admins are'; end if;
  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal1"}');
  if pg_temp.try(format('admin_player(%L)', P)) <> 'mfa' then raise exception 'an owner without a second factor reads nothing (fw_admin_mfa)'; end if;
  perform pg_temp.who(pg_temp.u('a2'), '{}');
  if pg_temp.try(format('admin_player(%L)', P)) <> 'mfa' then raise exception 'a mod without a second factor reads nothing (fw_admin_mfa)'; end if;
  perform pg_temp.who(pg_temp.u('a2'), '{"aal": "aal2"}');

  r := pg_temp.q('admin_errors(5)');
  if jsonb_array_length(r) <> 1 or char_length(r -> 0 ->> 'stack') <> 500 or r -> 0 ->> 'msg' <> 'TypeError: x' then raise exception 'errors: %', r; end if;
  if not pg_temp.bad('admin_errors(0)') or not pg_temp.bad('admin_errors(201)') then raise exception 'errors limit'; end if;

  r := pg_temp.q('admin_kpi(7)');
  if r #>> '{installs,0,day}' <> (now() at time zone 'Asia/Seoul')::date::text or (r #>> '{installs,0,installs}')::int <> 1 then raise exception 'installs: %', r -> 'installs'; end if;
  if r #> '{retention,0,d1}' <> 'null' or (r #>> '{retention,0,installs}')::int <> 1 then raise exception 'a day that has not ended shows null: %', r -> 'retention'; end if;
  if (r #>> '{daily,0,dau}')::int <> 1 or (r #>> '{daily,0,runs_per_dau}')::numeric <> 1 then raise exception 'daily: %', r -> 'daily'; end if;
  if (r #>> '{sessions,0,sessions}')::int <> 1 or (r #>> '{sessions,0,avg_min}')::numeric <> 2 then raise exception 'sessions: %', r -> 'sessions'; end if;
  if pg_temp.q('admin_kpi()') is null then raise exception 'p_days defaults to 30'; end if;
  if not pg_temp.bad('admin_kpi(0)') or not pg_temp.bad('admin_kpi(121)') then raise exception 'kpi days 1..120'; end if;

  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal2"}');
  if pg_temp.q(format('admin_player(%L)', P)) ->> 'email' <> 'p@example.com' then raise exception 'an owner sees the e-mail'; end if;
  if pg_temp.q(format('admin_player(%L)', pg_temp.u('a2'))) ->> 'admin_role' <> 'mod' then raise exception 'an owner sees admin roles'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from private.fw_admin_log where action = 'view_player' and target = pg_temp.u('b1') and admin_id = pg_temp.u('a1')) <> 1 then raise exception 'the owner''s view of P is logged once'; end if;
  if exists (select 1 from private.fw_admin_log where action = 'view_player' and admin_id = pg_temp.u('a2')) then raise exception 'a mod''s read is not logged'; end if;
end $$;

\echo === reports: groups, the auto-hide count, then the name reset (counted follows the name) and clearing ===
set role authenticated;
do $$
declare r jsonb; g jsonb; P constant uuid := pg_temp.u('b1');
begin
  perform pg_temp.who(pg_temp.u('a2'), '{"aal": "aal2"}');
  r := pg_temp.q('admin_reports()');
  select e into g from jsonb_array_elements(r) e where e ->> 'target' = P::text and e ->> 'reason' = 'name';
  if (g ->> 'n')::int <> 5 or (g ->> 'counted')::int <> 2 or g ->> 'nick' <> 'BadName' or (g ->> 'hidden')::boolean
     or g -> 'places' <> '["board", "friend", "versus"]' then raise exception 'name group: %', g; end if;
  select e into g from jsonb_array_elements(r) e where e ->> 'target' = P::text and e ->> 'reason' = 'cheat';
  if (g ->> 'n')::int <> 1 or (g ->> 'counted')::int <> 0 then raise exception 'cheat group: %', g; end if;
  if jsonb_array_length(pg_temp.q('admin_reports(1)')) <> 1 or not pg_temp.bad('admin_reports(201)') then raise exception 'reports limit'; end if;

  r := pg_temp.q(format('admin_reset_nick(%L)', P));
  if r <> jsonb_build_object('id', P, 'nick', 'Pilot') then raise exception 'reset_nick answer: %', r; end if;
  select e into g from jsonb_array_elements(pg_temp.q('admin_reports()')) e where e ->> 'target' = P::text and e ->> 'reason' = 'name';
  if (g ->> 'counted')::int <> 0 or g ->> 'nick' <> 'Pilot' then raise exception 'a new name starts from zero: %', g; end if;

  if not pg_temp.bad(format('admin_reports_clear(%L, ''rude'')', P)) or not pg_temp.bad('admin_reports_clear(null, ''all'')') then raise exception 'clear input checks'; end if;
  if pg_temp.q(format('admin_reports_clear(%L, ''cheat'')', P)) <> '{"deleted": 1}' then raise exception 'clear cheat'; end if;
  if pg_temp.q(format('admin_reports_clear(%L, ''all'')', P)) <> '{"deleted": 5}' then raise exception 'clear all'; end if;
  if pg_temp.q(format('admin_reports_clear(%L, ''all'')', P)) <> '{"deleted": 0}' then raise exception 'clear again: nothing left'; end if;
  if not pg_temp.bad(format('admin_reset_nick(%L)', gen_random_uuid())) then raise exception 'reset_nick of an unknown id'; end if;
end $$;
reset role;
do $$
declare P constant uuid := pg_temp.u('b1');
begin
  if (select nick from public.fw_scores where player_id = P) <> 'Pilot' or (select nick from public.fw_versus where player_id = P) <> 'Pilot' then raise exception 'reset_nick: boards'; end if;
  if (select nick from public.fw_vs_standing where player_id = P and season = 202609) <> 'Pilot' then raise exception 'reset_nick: the latest archived season'; end if;
  if (select nick from public.fw_vs_standing where player_id = P and season = 202608) <> 'BadName' then raise exception 'reset_nick: older seasons stay'; end if;
  if (select detail ->> 'prev' from private.fw_admin_log where action = 'reset_nick' and target = P) <> 'BadName' then raise exception 'reset_nick log keeps the old name'; end if;
  if exists (select 1 from private.fw_reports where target_id = P) then raise exception 'reports of P cleared'; end if;
  if (select count(*) from private.fw_admin_log where action = 'reports_clear' and target = P) <> 3 then raise exception 'each clear is logged'; end if;
  if (select detail from private.fw_admin_log where action = 'reports_clear' and target = P order by id limit 1) <> '{"reason": "cheat", "deleted": 1}' then raise exception 'clear detail'; end if;
end $$;

\echo === hide / unhide on both boards ===
set role authenticated;
do $$
declare P constant uuid := pg_temp.u('b1');
begin
  perform pg_temp.who(pg_temp.u('a2'), '{"aal": "aal2"}');
  if pg_temp.q(format('admin_set_hidden(%L, true)', P)) <> jsonb_build_object('id', P, 'hidden', true) then raise exception 'hide answer'; end if;
  if not (pg_temp.q(format('admin_player(%L)', P)) #>> '{versus,hidden}')::boolean then raise exception 'hidden on versus'; end if;
  if jsonb_array_length(pg_temp.q('admin_season()') -> 'live') <> 1 then raise exception 'a hidden player leaves the live top'; end if;
  if not pg_temp.bad('admin_set_hidden(null, true)') or not pg_temp.bad(format('admin_set_hidden(%L, null)', P)) or not pg_temp.bad(format('admin_set_hidden(%L, true)', gen_random_uuid())) then
    raise exception 'set_hidden input checks';
  end if;
  if not pg_temp.bad(format('admin_set_hidden(%L, true)', pg_temp.u('a1'))) or not pg_temp.bad(format('admin_reset_nick(%L)', pg_temp.u('a5'))) then
    raise exception 'a mod cannot hide or rename an admin';
  end if;
  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal1"}');
  if pg_temp.try(format('admin_set_hidden(%L, true)', pg_temp.u('a2'))) <> 'mfa' then raise exception 'an owner without a second factor cannot either'; end if;
  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal2"}');
  if pg_temp.q(format('admin_set_hidden(%L, false)', pg_temp.u('a2'))) <> jsonb_build_object('id', pg_temp.u('a2'), 'hidden', false) then raise exception 'an owner can'; end if;
end $$;
reset role;
do $$
begin
  if not (select hidden from public.fw_scores where player_id = pg_temp.u('b1')) or not (select hidden from public.fw_versus where player_id = pg_temp.u('b1')) then raise exception 'hide: both rows'; end if;
  if (select detail from private.fw_admin_log where action = 'hide' and target = pg_temp.u('b1')) <> '{"scores": 1, "versus": 1}' then raise exception 'hide log'; end if;
end $$;
set role authenticated;
do $$ begin
  perform pg_temp.who(pg_temp.u('a2'), '{"aal": "aal2"}');
  perform pg_temp.q(format('admin_set_hidden(%L, false)', pg_temp.u('b1')));
end $$;
reset role;
do $$
begin
  if (select hidden from public.fw_scores where player_id = pg_temp.u('b1')) or (select hidden from public.fw_versus where player_id = pg_temp.u('b1')) then raise exception 'unhide: both rows'; end if;
  if not exists (select 1 from private.fw_admin_log where action = 'unhide' and target = pg_temp.u('b1') and admin_id = pg_temp.u('a2')) then raise exception 'unhide log'; end if;
end $$;

\echo === season: last season's top, this season's live top (hidden left out), the tick ===
set role authenticated;
do $$
declare r jsonb; cur int;
begin
  perform pg_temp.who(pg_temp.u('a2'), '{"aal": "aal2"}');
  r := pg_temp.q('admin_season()');
  cur := (r ->> 'season')::int;
  if (r ->> 'prev')::int <> 202609 or jsonb_array_length(r -> 'top') <> 2 or r #>> '{top,0,nick}' <> 'Pilot' or (r #>> '{top,1,rank}')::int <> 2 then raise exception 'top: %', r; end if;
  if r -> 'live' <> '[{"rp": 100, "nick": "Pilot", "wins": 2, "losses": 0}, {"rp": 50, "nick": "Doomed", "wins": 1, "losses": 0}]' then raise exception 'live: %', r -> 'live'; end if;
  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal2"}');
  if pg_temp.q('admin_season_tick()') <> jsonb_build_object('season', cur) then raise exception 'season_tick in the running month changes nothing'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from private.fw_admin_log where action = 'season_tick') <> 2 then raise exception 'each tick is logged (matrix + this one)'; end if;
  if (select prev from private.fw_vs_season) <> 202609 then raise exception 'no rollover in the running month'; end if;
end $$;

\echo === testers on / off ===
set role authenticated;
do $$
declare N constant uuid := pg_temp.u('a3'); r jsonb;
begin
  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal2"}');
  if pg_temp.q(format('admin_tester_set(%L, true, ''qa phone'')', N)) <> jsonb_build_object('id', N, 'tester', true) then raise exception 'tester on'; end if;
  perform pg_temp.q(format('admin_tester_set(%L, true, null)', N));   -- again without a note: the note stays
  r := pg_temp.q('admin_testers()');
  if jsonb_array_length(r) <> 2 or not r @> jsonb_build_array(jsonb_build_object('id', N, 'note', 'qa phone')) then raise exception 'testers: %', r; end if;
  if not pg_temp.bad(format('admin_tester_set(%L, true, %L)', N, repeat('n', 101))) or not pg_temp.bad(format('admin_tester_set(%L, true, null)', gen_random_uuid()))
     or not pg_temp.bad(format('admin_tester_set(%L, null, null)', N)) then raise exception 'tester input checks'; end if;
  perform pg_temp.who(N, '{}');
  if not public.tester_me() then raise exception 'the game sees the tester flag'; end if;
  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal2"}');
  if pg_temp.q(format('admin_tester_set(%L, false, null)', N)) <> jsonb_build_object('id', N, 'tester', false) then raise exception 'tester off'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from private.fw_testers where player_id = pg_temp.u('a3')) then raise exception 'tester off removes the row'; end if;
  if (select count(*) from private.fw_admin_log where action = 'tester_on' and target = pg_temp.u('a3')) <> 2
     or (select count(*) from private.fw_admin_log where action = 'tester_off' and target = pg_temp.u('a3')) <> 1 then raise exception 'tester log'; end if;
  if (select detail ->> 'note' from private.fw_admin_log where action = 'tester_on' and target = pg_temp.u('a3') order by id limit 1) <> 'qa phone' then raise exception 'tester note logged'; end if;
end $$;

\echo === held referrals: list and release ===
set role authenticated;
do $$
declare I constant uuid := pg_temp.u('d1'); r jsonb;
begin
  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal2"}');
  r := pg_temp.q('admin_referrals_held()');
  if jsonb_array_length(r) <> 2 or r #>> '{0,inviter}' <> I::text or r #>> '{0,inviter_nick}' <> 'Inviter' or r #>> '{0,invitee_nick}' <> 'Friend2'
     or (r #>> '{0,invitee_best}')::int <> 40 or (r #>> '{0,stage}')::int <> 8 or r #> '{1,invitee_nick}' <> 'null' then raise exception 'held: %', r; end if;
  if pg_temp.q(format('admin_referral_release(%L)', I)) <> '{"released": 2}' then raise exception 'release'; end if;
  if pg_temp.q(format('admin_referral_release(%L)', I)) <> '{"released": 0}' then raise exception 'release again: nothing held'; end if;
  if pg_temp.q('admin_referrals_held()') <> '[]' then raise exception 'nothing held after release'; end if;
  if not pg_temp.bad('admin_referral_release(null)') then raise exception 'release input check'; end if;
end $$;
reset role;
do $$ begin
  if exists (select 1 from private.fw_referrals where held) then raise exception 'release clears held'; end if;
  if (select string_agg(detail ->> 'released', ',' order by id) from private.fw_admin_log where action = 'ref_release' and target = pg_temp.u('d1')) <> '2,0' then raise exception 'release log'; end if;
end $$;

\echo === delete_player: the confirmation, yourself, another admin, then the cascade ===
set role authenticated;
do $$
declare D constant uuid := pg_temp.u('b3'); O constant uuid := pg_temp.u('a1'); M constant uuid := pg_temp.u('a2');
begin
  perform pg_temp.who(O, '{"aal": "aal2"}');
  if not pg_temp.bad(format('admin_delete_player(%L, ''wrong'')', D)) then raise exception 'a confirmation that does not match is refused'; end if;
  if not pg_temp.bad(format('admin_delete_player(%L, %L)', D, upper(D::text))) then raise exception 'the confirmation must be the id exactly'; end if;
  if not pg_temp.bad(format('admin_delete_player(%L, null)', D)) then raise exception 'no confirmation is refused'; end if;
  if not pg_temp.bad(format('admin_delete_player(%L, %L)', O, O)) then raise exception 'deleting yourself is refused'; end if;
  if not pg_temp.bad(format('admin_delete_player(%L, %L)', M, M)) then raise exception 'deleting another admin is refused'; end if;
  if pg_temp.q(format('admin_delete_player(%L, %L)', D, D)) <> '{"deleted": true}' then raise exception 'delete D'; end if;
  if pg_temp.q(format('admin_delete_player(%L, %L)', D, D)) <> '{"deleted": false}' then raise exception 'delete D again: nothing to delete'; end if;
  if not pg_temp.bad(format('admin_player(%L)', D)) then raise exception 'the deleted id is unknown now'; end if;
end $$;
reset role;
do $$
declare D constant uuid := pg_temp.u('b3');
begin
  if exists (select 1 from auth.users where id = D) then raise exception 'the auth user is gone'; end if;
  if exists (select 1 from public.fw_scores where player_id = D) or exists (select 1 from public.fw_versus where player_id = D)
     or exists (select 1 from public.fw_vs_standing where player_id = D) or exists (select 1 from private.fw_reports where D in (target_id, reporter_id))
     or exists (select 1 from private.fw_testers where player_id = D) or exists (select 1 from private.fw_push where player_id = D)
     or exists (select 1 from private.fw_events where player_id = D) then raise exception 'the cascade takes every game row'; end if;
  if (select player_id from private.fw_client_errors where msg = 'TypeError: x') is not null then raise exception 'the error row stays without a player'; end if;
  if (select detail from private.fw_admin_log where action = 'delete_player' and target = D order by id limit 1) <> '{"nick": "Doomed", "deleted": true}' then raise exception 'delete log keeps the name'; end if;
  if (select count(*) from private.fw_admin_log where action = 'delete_player') <> 2 then raise exception 'the refused deletes are not logged, the two that ran are'; end if;
  if not exists (select 1 from private.fw_admins where user_id = pg_temp.u('a2')) then raise exception 'the other admin is untouched'; end if;
end $$;

\echo === the audit log: owner reads it, the log outlives a deleted admin account ===
set role authenticated;
do $$
declare r jsonb;
begin
  perform pg_temp.who(pg_temp.u('a1'), '{"aal": "aal2"}');
  r := pg_temp.q('admin_log(200)');
  if r #>> '{0,action}' <> 'delete_player' or r #>> '{0,target}' <> pg_temp.u('b3')::text then raise exception 'newest first: %', r -> 0; end if;
  if not r @> '[{"action": "unhide", "admin_nick": "Moddy"}, {"action": "season_tick", "admin_nick": "대표"}]' then raise exception 'admin_nick: the game name, else the note'; end if;
  if jsonb_array_length(pg_temp.q('admin_log()')) > 100 or not pg_temp.bad('admin_log(201)') then raise exception 'log limit'; end if;
end $$;
reset role;
do $$
declare n int := (select count(*) from private.fw_admin_log where admin_id = pg_temp.u('a2'));
begin
  delete from auth.users where id = pg_temp.u('a2');   -- an admin's account deleted (by hand, as the database owner)
  if exists (select 1 from private.fw_admins where user_id = pg_temp.u('a2')) then raise exception 'fw_admins goes with the account'; end if;
  if n < 5 or (select count(*) from private.fw_admin_log where admin_id is null) <> n then raise exception 'the admin''s log rows stay with admin_id null'; end if;
end $$;

\echo === grants: anon reaches nothing, the API role reaches the wrappers but not the tables or the gate ===
do $$
declare f record;
begin
  for f in select p.oid::regprocedure::text as sig, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname = 'public' and p.proname like 'admin\_%') or (n.nspname = 'private' and p.proname like 'fw\_admin\_%') loop
    if has_function_privilege('anon', f.sig, 'execute') then raise exception 'anon must not run %', f.sig; end if;
    if f.sig like '%fw_admin_gate%' then
      if has_function_privilege('authenticated', f.sig, 'execute') then raise exception 'the gate is internal'; end if;
    elsif not has_function_privilege('authenticated', f.sig, 'execute') then raise exception 'authenticated runs %', f.sig;
    end if;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'admin\_%') <> 18 then raise exception '18 wrappers'; end if;
  if has_table_privilege('authenticated', 'private.fw_admins', 'select') or has_table_privilege('authenticated', 'private.fw_admins', 'insert')
     or has_table_privilege('authenticated', 'private.fw_admin_log', 'select') or has_table_privilege('anon', 'private.fw_admin_log', 'insert') then
    raise exception 'the admin tables are out of reach';
  end if;
  if has_table_privilege('service_role', 'private.fw_admin_log', 'insert') or not has_table_privilege('service_role', 'private.fw_admin_log', 'select')
     or has_table_privilege('service_role', 'private.fw_admin_log', 'update') or has_table_privilege('service_role', 'private.fw_admin_log', 'delete') then
    raise exception 'fw_admin_log is read-only for service_role';
  end if;
end $$;
\echo === admin rehearsal: all checks passed ===
