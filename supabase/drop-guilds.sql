-- Removes the guild feature from the production database (feature deleted from the client on 2026-10-18).
-- Run once in the Supabase SQL Editor. Idempotent: every statement is "if exists".
-- Order: public wrappers -> private functions -> tables (cascade takes the policies and indexes with them).

drop function if exists public.guild_create(text, text, integer, integer, boolean);
drop function if exists public.guild_update(integer, integer, boolean);
drop function if exists public.guild_apply(bigint);
drop function if exists public.guild_decide(uuid, boolean);
drop function if exists public.guild_kick(uuid);
drop function if exists public.guild_leave();
drop function if exists public.guild_transfer(uuid);
drop function if exists public.guild_disband();
drop function if exists public.guild_search(text, integer);
drop function if exists public.guild_me();

drop function if exists private.fw_guild_create(text, text, integer, integer, boolean);
drop function if exists private.fw_guild_update(integer, integer, boolean);
drop function if exists private.fw_guild_apply(bigint);
drop function if exists private.fw_guild_decide(uuid, boolean);
drop function if exists private.fw_guild_kick(uuid);
drop function if exists private.fw_guild_leave();
drop function if exists private.fw_guild_transfer(uuid);
drop function if exists private.fw_guild_disband();
drop function if exists private.fw_guild_search(text, integer);
drop function if exists private.fw_guild_me();
drop function if exists private.fw_guild_mine(uuid, boolean);
drop function if exists private.fw_guild_row(bigint);
drop function if exists private.fw_guild_name(text);

drop table if exists private.fw_guild_pay cascade;
drop table if exists private.fw_guild_apps cascade;
drop table if exists public.fw_guild_members cascade;
drop table if exists public.fw_guilds cascade;

-- Check: both lists come back empty.
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('public', 'private') and p.proname like '%guild%';
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public', 'private') and c.relname like '%guild%' and c.relkind = 'r';
