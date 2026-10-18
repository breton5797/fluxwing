-- Guild assertions — Supabase SQL editor, rolls back. Prints PASS notices.
begin;
create function pg_temp.as_user(x uuid) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claim.sub', x::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
end $f$;
do $$
declare
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid();
  r jsonb; gid bigint; ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated' from unnest(array[u1, u2, u3]) x;
  insert into public.fw_scores (player_id, nick, best, gates, bird) values
    (u1, 'Owner', 100, 40, 'volt'), (u2, 'Good', 60, 25, 'volt'), (u3, 'Weak', 10, 6, 'volt');

  -- creation: no recorded run -> refused; then ok; same token retried -> already:true, same guild
  perform pg_temp.as_user(u1);
  r := private.fw_guild_create('Alpha Wing', 'tok11111', 50, 0, false);
  if (r->>'already')::boolean then raise exception 'first create said already'; end if;
  gid := (r->'guild'->>'id')::bigint;
  r := private.fw_guild_create('Alpha Wing', 'tok11111', 50, 0, false);
  if not (r->>'already')::boolean or (r->'guild'->>'id')::bigint <> gid then raise exception 'token retry wrong: %', r; end if;
  ok := false; begin perform private.fw_guild_create('Beta Wing', 'tok22222', 0, 0, false); exception when others then ok := sqlerrm like 'fw_guild_member%'; end;
  if not ok then raise exception 'second guild while member not refused'; end if;

  -- duplicate name (case-insensitive) refused for another founder
  perform pg_temp.as_user(u2);
  ok := false; begin perform private.fw_guild_create('alpha wing', 'tok33333', 0, 0, false); exception when others then ok := sqlerrm like 'fw_guild_dupe%'; end;
  if not ok then raise exception 'duplicate name not refused'; end if;

  -- admission: weak applicant refused by the server, good one needs approval
  perform pg_temp.as_user(u3);
  ok := false; begin perform private.fw_guild_apply(gid); exception when others then ok := sqlerrm like 'fw_guild_req_unmet%'; end;
  if not ok then raise exception 'unmet requirements not refused'; end if;
  perform pg_temp.as_user(u2);
  r := private.fw_guild_apply(gid);
  if r->>'status' <> 'applied' then raise exception 'apply: %', r; end if;
  if (select count(*) from public.fw_guild_members where guild_id = gid) <> 1 then raise exception 'approval mode joined early'; end if;

  -- non-owner may not decide; owner approves; member count moves
  ok := false; begin perform private.fw_guild_decide(u2, true); exception when others then ok := sqlerrm like 'fw_guild_%'; end;
  if not ok then raise exception 'non-owner decide not refused'; end if;
  perform pg_temp.as_user(u1);
  r := private.fw_guild_decide(u2, true);
  if (select members from public.fw_guilds where id = gid) <> 2 then raise exception 'member count'; end if;

  -- owner cannot leave; transfer then leave works; kick by non-owner refused
  ok := false; begin perform private.fw_guild_leave(); exception when others then ok := sqlerrm like 'fw_guild_owner%'; end;
  if not ok then raise exception 'owner leave not refused'; end if;
  perform pg_temp.as_user(u2);
  ok := false; begin perform private.fw_guild_kick(u1); exception when others then ok := sqlerrm like 'fw_guild_owner_only%'; end;
  if not ok then raise exception 'member kick not refused'; end if;
  perform pg_temp.as_user(u1);
  r := private.fw_guild_transfer(u2);
  if (select owner from public.fw_guilds where id = gid) <> u2 then raise exception 'transfer'; end if;
  r := private.fw_guild_leave();
  if (select members from public.fw_guilds where id = gid) <> 1 then raise exception 'leave count'; end if;

  -- auto-join guild admits instantly; disband cascades
  perform pg_temp.as_user(u2);
  r := private.fw_guild_update(0, 0, true);
  perform pg_temp.as_user(u1);
  ok := false; begin perform private.fw_guild_create('Gamma', 'tok44444', 0, 0, true); exception when others then ok := sqlerrm like 'fw_rate_limited%'; end;
  if not ok then raise exception 'creation cooldown not applied'; end if;
  r := private.fw_guild_apply(gid);
  if r->>'status' <> 'joined' then raise exception 'auto join: %', r; end if;
  perform pg_temp.as_user(u2);
  r := private.fw_guild_disband();
  if (select count(*) from public.fw_guild_members where guild_id = gid) <> 0 then raise exception 'disband cascade'; end if;

  raise notice 'PASS guild.sql';
end $$;
rollback;
select 'PASS (see notices)' as result;
