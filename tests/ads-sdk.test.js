import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadAds } from './helpers/ads.js';

const A = loadAds();
const tick = () => new Promise(r => setTimeout(r, 0));
const SDK = {};
const deferred = () => { let give; const p = new Promise(r => { give = r; }); return { p, give }; };
function fakeDrv(o = {}){
  const calls = [];
  const drv = {
    init: async () => { calls.push('init'); if (o.initThrow) throw new Error('x'); return o.ads !== false; },
    rewarded: async () => { calls.push('rw'); if (o.hold) await o.hold; return o.rw || 'granted'; },
    interstitial: async () => { calls.push('in'); return 'shown'; },
    ev: { start: () => calls.push('start'), stop: () => calls.push('stop'), happy: () => calls.push('happy'), loaded: () => calls.push('loaded') },
  };
  return { drv, calls };
}

test('vendor: ready() is false until the SDK has answered init', async () => {
  const d = deferred(), { drv } = fakeDrv(), a = A.adVendor('x', drv, { load: () => d.p });
  assert.equal(a.ready(), false);
  assert.equal(await a.rewarded('revive'), 'failed');
  d.give(SDK); await a.boot;
  assert.equal(a.ready(), true);
  assert.equal(await a.rewarded('revive'), 'granted');
});

test('vendor: a blocked or missing SDK means no ads, no events, no throws', async () => {
  for (const load of [async () => null, async () => { throw new Error('blocked'); }]){
    const { drv, calls } = fakeDrv(), a = A.adVendor('x', drv, { load }); await a.boot;
    assert.equal(a.ready(), false);
    assert.equal(await a.interstitial(), 'failed');
    a.ev('start'); a.ev('happy'); a.ev('loaded');
    assert.deepEqual(calls, []);
  }
});

test('vendor: init saying no ads (adblock) or throwing keeps the events but no ads', async () => {
  for (const o of [{ ads: false }, { initThrow: true }]){
    const { drv, calls } = fakeDrv(o), a = A.adVendor('x', drv, { load: async () => SDK }); await a.boot;
    assert.equal(a.ready(), false);
    assert.equal(await a.rewarded('coin2x'), 'failed');
    a.ev('start');
    assert.deepEqual(calls, ['init', 'start']);
  }
});

test('vendor: events before boot wait; then loaded once and only the latest play state', async () => {
  const d = deferred(), { drv, calls } = fakeDrv(), a = A.adVendor('x', drv, { load: () => d.p });
  a.ev('loaded'); a.ev('start'); a.ev('stop'); a.ev('start'); a.ev('happy');   // happy is a moment: not queued
  assert.deepEqual(calls, []);
  d.give(SDK); await a.boot;
  assert.deepEqual(calls, ['init', 'loaded', 'start']);
  a.ev('start'); a.ev('stop'); a.ev('stop'); a.ev('happy');
  assert.deepEqual(calls, ['init', 'loaded', 'start', 'stop', 'happy']);
});

test('vendor: a stop never goes out before any start', async () => {
  const { drv, calls } = fakeDrv(), a = A.adVendor('x', drv, { load: async () => SDK }); await a.boot;
  a.ev('stop');
  assert.deepEqual(calls, ['init']);
});

test('vendor: one ad at a time, not ready while it plays, gameplay stopped first and restored after', async () => {
  const d = deferred(), { drv, calls } = fakeDrv({ hold: d.p }), a = A.adVendor('x', drv, { load: async () => SDK }); await a.boot;
  a.ev('start');
  const p = a.rewarded('revive');
  assert.equal(a.ready(), false);
  assert.equal(await a.rewarded('coin2x'), 'failed');
  assert.equal(await a.interstitial(), 'failed');
  d.give(); assert.equal(await p, 'granted');
  assert.equal(a.ready(), true);
  assert.deepEqual(calls, ['init', 'start', 'stop', 'rw', 'start']);
});

test('vendor: a throwing SDK event is swallowed', async () => {
  const { drv } = fakeDrv(); drv.ev.start = () => { throw new Error('sdk'); };
  const a = A.adVendor('x', drv, { load: async () => SDK }); await a.boot;
  assert.doesNotThrow(() => a.ev('start'));
});

test('guard: known events pass through, unknown ones and throws are dropped, the stub has none', () => {
  const seen = [];
  const g = A.adGuard({ name: 'e', ready: () => true, rewarded: async () => 'granted', interstitial: async () => 'shown',
    ev: k => { seen.push(k); if (k === 'happy') throw new Error('x'); } }, tick, 5);
  g.ev('start'); g.ev('happy'); g.ev('nope'); g.ev(undefined);
  assert.deepEqual(seen, ['start', 'happy']);
  assert.doesNotThrow(() => A.adGuard(A.adStub({ mode: 'ok', wait: tick }), tick, 5).ev('start'));
});

test('play edge: start on entering play, stop on leaving it, nothing otherwise', () => {
  assert.equal(A.adPlayEv(false, 'play'), 'start');
  for (const s of ['paused', 'dying', 'cont', 'over', 'menu']) assert.equal(A.adPlayEv(true, s), 'stop');
  assert.equal(A.adPlayEv(true, 'play'), null);
  assert.equal(A.adPlayEv(false, 'menu'), null);
});

test('volume: silent while muted or while an ad plays', () => {
  assert.equal(A.adVol(false, false), 0.5);
  assert.equal(A.adVol(true, false), 0);
  assert.equal(A.adVol(false, true), 0);
  assert.equal(A.adVol(true, true), 0);
});
