import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadI18NParts } from './helpers/i18n.js';

// Versus RP by the strength of the other side (owner's decision 2026-10-27): 50 at equal RP, more for beating a stronger side and less
// for losing to it, 20..80 (Elo, scale 1000 RP); a rival met again within the pair window counts half, then a quarter. 1v1 / 2v2; FFA keeps its table.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const m = html.match(/\/\* rp:start[\s\S]*?\/\* rp:end \*\//);
const R = m ? new Function(`${m[0]}\nreturn {RP_ELO, rpDelta};`)() : {};

test('rpDelta: 50 at equal RP, 20..80 by the gap, draws 0', () => {
  assert.ok(m, 'a pure rp block');
  assert.deepEqual({...R.RP_ELO}, {k: 100, scale: 1000, lo: 20, hi: 80, rep: [1, .5, .25]});
  assert.equal(R.rpDelta(1000, 1000, 'win', 0), 50);
  assert.equal(R.rpDelta(1000, 1000, 'lose', 0), -50);
  assert.equal(R.rpDelta(1000, 1000, 'draw', 0), 0);
  assert.equal(R.rpDelta(1000, 1500, 'win', 0), 76, 'beating a stronger side pays more');
  assert.equal(R.rpDelta(1000, 1500, 'lose', 0), -24, 'losing to it costs less');
  assert.equal(R.rpDelta(1500, 1000, 'win', 0), 24);
  assert.equal(R.rpDelta(0, 8000, 'win', 0), 80, 'capped');
  assert.equal(R.rpDelta(8000, 0, 'win', 0), 20, 'floored');
  assert.equal(R.rpDelta(8000, 0, 'lose', 0), -80);
});

test('rpDelta: the same rival again counts half, then a quarter', () => {
  assert.equal(R.rpDelta(1000, 1000, 'win', 1), 25);
  assert.equal(R.rpDelta(1000, 1000, 'win', 2), 13);
  assert.equal(R.rpDelta(1000, 1000, 'lose', 4), -13);
  assert.equal(R.rpDelta(1000, 1000, 'win', 0) + R.rpDelta(1000, 1000, 'lose', 0), 0, 'zero-sum at equal RP');
});

test('the server computes the same: private.fw_vs_delta with the same constants, used by the 1v1 / 2v2 settlement', () => {
  const fn = sql.slice(sql.indexOf('create or replace function private.fw_vs_delta('), sql.indexOf('$$;', sql.indexOf('create or replace function private.fw_vs_delta(')));
  assert.ok(fn.length > 50, 'fw_vs_delta exists');
  for (const k of ['least(80, greatest(20,', '100 *', '/ 1000.0', 'when 0 then 1 when 1 then .5 else .25']) assert.ok(fn.includes(k), k);
  assert.match(sql, /revoke all on function private\.fw_vs_delta\(integer, integer, text, integer\) from public, anon, authenticated;/);
  const st = sql.slice(sql.indexOf('create or replace function private.fw_vs_settle(p_match text)'), sql.indexOf('create or replace function private.fw_vs_sweep('));
  assert.match(st, /v_d := case when v_out = 2 then 0 else private\.fw_vs_delta\(/);
  assert.match(st, /m\.settled_at > v_now - c\.pair_window/, 'repeats within the pair window');
  assert.match(html, /rpAfter = \(p, res, opp = p, rep = 0\) => Math\.max\(0, p \+ rpDelta\(p, opp, res, rep\)\)/);
});

test('every language explains RP: the rules line and a help paragraph', () => {
  const P = loadI18NParts();
  for (const [l, tb] of Object.entries(P.I18N)){
    assert.match(tb.vsRules, /20/, `${l} vsRules`); assert.match(tb.vsRules, /80/, `${l} vsRules`);
    assert.ok(tb.hRp && /RP/.test(tb.hRp), `${l} hRp`);
  }
  assert.match(html, /<p data-i18n="hUnits"><\/p><p data-i18n="hRp"><\/p>/);
});
