import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadCloud } from './helpers/cloud.js';

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const C = loadCloud();

test('fw_saves exists, has RLS on and no client policy', () => {
  assert.match(sql, /create table if not exists public\.fw_saves \(/);
  assert.match(sql, /alter table public\.fw_saves enable row level security;/);
  assert.doesNotMatch(sql, /create policy \w+ on public\.fw_saves/);
  assert.match(sql, /revoke all on table public\.fw_saves from public, anon, authenticated;/);
});

test('the size cap is the client cap', () => {
  assert.equal(Number(sql.match(/c_max_bytes\s+constant integer\s*:=\s*(\d+)/)[1]), C.FS_CFG.maxBytes);
});

test('definer functions pin search_path, refuse anonymous players, and are reachable only by authenticated', () => {
  for (const f of ['fw_save_me', 'fw_save_get', 'fw_save_put'])
    assert.match(sql, new RegExp(`function private\\.${f}\\([^)]*\\)[\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`));
  assert.match(sql, /fw_save_anon/);
  assert.match(sql, /u\.is_anonymous/);
  for (const sig of ['public.save_get()', 'public.save_put(bigint, jsonb)', 'private.fw_save_get()', 'private.fw_save_put(bigint, jsonb)']) {
    const s = sig.replace(/[.()]/g, '\\$&');
    assert.match(sql, new RegExp(`revoke all on function ${s}\\s+from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function ${s}\\s+to authenticated, service_role;`));
  }
  assert.match(sql, /revoke all on function private\.fw_save_me\(\)\s+from public, anon, authenticated;/);
});

test('save_put refuses implausible wallets and units nobody can earn', () => {
  assert.deepEqual(C.FS_CFG.caps, { coins: 5e7, dia: 1e7, gems: 1e5, lvl: 1e5 });
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tierIds = JSON.parse(html.match(/const TIER_IDS = Object\.freeze\((\[[\s\S]*?\])\);/)[1].replace(/'/g, '"'));
  const open = Number(html.match(/const TIER_OPEN = (\d+);/)[1]), unreleased = tierIds.filter((id, i) => 5 + Math.floor(i / 4) > open);
  assert.equal(unreleased.length, 20, 'TIER_OPEN = 4: ranks 5-9 are all unreleased');
  // owner 2026-10-28: the hidden three, the season unit MONARCH (season top 10 only) and every unit of a rank not released yet
  assert.deepEqual(C.FS_CFG.neverOwned, ['aurora', 'tempest', 'pleiad', 'monarch', ...unreleased]);
  assert.equal(C.FS_CFG.seasonUnit, 'monarch');
  for (const [k, v] of [['coins', 50000000], ['dia', 10000000], ['gems', 100000], ['lvl', 100000]])
    assert.equal(Number(sql.match(new RegExp(`c_cap_${k}\\s+constant bigint\\s*:=\\s*(\\d+)`))[1]), v, k);
  const lit = sql.match(/c_never_owned\s+constant text\[\]\s*:=\s*array\[([^\]]*)\]/);
  assert.ok(lit, 'c_never_owned literal');
  assert.deepEqual(lit[1].replace(/--[^\n]*/g, '').split(',').map(x => x.trim().replace(/'/g, '')), C.FS_CFG.neverOwned, 'server list = client list');
  // MONARCH is earned by the season: allowed for a player the server ranked in a season's top_n (fw_vs_standing, fw_vs_season_cfg)
  assert.match(sql, /c_season_unit constant text := \(select c\.top_unit from private\.fw_vs_season_cfg\(\) c\);/);
  assert.match(sql, /where o\.id = any \(c_never_owned\)\s+and not \(o\.id = c_season_unit and exists \(\s*select 1 from public\.fw_vs_standing t, private\.fw_vs_season_cfg\(\) c\s+where t\.player_id = v_uid and t\.rank <= c\.top_n\)\)\) then/);
  assert.match(sql, /fw_bad_input: save out of range/);
  assert.match(sql, /fw_bad_input: save owns a unit nobody can earn/);
});
