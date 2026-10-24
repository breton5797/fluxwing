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
  assert.deepEqual(C.FS_CFG.neverOwned, ['aurora', 'tempest', 'pleiad']);
  for (const [k, v] of [['coins', 50000000], ['dia', 10000000], ['gems', 100000], ['lvl', 100000]])
    assert.equal(Number(sql.match(new RegExp(`c_cap_${k}\\s+constant bigint\\s*:=\\s*(\\d+)`))[1]), v, k);
  assert.match(sql, /c_never_owned\s+constant text\[\]\s*:=\s*array\['aurora','tempest','pleiad'\]/);
  assert.match(sql, /fw_bad_input: save out of range/);
  assert.match(sql, /fw_bad_input: save owns a unit nobody can earn/);
});
