-- Economy rehearsal, owner's decisions 2026-10-28 (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/economy.sql).
-- 1. Cloud save (save_put) refuses a save that owns a unit nobody can earn: the hidden three, each of the 20 unreleased rank 5-9 units,
--    and MONARCH unless this server ranked the player in a season's top_n (fw_vs_standing). Released units are accepted.
-- 2. Friend invites pay 15 gems + 10,000 coins per friend (fw_ref_cfg); a payout booked before the coins column existed reads coins 0.
-- Everything a player does goes through the public wrappers as "authenticated".
\set ON_ERROR_STOP on
\pset footer off

-- the stub's auth.users has no is_anonymous; Supabase's has (fw_save_me reads it)
alter table auth.users add column if not exists is_anonymous boolean not null default false;
create function pg_temp.u(p text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-' || lpad(p, 12, '0'))::uuid $$;
grant execute on function pg_temp.u(text) to authenticated;
insert into auth.users (id) values (pg_temp.u('e1')), (pg_temp.u('e2')), (pg_temp.u('e3')), (pg_temp.u('e4'));
insert into auth.users (id, is_anonymous) values (pg_temp.u('e9'), true);
-- e2 finished a season 3rd (a MONARCH winner), e3 11th (no unit), e4 with too few matches (rank null)
insert into public.fw_vs_standing (season, player_id, rank, rp, tier, wins, losses, draws, matches, nick, cc, bird) values
  (202610, pg_temp.u('e2'), 3, 2500, 3, 20, 5, 0, 25, 'Ace', 'KR', 'zero'),
  (202610, pg_temp.u('e3'), 11, 900, 1, 9, 9, 0, 18, 'Mid', 'KR', 'volt'),
  (202610, pg_temp.u('e4'), null, 100, 0, 1, 1, 0, 2, 'New', 'KR', 'volt');

\echo === save_put: units nobody can earn are refused, released ones accepted ===
set role authenticated;
do $$
declare
  r jsonb; rev bigint := 0; id text; n integer := 0;
  bad constant text[] := array['aurora','tempest','pleiad',
    'seraph','valkyrie','lumen','halcyon','quasar','comet','zodiac','eclipse','singular','rift','nyx','entropy',
    'archon','ouroboros','kirin','garuda','aeon','cosmos','infinity','omega'];
  sv  constant text := '{"v": 1, "w": {"coins": 100}, "owned": %s}';
begin
  perform set_config('request.jwt.claim.sub', pg_temp.u('e1')::text, true);
  r := public.save_put(0, format(sv, '["volt","zero","pulsar","solaris","oracle"]')::jsonb);
  if (r ->> 'ok')::boolean is not true then raise exception 'released units must be accepted: %', r; end if;
  rev := (r ->> 'rev')::bigint;
  foreach id in array bad loop
    begin
      perform public.save_put(rev, format(sv, jsonb_build_array('volt', id))::text::jsonb);
      raise exception 'a save owning % must be refused', id;
    exception when sqlstate '22023' then n := n + 1;
    end;
  end loop;
  if n <> 23 then raise exception 'expected 23 refusals, got %', n; end if;
  begin
    perform public.save_put(rev, format(sv, '["volt","monarch"]')::jsonb);
    raise exception 'MONARCH without a season rank must be refused';
  exception when sqlstate '22023' then null;
  end;
  if (public.save_get() -> 'data' -> 'owned') <> '["volt","zero","pulsar","solaris","oracle"]'::jsonb then raise exception 'a refused save writes nothing: %', public.save_get(); end if;

  perform set_config('request.jwt.claim.sub', pg_temp.u('e2')::text, true);
  r := public.save_put(0, format(sv, '["volt","monarch"]')::jsonb);
  if (r ->> 'ok')::boolean is not true then raise exception 'a season top-10 player keeps MONARCH: %', r; end if;
  begin
    perform public.save_put((r ->> 'rev')::bigint, format(sv, '["volt","monarch","seraph"]')::jsonb);
    raise exception 'the season rank does not open unreleased units';
  exception when sqlstate '22023' then null;
  end;

  foreach id in array array['e3', 'e4'] loop
    perform set_config('request.jwt.claim.sub', pg_temp.u(id)::text, true);
    begin
      perform public.save_put(0, format(sv, '["volt","monarch"]')::jsonb);
      raise exception '% (rank 11 / no rank) must not own MONARCH', id;
    exception when sqlstate '22023' then null;
    end;
  end loop;

  perform set_config('request.jwt.claim.sub', pg_temp.u('e9')::text, true);
  begin perform public.save_put(0, format(sv, '["volt"]')::jsonb); raise exception 'an anonymous player has no cloud save';
  exception when sqlstate '42501' then null;
  end;
end $$;
reset role;

\echo === referral reward: 15 gems + 10,000 coins; an old payout reads coins 0 ===
do $$
declare c record := private.fw_ref_cfg(); r jsonb;
begin
  if c.gems <> 15 or c.coins <> 10000 or c.ms_gems <> array[50,150,500] then raise exception 'fw_ref_cfg: % gems, % coins, %', c.gems, c.coins, c.ms_gems; end if;
  insert into private.fw_ref_payouts (inviter_id, gems, invites) values (pg_temp.u('e1'), 30, 1);   -- as booked before this change
  r := private.fw_ref_unacked(pg_temp.u('e1'));
  if (r -> 0 ->> 'coins')::int <> 0 or (r -> 0 ->> 'gems')::int <> 30 then raise exception 'an old payout: %', r; end if;
  begin
    insert into private.fw_ref_payouts (inviter_id, gems, coins, invites) values (pg_temp.u('e1'), 15, -1, 1);
    raise exception 'negative coins must be refused';
  exception when check_violation then null;
  end;
end $$;

select 'PASS economy.sql' as result;
