// Client error reports: the game tells its own server about uncaught errors (no third-party tracker).
// Pure helpers (what is reported, once per bug, at most a few a session, never the query string), the wiring,
// and the server side (table, capped definer function, 30-day retention job).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadErrlog } from './helpers/errlog.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html'), sql = read('supabase/schema.sql');
const E = loadErrlog();

test('errNorm: an Error, a string or a rejection reason becomes {msg, stack}; empty or opaque input is dropped', () => {
  const err = new Error('boom'); err.stack = 'Error: boom\n    at run (index.html:10:5)\n    at tick (index.html:20:1)';
  assert.deepEqual(E.errNorm(err), { msg: 'boom', stack: err.stack });
  assert.deepEqual(E.errNorm('plain  text\n  here'), { msg: 'plain text here', stack: '' });
  assert.deepEqual(E.errNorm({ message: 'from an event' }), { msg: 'from an event', stack: '' });
  for (const bad of [null, undefined, '', '   ', 'Script error.', {}, { message: '' }]) assert.equal(E.errNorm(bad), null, JSON.stringify(bad));
  const long = E.errNorm('x'.repeat(1000));
  assert.equal(long.msg.length, E.ERR_CFG.msgMax);
  const deep = new Error('d'); deep.stack = 'y'.repeat(5000);
  assert.equal(E.errNorm(deep).stack.length, E.ERR_CFG.stackMax);
});

test('errKey: the message plus the first stack frame; the same bug from two places is two keys', () => {
  const a = { msg: 'boom', stack: 'Error: boom\n    at run (index.html:10:5)\n    at tick (index.html:20:1)' };
  const b = { msg: 'boom', stack: 'Error: boom\n    at run (index.html:10:5)\n    at other (index.html:99:1)' };
  const c = { msg: 'boom', stack: 'Error: boom\n    at draw (index.html:30:5)' };
  assert.equal(E.errKey(a), E.errKey(b));
  assert.notEqual(E.errKey(a), E.errKey(c));
  assert.equal(E.errKey({ msg: 'no stack', stack: '' }), 'no stack\n');
});

test('errQueue: once per key, at most ERR_CFG.max a session, and the state is never mutated', () => {
  const s0 = Object.freeze(E.errInit());
  const r1 = E.errQueue(s0, 'k1');
  assert.equal(r1.ok, true); assert.deepEqual(s0, { sent: [] });
  assert.equal(E.errQueue(r1.st, 'k1').ok, false, 'a repeat is not sent again');
  let st = r1.st;
  for (let i = 2; i <= E.ERR_CFG.max; i++){ const r = E.errQueue(st, 'k' + i); assert.equal(r.ok, true, 'k' + i); st = r.st; }
  assert.equal(E.errQueue(st, 'k-extra').ok, false, 'the cap holds');
  assert.equal(E.errQueue(null, 'k').ok, false);
});

test('errUrl keeps path and hash and drops the origin and the query (an OAuth return carries a code there)', () => {
  assert.equal(E.errUrl('https://swishby.com/?code=abc&state=xyz#dev'), '/#dev');
  assert.equal(E.errUrl('https://swishby.com/about/'), '/about/');
  assert.equal(E.errUrl('not a url'), '');
  assert.ok(E.errUrl('https://x/' + 'p'.repeat(500)).length <= E.ERR_CFG.urlMax);
});

test('errBuild: a fingerprint from the inline scripts only', () => {
  const scripts = [{ src: '', text: 'abc' }, { src: 'https://cdn/x.js', text: '' }, { src: '', text: 'de' }];
  assert.equal(E.errBuild(scripts), 'L5');
  assert.equal(E.errBuild([]), 'L0');
});

test('wiring: both uncaught-error events reach the reporter, which calls one rpc', () => {
  assert.ok(html.includes("window.addEventListener('error', ev => errReport(ev.error || ev.message))"), 'uncaught errors');
  assert.ok(html.includes("window.addEventListener('unhandledrejection', ev => errReport(ev.reason))"), 'unhandled rejections');
  assert.ok(html.includes("sbC.rpc('report_error'"), 'one server call');
  assert.ok(html.includes('p_url: errUrl(location.href)'), 'never the query string');
});

test('server: a private table, a capped definer function behind an authenticated-only wrapper, 30-day retention', () => {
  assert.match(sql, /create table if not exists private\.fw_client_errors \(/);
  assert.match(sql, /player_id uuid\s+references auth\.users \(id\) on delete set null/);
  assert.match(sql, /create or replace function private\.fw_report_error\(p_msg text, p_stack text, p_build text, p_url text, p_ua text, p_extra jsonb\)/);
  assert.match(sql, /create or replace function public\.report_error\(p_msg text, p_stack text, p_build text, p_url text, p_ua text, p_extra jsonb\)/);
  assert.match(sql, /revoke all on function public\.report_error\(text, text, text, text, text, jsonb\)\s+from public, anon/);
  assert.match(sql, /grant execute on function public\.report_error\(text, text, text, text, text, jsonb\) to authenticated/);
  assert.match(sql, /grant execute on function private\.fw_report_error\(text, text, text, text, text, jsonb\) to authenticated, service_role/, 'the invoker wrapper needs this (production 403 on 2026-10-20)');
  assert.match(sql, /interval '1 hour'\) >= 10/, 'per-player cap');
  assert.match(sql, /interval '1 hour'\) >= 500/, 'global cap');
  assert.match(sql, /cron\.schedule\('fw_client_errors_gc', '40 15 \* \* \*',\s*'set statement_timeout = 0; delete from private\.fw_client_errors where at < now\(\) - interval ''30 days'';'\)/);
});
