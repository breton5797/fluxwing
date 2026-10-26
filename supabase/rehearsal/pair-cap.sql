-- Per-rival cap rehearsal (run on a copy: bash supabase/rehearsal/run.sh supabase/rehearsal/pair-cap.sql).
-- fw_vs_cfg().pair_cap ranked matches a day against the same rival; the next versus_start against that rival raises
-- fw_vs_pair_cap (the client then plays the match unranked). Covers 1v1, the FFA seats, void matches not counting,
-- and the 24-hour window.
\set ON_ERROR_STOP on
\pset footer off

\echo === pair-cap: seed 6 players ===
insert into auth.users (id) select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 6) i;
create function pg_temp.as_user(x uuid) returns void language sql as $f$
  select set_config('request.jwt.claim.sub', x::text, true);
$f$;
-- a start that must be refused: returns the error text ('' when it went through)
create function pg_temp.refused(x uuid, p_match text, p_mode text, p_team integer) returns text language plpgsql as $f$
begin
  perform pg_temp.as_user(x);
  perform private.fw_versus_start(p_match, p_mode, p_team, 'N', 'KR', 'volt');
  return '';
exception when others then
  return sqlerrm;
end $f$;

\echo === pair-cap: 5 agreed 1v1 matches a vs b, then the 6th is refused for both ===
do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000001'; b uuid := '00000000-0000-4000-8000-000000000002';
  c uuid := '00000000-0000-4000-8000-000000000003'; d uuid := '00000000-0000-4000-8000-000000000004';
  cap integer := (select pair_cap from private.fw_vs_cfg());
  mid text; msg text; r jsonb;
begin
  if cap <> 5 then raise exception 'pair_cap is %, expected 5', cap; end if;
  for i in 1..cap loop
    mid := 'c' || i || '.' || a || '.' || b;
    perform pg_temp.as_user(a); r := private.fw_versus_start(mid, '1v1', 0, 'A', 'KR', 'volt');
    perform pg_temp.as_user(b); r := private.fw_versus_start(mid, '1v1', 1, 'B', 'KR', 'volt');
    update private.fw_vs_part set joined_at = joined_at - interval '1 minute' where match_id = mid;
    perform pg_temp.as_user(a); r := private.fw_versus_report(mid, 'win');
    perform pg_temp.as_user(b); r := private.fw_versus_report(mid, 'lose');
    if (select status from private.fw_vs_match where id = mid) <> 'settled' then raise exception 'match % not settled', mid; end if;
  end loop;
  -- RP by the rivals' RP (fw_vs_delta): +50, then the same rival again x0.5, x0.25: 50, 74, 85, 96, 107
  if (select rp from public.fw_versus where player_id = a) <> 107 then raise exception 'a should hold 107 RP, has %', (select rp from public.fw_versus where player_id = a); end if;

  mid := 'c6.' || a || '.' || b;
  msg := pg_temp.refused(a, mid, '1v1', 0);
  if msg not like 'fw_vs_pair_cap%' then raise exception '6th start by a: expected fw_vs_pair_cap, got "%"', msg; end if;
  msg := pg_temp.refused(b, mid, '1v1', 1);
  if msg not like 'fw_vs_pair_cap%' then raise exception '6th start by b: expected fw_vs_pair_cap, got "%"', msg; end if;
  if exists (select 1 from private.fw_vs_part where match_id = mid) then raise exception 'a refused start left a registration'; end if;

  -- another rival is not capped: a vs c goes through and settles
  mid := 'c7.' || a || '.' || c;
  perform pg_temp.as_user(a); r := private.fw_versus_start(mid, '1v1', 0, 'A', 'KR', 'volt');
  perform pg_temp.as_user(c); r := private.fw_versus_start(mid, '1v1', 1, 'C', 'KR', 'volt');
  update private.fw_vs_part set joined_at = joined_at - interval '1 minute' where match_id = mid;
  perform pg_temp.as_user(a); r := private.fw_versus_report(mid, 'win');
  perform pg_temp.as_user(c); r := private.fw_versus_report(mid, 'lose');
  if (select rp from public.fw_versus where player_id = a) <> 151 then raise exception 'a vs c should have counted in full (107 + 44), a has %', (select rp from public.fw_versus where player_id = a); end if;

  -- FFA: b sits in the room, so a is refused; d (no history) and c (one match vs a) get in
  mid := 'f1.' || a || '+' || b || '+' || c || '+' || d;
  msg := pg_temp.refused(a, mid, 'ffa', 0);
  if msg not like 'fw_vs_pair_cap%' then raise exception 'FFA start by a: expected fw_vs_pair_cap, got "%"', msg; end if;
  msg := pg_temp.refused(d, mid, 'ffa', 3);
  if msg <> '' then raise exception 'FFA start by d refused: %', msg; end if;
  msg := pg_temp.refused(c, mid, 'ffa', 2);
  if msg <> '' then raise exception 'FFA start by c refused: %', msg; end if;
  -- and FFA registrations count toward the cap: c now has 1 (1v1) + 1 (FFA) against a
  if (select count(*) from private.fw_vs_part p join private.fw_vs_match m on m.id = p.match_id
      where p.player_id = c and m.status <> 'void'
        and a::text = any (string_to_array(split_part(m.id, '.', case when m.mode = 'ffa' then 2 when p.team = 0 then 3 else 2 end), '+'))) <> 2 then
    raise exception 'FFA registration should count toward c vs a';
  end if;

  -- a void match does not count: void one of the five and a gets one more ranked start against b
  update private.fw_vs_match set status = 'void', why = 'conflict' where id = 'c5.' || a || '.' || b;
  mid := 'c8.' || a || '.' || b;
  msg := pg_temp.refused(a, mid, '1v1', 0);
  if msg <> '' then raise exception 'after a void, a start vs b should go through: %', msg; end if;
  msg := pg_temp.refused(a, 'c9.' || a || '.' || b, '1v1', 0);
  if msg not like 'fw_vs_pair_cap%' then raise exception 'back at the cap: expected fw_vs_pair_cap, got "%"', msg; end if;

  -- the window: 24 hours later the same rival is ranked again
  update private.fw_vs_part set joined_at = joined_at - interval '25 hours' where player_id in (a, b);
  msg := pg_temp.refused(a, 'c9.' || a || '.' || b, '1v1', 0);
  if msg <> '' then raise exception 'after 25 hours a start vs b should go through: %', msg; end if;
end $$;
select 'PASS pair-cap.sql' as result;
