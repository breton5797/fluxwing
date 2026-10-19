-- 1v1/2v2 regression after the FFA changes — Supabase SQL editor, rolls back. Prints PASS notices.
begin;
create function pg_temp.as_user(x uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', x::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
end $f$;
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid();
  a uuid; b uuid; mid text; r jsonb; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role) values
    (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
  a := least(u1, u2); b := greatest(u1, u2);
  mid := 'r1.' || a || '.' || b;

  -- 1v1 agreed: winner +50, loser -50 floored at 0
  perform pg_temp.as_user(a); r := private.fw_versus_start(mid, '1v1', 0, 'A', 'KR', 'volt');
  perform pg_temp.as_user(b); r := private.fw_versus_start(mid, '1v1', 1, 'B', 'KR', 'volt');
  update private.fw_vs_part set joined_at = joined_at - interval '1 minute' where match_id = mid;
  perform pg_temp.as_user(a); r := private.fw_versus_report(mid, 'win');
  perform pg_temp.as_user(b); r := private.fw_versus_report(mid, 'lose');
  if (select status from private.fw_vs_match where id = mid) <> 'settled' then raise exception '1v1 not settled'; end if;
  if (select rp from public.fw_versus where player_id = a) <> 50 then raise exception '1v1 winner rp'; end if;
  if (select rp from public.fw_versus where player_id = b) <> 0 then raise exception '1v1 loser rp floor'; end if;
  if (select delta from private.fw_vs_part where match_id = mid and player_id = b) <> 0 then raise exception '1v1 floored delta'; end if;

  -- 1v1 conflicting reports void and move nothing
  mid := 'r2.' || a || '.' || b;
  perform pg_temp.as_user(a); r := private.fw_versus_start(mid, '1v1', 0, 'A', 'KR', 'volt');
  perform pg_temp.as_user(b); r := private.fw_versus_start(mid, '1v1', 1, 'B', 'KR', 'volt');
  update private.fw_vs_part set joined_at = joined_at - interval '1 minute' where match_id = mid;
  perform pg_temp.as_user(a); r := private.fw_versus_report(mid, 'win');
  perform pg_temp.as_user(b); r := private.fw_versus_report(mid, 'win');
  if (select status from private.fw_vs_match where id = mid) <> 'void' or (select why from private.fw_vs_match where id = mid) <> 'conflict' then raise exception '1v1 conflict'; end if;
  if (select rp from public.fw_versus where player_id = a) <> 50 then raise exception 'void moved rp'; end if;

  -- an FFA ranking vector against a 1v1 match is refused
  mid := 'r3.' || a || '.' || b;
  perform pg_temp.as_user(a); r := private.fw_versus_start(mid, '1v1', 0, 'A', 'KR', 'volt');
  update private.fw_vs_part set joined_at = joined_at - interval '1 minute' where match_id = mid;
  ok := false;
  begin perform private.fw_versus_report(mid, '1,2,3,4'); exception when others then ok := sqlerrm like 'fw_bad_input%'; end;
  if not ok then raise exception 'vector on 1v1 not refused'; end if;

  raise notice 'PASS versus-regress.sql';
end $$;
rollback;
select 'PASS (see notices)' as result;
