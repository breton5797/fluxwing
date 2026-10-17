// Versus rules drift test: win +50 / loss -50, no per-rival daily cap.
// The server (supabase/schema.sql fw_vs_cfg) and the client (index.html) must say the same thing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('client RP constants: win +50, loss -50', () => {
  assert.match(html, /RP_WIN = 50, RP_LOSS = 50/);
});

test('server fw_vs_cfg: rp_loss 50 and the per-rival cap is effectively off', () => {
  const m = sql.match(/select 50, (\d+), interval '20 seconds'[^;]*?, 30, (\d+), interval '24 hours'/);
  assert.ok(m, 'fw_vs_cfg select row not found in the expected shape');
  assert.equal(Number(m[1]), 50, 'rp_loss');
  assert.ok(Number(m[2]) >= 1000000, 'pair_cap must be effectively unlimited, got ' + m[2]);
});

test('every vsRules string tells the player -50, not -45', () => {
  const rules = [...html.matchAll(/vsRules:'([^']+)'/g)].map(x => x[1]);
  assert.equal(rules.length, 4, 'ko/en/ja/zh vsRules');
  for (const r of rules){ assert.ok(/[−-]50/.test(r), r); assert.ok(!/45/.test(r), r); }
});
