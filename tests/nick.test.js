import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { loadNickFilter, nickFilterSql } from '../scripts/nick-filter-sql.mjs';
import { nickRehearsalSql } from '../scripts/nick-rehearsal.mjs';
import { REFUSED, ALLOWED } from './helpers/nick-names.js';

const { nickBad } = loadNickFilter();
const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');


test('nickname filter refuses the listed names', () => {
  const passed = REFUSED.filter(n => !nickBad(n));
  assert.deepEqual(passed, []);
});

test('nickname filter lets ordinary names through', () => {
  const blocked = ALLOWED.filter(n => nickBad(n));
  assert.deepEqual(blocked, []);
});

test('no default Pilot-NNNN name is ever refused', () => {
  const blocked = [];
  for (let i = 1000; i < 10000; i++) if (nickBad('Pilot-' + i)) blocked.push(i);
  assert.deepEqual(blocked, []);
});

test('nickname filter copes with odd input', () => {
  for (const v of ['', ' ', null, undefined, 0, 'a'.repeat(5000), '\u0000', '😀😀', '+++', '(((', '\\']) assert.equal(nickBad(v), false);
});

test('schema.sql holds the function generated from the lists in index.html', () => {
  assert.ok(schema.includes(nickFilterSql()), 'run: node scripts/nick-filter-sql.mjs and paste it over private.fw_nick_bad in supabase/schema.sql');
});

test('both server paths that store a name run the filter', () => {
  const body = name => { const i = schema.indexOf('create or replace function ' + name); return schema.slice(i, schema.indexOf('$$;', i)); };
  assert.match(body('private.fw_submit_score'), /private\.fw_nick_bad\(v_nick\)/);
  assert.match(body('private.fw_vs_nick'), /private\.fw_nick_bad\(n\)/);
  assert.ok(schema.indexOf('function private.fw_nick_bad') < schema.indexOf('function private.fw_vs_nick'), 'fw_nick_bad must be created before the SQL function that calls it');
  assert.match(schema, /revoke all on function private\.fw_nick_bad\(text\)\s+from public, anon, authenticated;/);
  assert.match(schema, /fw_nick_bad self-test/, 'the paste must stop if the function misjudges');
  assert.doesNotMatch(schema, /^update [a-z_.]+\s+set nick/m, 'renaming stored names is a by-hand step (after reading the preview), never part of the paste');
});

test('supabase/rehearsal/nick.sql runs the same names through private.fw_nick_bad', () => {
  const sql = readFileSync(new URL('../supabase/rehearsal/nick.sql', import.meta.url), 'utf8');
  assert.equal(sql, nickRehearsalSql(), 'run: node scripts/nick-rehearsal.mjs > supabase/rehearsal/nick.sql');
});
