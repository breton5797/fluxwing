// Versus rules drift test: win +50 / loss -50, and a soft per-rival cap: 5 ranked matches a day against the same rival,
// the 6th and later are refused at versus_start and played unranked (the client shows vsCap). The cap covers FFA too.
// The server (supabase/schema.sql fw_vs_cfg) and the client (index.html) must say the same thing.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('client RP constants: win +50, loss -50', () => {
  assert.match(html, /RP_WIN = 50, RP_LOSS = 50/);
});

test('server fw_vs_cfg: rp_loss 50 and pair_cap 5 per 24 hours', () => {
  const m = sql.match(/select 50, (\d+), interval '20 seconds'[^;]*?, 30, (\d+), interval '24 hours'/);
  assert.ok(m, 'fw_vs_cfg select row not found in the expected shape');
  assert.equal(Number(m[1]), 50, 'rp_loss');
  assert.equal(Number(m[2]), 5, 'pair_cap: 5 ranked matches a day against the same rival');
});

test('the per-rival cap is checked for every mode, FFA included', () => {
  assert.ok(!/FFA skips it/.test(sql), 'versus_start must not skip the per-rival cap for FFA');
  assert.match(sql, /array_remove\(v_t0, v_uid\)/, 'FFA: every other seat is a rival');
  assert.match(sql, /when m\.mode = 'ffa' then 2/, 'FFA matches count toward the cap: the roster sits in the 2nd part of the id');
  assert.match(sql, /raise exception 'fw_vs_pair_cap/, 'the client keys its vsCap text on this error prefix');
});

test('every vsCap string (12 languages) tells the player 5 a day', () => {
  const base = [...html.matchAll(/vsCap:'([^']+)'/g)].map(x => x[1]);
  const l10n = [...html.matchAll(/"vsCap":"([^"]+)"/g)].map(x => x[1]);
  assert.equal(base.length, 4, 'ko/en/ja/zh vsCap');
  assert.equal(l10n.length, 8, 'vi/th/hi/es/pt/fr/de/id vsCap');
  for (const t of [...base, ...l10n]) assert.ok(/5/.test(t), t);
});

test('every vsRules string tells the player -50, not -45', () => {
  const rules = [...html.matchAll(/vsRules:'([^']+)'/g)].map(x => x[1]);
  assert.equal(rules.length, 4, 'ko/en/ja/zh vsRules');
  for (const r of rules){ assert.ok(/[−-]50/.test(r), r); assert.ok(!/45/.test(r), r); }
});

test('FFA placement RP: client FFA_RP mirrors server fw_vs_cfg().ffa_rp', () => {
  const cm = html.match(/const FFA_RP = \[([^\]]+)\]/);
  const sm = sql.match(/interval '3 days', array\[([^\]]+)\]/);
  assert.ok(cm && sm, 'FFA_RP / ffa_rp not found');
  const norm = s => s.split(',').map(x => Number(x.trim()));
  assert.deepEqual(norm(cm[1]), norm(sm[1]));
  assert.equal(norm(cm[1]).reduce((a, b) => a + b, 0), 0, 'placement RP must sum to zero');
});

test('FFA mode is accepted by the server gates', () => {
  assert.match(sql, /mode in \('1v1', '2v2', 'ffa'\)/);
  assert.match(sql, /p_mode not in \('1v1', '2v2', 'ffa'\)/);
  assert.match(sql, /fw_vs_settle_ffa/);
});
