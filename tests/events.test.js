// First-party product events: the game tells its own server what players do (install, sessions, tutorial, runs,
// daily, shop, ads, shares, level-ups) so the launch KPIs (D1/D7, session length, tutorial completion, conversion)
// can be read with SQL, without a third-party tracker. Pure helpers (allow-list, queue, batching, session clock),
// the wiring, the server side (table, capped definer function, 400-day retention) and the KPI queries.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadEvents } from './helpers/events.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html'), sql = read('supabase/schema.sql');
const E = loadEvents();
const KINDS = ['first_open', 'session_start', 'session_end', 'tutorial_done', 'run_end', 'daily_done', 'shop_buy', 'ad_view', 'share', 'level_up'];

test('EV_CFG: a fixed allow-list, batches under the server cap', () => {
  assert.deepEqual([...E.EV_CFG.kinds], KINDS);
  assert.ok(Object.isFrozen(E.EV_CFG) && Object.isFrozen(E.EV_CFG.kinds));
  assert.ok(E.EV_CFG.batch >= 1 && E.EV_CFG.batch <= E.EV_CFG.max);
  assert.ok(E.EV_CFG.max <= 50, 'one request never carries more than the server takes per call');
});

test('evSid: 16 base-36 characters from the random source given', () => {
  const a = E.evSid(Math.random), b = E.evSid(Math.random);
  assert.match(a, /^[0-9a-z]{16}$/); assert.notEqual(a, b);
  assert.equal(E.evSid(() => 0), '0'.repeat(16));
  assert.equal(E.evSid(() => .9999999), 'z'.repeat(16));
});

test('evOk: a known kind with no props or a small plain object', () => {
  for (const k of KINDS) assert.equal(E.evOk(k, null), true, k);
  assert.equal(E.evOk('run_end', { mode: 'endless', score: 12, stage: 1 }), true);
  for (const bad of ['', 'purchase', 'RUN_END', 'run_end ', null, 3]) assert.equal(E.evOk(bad, null), false, String(bad));
  assert.equal(E.evOk('share', [1, 2]), false, 'an array is not props');
  assert.equal(E.evOk('share', 'x'), false);
  assert.equal(E.evOk('share', { s: 'x'.repeat(E.EV_CFG.propsMax) }), false, 'over the size cap');
  const loop = {}; loop.me = loop; assert.equal(E.evOk('share', loop), false, 'unserialisable props never throw');
});

test('evNew / evAdd: events carry the session id; unknown or full is dropped; the state is never mutated', () => {
  const s0 = Object.freeze(E.evNew('abcdefgh12345678', 1000));
  assert.deepEqual(s0, { sid: 'abcdefgh12345678', q: [], vis: 0, at: 1000, hid: null });
  const s1 = E.evAdd(s0, 'run_end', { mode: 'daily', score: 3 });
  assert.deepEqual(s1.q, [{ k: 'run_end', s: 'abcdefgh12345678', p: { mode: 'daily', score: 3 } }]);
  assert.deepEqual(s0.q, [], 'the old state is untouched');
  assert.equal(E.evAdd(s1, 'nope', null), s1, 'an unknown kind changes nothing');
  assert.deepEqual(E.evAdd(s1, 'share', undefined).q[1], { k: 'share', s: 'abcdefgh12345678', p: null });
  let st = s0; for (let i = 0; i < E.EV_CFG.max + 5; i++) st = E.evAdd(st, 'share', null);
  assert.equal(st.q.length, E.EV_CFG.max, 'the queue is capped');
  assert.equal(E.evAdd(null, 'share', null), null);
});

test('evTake / evDue: the oldest n leave; due at a full batch or after flushMs with anything queued', () => {
  let st = E.evNew('s'.repeat(16), 0);
  assert.equal(E.evDue(st, 0, 10 ** 9), false, 'nothing queued is never due');
  for (let i = 0; i < 3; i++) st = E.evAdd(st, 'level_up', { lvl: i });
  assert.equal(E.evDue(st, 0, E.EV_CFG.flushMs - 1), false);
  assert.equal(E.evDue(st, 0, E.EV_CFG.flushMs), true);
  const r = E.evTake(st, 2);
  assert.deepEqual(r.batch.map(e => e.p.lvl), [0, 1]); assert.deepEqual(r.st.q.map(e => e.p.lvl), [2]);
  assert.equal(st.q.length, 3, 'take never mutates');
  for (let i = 0; i < E.EV_CFG.batch; i++) st = E.evAdd(st, 'share', null);
  assert.equal(E.evDue(st, 0, 1), true, 'a full batch goes at once');
});

test('evHide / evShow: session_end carries the visible seconds so far; a short absence resumes, a long one starts a new session', () => {
  let st = E.evNew('a'.repeat(16), 0);
  st = E.evHide(st, 90500);
  assert.deepEqual(st.q.at(-1), { k: 'session_end', s: 'a'.repeat(16), p: { dur: 91 } });
  assert.equal(st.at, null); assert.equal(st.hid, 90500);
  assert.equal(E.evHide(st, 99999), st, 'hidden twice: nothing new');
  st = E.evShow(st, 90500 + 60000, 'b'.repeat(16));
  assert.equal(st.sid, 'a'.repeat(16), 'a minute away is the same session'); assert.equal(st.at, 150500);
  st = E.evHide(st, 150500 + 30000);
  assert.deepEqual(st.q.at(-1).p, { dur: 121 }, 'the second end counts both visible stretches, not the time away');
  assert.equal(E.evShow(E.evNew('c'.repeat(16), 5), 10, 'x'.repeat(16)).sid, 'c'.repeat(16), 'already visible: nothing changes');
  const back = E.evShow(st, st.hid + E.EV_CFG.idleMs, 'b'.repeat(16));
  assert.equal(back.sid, 'b'.repeat(16)); assert.equal(back.vis, 0);
  assert.deepEqual(back.q.at(-1), { k: 'session_start', s: 'b'.repeat(16), p: null });
  assert.equal(back.q.filter(e => e.k === 'session_end').length, 2, 'queued events of the old session stay queued');
});

test('wiring: each kind is tracked where it happens, sent only with a server session, flushed on hide with keepalive', () => {
  assert.ok(html.includes("sbC.rpc('track', { p_events:"), 'one rpc for a batch');
  assert.ok(/if \(evBusy \|\| backend !== 'supa' \|\| !sbC/.test(html), 'only once there is a server session (anonymous counts)');
  assert.ok(html.includes('keepalive: true'), 'the hide flush outlives the page');
  assert.ok(html.includes("'/rest/v1/rpc/track'"));
  assert.ok(html.includes("document.addEventListener('visibilitychange'"));
  assert.ok(html.includes("store.get('fw27_ev_first', 0)") && html.includes("store.set('fw27_ev_first', 1)"), 'first_open once per device, marked when delivered');
  for (const k of ['tutorial_done', 'run_end', 'daily_done', 'shop_buy', 'ad_view', 'share', 'level_up']) assert.ok(html.includes(`evTrack('${k}'`), k);
  assert.equal(html.match(/evTrack\('tutorial_done'/g).length, 2, 'both places that end the tutorial tips');
  assert.ok(html.includes('evTok = s && s.access_token || null;'), 'the token for the keepalive request is kept from the auth callback');
});

test('server: a private table deleted with the account, a capped definer function behind an authenticated-only wrapper, 400-day retention', () => {
  assert.match(sql, /create table if not exists private\.fw_events \(/);
  assert.match(sql, /player_id uuid\s+not null default auth\.uid\(\) references auth\.users \(id\) on delete cascade/);
  for (const k of KINDS) assert.ok(new RegExp(`kind in \\([^)]*'${k}'`).test(sql), 'server allow-list has ' + k);
  assert.match(sql, /create index if not exists fw_events_kind_at_idx\s+on private\.fw_events \(kind, at\)/);
  assert.match(sql, /create index if not exists fw_events_player_at_idx\s+on private\.fw_events \(player_id, at\)/);
  assert.match(sql, /create or replace function private\.fw_track\(p_events jsonb, p_build text\)/);
  assert.match(sql, /create or replace function public\.track\(p_events jsonb, p_build text\)\s+returns integer language sql security invoker/);
  assert.match(sql, /revoke all on function private\.fw_track\(jsonb, text\) from public, anon;/);
  assert.match(sql, /grant execute on function private\.fw_track\(jsonb, text\) to authenticated, service_role;/, 'the invoker wrapper needs this (production 403 on 2026-10-20)');
  assert.match(sql, /revoke all on function public\.track\(jsonb, text\)\s+from public, anon;/);
  assert.match(sql, /grant execute on function public\.track\(jsonb, text\) to authenticated;/);
  assert.match(sql, /v_cap_player constant int := 300/); assert.match(sql, /v_cap_all\s+constant int := 20000/);
  assert.match(sql, /cron\.schedule\('fw_events_gc', '50 15 \* \* \*',\s*'set statement_timeout = 0; delete from private\.fw_events where at < now\(\) - interval ''400 days'';'\)/);
});

test('kpi.sql: the launch gates are each one query', () => {
  const k = read('supabase/checks/kpi.sql');
  for (const must of ['installs', 'd1', 'd7', 'd30', 'avg_session_min', 'tutorial_rate', 'runs_per_dau', 'share_rate', 'purchase_conversion', 'ad_views'])
    assert.ok(k.includes(must), 'kpi.sql has ' + must);
  assert.ok(k.includes("Asia/Seoul"), 'days are Korean days');
  assert.ok(!/\b(insert|update|delete|drop|alter)\b/i.test(k.replace(/--.*$/gm, '')), 'read-only');
});

test('privacy and README say what is kept, for how long, and that no third party sees it', () => {
  const p = read('privacy.html'), r = read('README.md');
  assert.ok(p.includes('이용 기록') && p.includes('400일'), 'Korean section');
  assert.ok(p.includes('Gameplay events') && p.includes('400 days'), 'English section');
  assert.ok(r.includes('private.fw_events') && r.includes('supabase/checks/kpi.sql'));
});
