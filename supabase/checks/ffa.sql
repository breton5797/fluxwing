-- FFA settlement assertions — Supabase SQL editor, rolls back. Prints PASS notices.
begin;
create function pg_temp.as_user(x uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', x::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
end $f$;
do $$
declare
  u uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  srt uuid[]; mid text; r jsonb; ok boolean; i integer; d integer[];
begin
  select array_agg(x order by x) into srt from unnest(u) x;
  for i in 1..4 loop
    insert into auth.users (id, instance_id, aud, role) values (srt[i], '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  end loop;
  mid := 'zz1.' || array_to_string(srt, '+');

  -- vector validation
  if private.fw_vs_ffa_vec_ok('1,3,2,4') is not true then raise exception 'vec 1,3,2,4'; end if;
  if private.fw_vs_ffa_vec_ok('1,1,3,4') is not true then raise exception 'vec ties'; end if;
  if private.fw_vs_ffa_vec_ok('1,1,2,4') then raise exception 'vec bad ties accepted'; end if;
  if private.fw_vs_ffa_vec_ok('1,2,3,3') is not true then raise exception 'vec 1,2,3,3 is a valid tie at 3rd'; end if;
  if private.fw_vs_ffa_vec_ok('2,2,3,4') then raise exception 'vec without a 1st accepted'; end if;

  -- all four register; wrong seat refused
  for i in 1..4 loop
    perform pg_temp.as_user(srt[i]);
    r := private.fw_versus_start(mid, 'ffa', i - 1, 'P' || i, 'KR', 'volt');
  end loop;
  perform pg_temp.as_user(srt[1]); ok := false;
  begin perform private.fw_versus_start('zz2.' || array_to_string(srt, '+'), 'ffa', 2, 'P1', 'KR', 'volt');
  exception when others then ok := sqlerrm like 'fw_bad_input%'; end;
  if not ok then raise exception 'wrong seat not refused'; end if;

  -- reports must wait min_play
  ok := false;
  begin perform private.fw_versus_report(mid, '1,2,3,4'); exception when others then ok := sqlerrm like 'fw_vs_too_soon%'; end;
  if not ok then raise exception 'too-soon report not refused'; end if;
  update private.fw_vs_part set joined_at = joined_at - interval '1 minute' where match_id = mid;

  -- team-shaped result against an ffa match refused
  ok := false;
  begin perform private.fw_versus_report(mid, 'win'); exception when others then ok := sqlerrm like 'fw_bad_input%'; end;
  if not ok then raise exception 'team result on ffa not refused'; end if;

  -- agreed settlement with a tie: '1,1,3,4' -> +35 +35 -20 -50 (floor 0 on fresh rows -> 35,35,0,0)
  for i in 1..4 loop perform pg_temp.as_user(srt[i]); r := private.fw_versus_report(mid, '1,1,3,4'); end loop;
  if (select status from private.fw_vs_match where id = mid) <> 'settled' then raise exception 'not settled: %', (select why from private.fw_vs_match where id = mid); end if;
  select array_agg(p.delta order by p.team) into d from private.fw_vs_part p where p.match_id = mid;
  if d <> array[35, 35, 0, 0] then raise exception 'deltas %', d; end if;
  if (select rp from public.fw_versus where player_id = srt[1]) <> 35 then raise exception 'rp seat1'; end if;
  if (select wins from public.fw_versus where player_id = srt[1]) <> 1 or (select losses from public.fw_versus where player_id = srt[3]) <> 0 then raise exception 'w/l tally'; end if;   -- delta 0 counts as draw

  -- conflict voids
  mid := 'zz3.' || array_to_string(srt, '+');
  for i in 1..4 loop perform pg_temp.as_user(srt[i]); r := private.fw_versus_start(mid, 'ffa', i - 1, 'P' || i, 'KR', 'volt'); end loop;
  update private.fw_vs_part set joined_at = joined_at - interval '1 minute' where match_id = mid;
  perform pg_temp.as_user(srt[1]); r := private.fw_versus_report(mid, '1,2,3,4');
  perform pg_temp.as_user(srt[2]); r := private.fw_versus_report(mid, '2,1,3,4');
  if (select status from private.fw_vs_match where id = mid) <> 'void' or (select why from private.fw_vs_match where id = mid) <> 'conflict' then raise exception 'conflict not void'; end if;
  if (select count(*) from private.fw_vs_part where match_id = mid and delta is not null) <> 0 then raise exception 'void moved rp'; end if;

  -- single report at the deadline: no quorum, void
  mid := 'zz4.' || array_to_string(srt, '+');
  for i in 1..4 loop perform pg_temp.as_user(srt[i]); r := private.fw_versus_start(mid, 'ffa', i - 1, 'P' || i, 'KR', 'volt'); end loop;
  update private.fw_vs_part set joined_at = joined_at - interval '10 minutes' where match_id = mid;
  update private.fw_vs_match set started_at = started_at - interval '10 minutes' where id = mid;
  perform pg_temp.as_user(srt[1]); r := private.fw_versus_report(mid, '1,2,3,4');
  update private.fw_vs_match set first_report_at = first_report_at - interval '5 minutes' where id = mid;
  perform private.fw_vs_settle(mid);
  if (select why from private.fw_vs_match where id = mid) <> 'no_quorum' then raise exception 'single report should be no_quorum: %', (select why from private.fw_vs_match where id = mid); end if;

  -- two equal reports at the deadline settle
  mid := 'zz5.' || array_to_string(srt, '+');
  for i in 1..4 loop perform pg_temp.as_user(srt[i]); r := private.fw_versus_start(mid, 'ffa', i - 1, 'P' || i, 'KR', 'volt'); end loop;
  update private.fw_vs_part set joined_at = joined_at - interval '10 minutes' where match_id = mid;
  update private.fw_vs_match set started_at = started_at - interval '10 minutes' where id = mid;
  perform pg_temp.as_user(srt[1]); r := private.fw_versus_report(mid, '4,3,2,1');
  perform pg_temp.as_user(srt[2]); r := private.fw_versus_report(mid, '4,3,2,1');
  update private.fw_vs_match set first_report_at = first_report_at - interval '5 minutes' where id = mid;
  perform private.fw_vs_settle(mid);
  if (select status from private.fw_vs_match where id = mid) <> 'settled' or (select why from private.fw_vs_match where id = mid) <> 'timeout' then
    raise exception 'quorum timeout should settle: %', (select why from private.fw_vs_match where id = mid); end if;

  raise notice 'PASS ffa.sql';
end $$;
rollback;
select 'PASS (see notices)' as result;
