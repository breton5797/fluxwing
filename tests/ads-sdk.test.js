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

function fakeCg(o = {}){
  const calls = [];
  const sdk = { environment: o.env || 'crazygames',
    init: async () => { calls.push('init'); },
    ad: { hasAdblock: async () => { if (o.abThrow) throw new Error('x'); return !!o.adblock; },
      requestAd: (kind, cb) => { calls.push('ad:' + kind); setTimeout(() => { cb.adStarted(); if (o.adError) cb.adError({ code: 'unfilled' }); else cb.adFinished(); }, 0); } },
    game: { gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop'), happytime: () => calls.push('happy') } };
  return { sdk, calls };
}
function fakePoki(o = {}){
  const calls = [];
  const sdk = { init: () => { calls.push('init'); return o.initReject ? Promise.reject(new Error('adblock')) : Promise.resolve(); },
    rewardedBreak: async () => { calls.push('rewardedBreak'); return 'rw' in o ? o.rw : true; },
    commercialBreak: async () => { calls.push('commercialBreak'); },
    gameplayStart: () => calls.push('start'), gameplayStop: () => calls.push('stop'), gameLoadingFinished: () => calls.push('loaded') };
  return { sdk, calls };
}
const make = async (prov, sdk) => { const asked = []; const a = A.adMake({ prov, mode: '' }, { wait: tick, load: async p => { asked.push(p); return sdk; } }); await a.boot; return { a, asked }; };

test('crazygames: rewarded and midgame map to the contract', async () => {
  const { sdk, calls } = fakeCg(), { a, asked } = await make('crazygames', sdk);
  assert.deepEqual(asked, ['crazygames']);
  assert.equal(a.ready(), true);
  assert.equal(await a.rewarded('revive'), 'granted');
  assert.equal(await a.interstitial(), 'shown');
  assert.deepEqual(calls, ['init', 'ad:rewarded', 'ad:midgame']);
  const bad = await make('crazygames', fakeCg({ adError: true }).sdk);
  assert.equal(await bad.a.rewarded('coin2x'), 'failed');
  assert.equal(await bad.a.interstitial(), 'failed');
});

test('crazygames: adblock or a disabled environment means no ads; a broken adblock check does not', async () => {
  assert.equal((await make('crazygames', fakeCg({ adblock: true }).sdk)).a.ready(), false);
  assert.equal((await make('crazygames', fakeCg({ env: 'disabled' }).sdk)).a.ready(), false);
  assert.equal((await make('crazygames', fakeCg({ abThrow: true }).sdk)).a.ready(), true);
});

test('crazygames: gameplay and happytime events', async () => {
  const { sdk, calls } = fakeCg(), { a } = await make('crazygames', sdk);
  a.ev('loaded'); a.ev('start'); a.ev('happy'); a.ev('stop');
  assert.deepEqual(calls, ['init', 'start', 'happy', 'stop']);   // no loading call on CrazyGames
});

test('poki: rewardedBreak true/false and commercialBreak map to the contract', async () => {
  const ok = await make('poki', fakePoki().sdk);
  assert.equal(await ok.a.rewarded('revive'), 'granted');
  assert.equal(await ok.a.interstitial(), 'shown');
  assert.equal(await (await make('poki', fakePoki({ rw: false }).sdk)).a.rewarded('revive'), 'skipped');
  assert.equal(await (await make('poki', fakePoki({ rw: 'yes' }).sdk)).a.rewarded('revive'), 'skipped');
});

test('poki: a rejected init (adblock) hides ads but still reports loading and gameplay', async () => {
  const { sdk, calls } = fakePoki({ initReject: true }), { a } = await make('poki', sdk);
  assert.equal(a.ready(), false);
  assert.equal(await a.rewarded('revive'), 'failed');
  a.ev('loaded'); a.ev('start'); a.ev('happy');
  assert.deepEqual(calls, ['init', 'loaded', 'start']);   // Poki has no happytime here
});

test('adMake: the stub, unknown providers and prototype keys', async () => {
  assert.equal(A.adMake({ prov: 'stub', mode: 'fail' }, { wait: tick, load: async () => null }).name, 'stub:fail');
  for (const prov of ['adsense', 'Poki', 'toString', '__proto__', 'constructor']){
    const a = A.adMake({ prov, mode: '' }, { wait: tick, load: async () => { throw new Error('must not load'); } });
    assert.equal(a.ready(), false, prov);
  }
});

test('the SDK globals are read off the window that is passed in', () => {
  const cg = {}, pk = {};
  assert.equal(A.AD_GLOBAL.crazygames({ CrazyGames: { SDK: cg } }), cg);
  assert.equal(A.AD_GLOBAL.poki({ PokiSDK: pk }), pk);
  assert.equal(A.AD_GLOBAL.crazygames({}), null);
  assert.equal(A.AD_GLOBAL.poki(null), null);
});

test('real providers get a guard long enough for a full rewarded video; the stub keeps its own', () => {
  assert.equal(A.adGuardMs('stub'), A.AD_CFG.timeoutMs);
  assert.ok(A.adGuardMs('poki') >= 120000);
  assert.ok(A.adGuardMs('crazygames') >= 120000);
  for (const k of ['crazygames', 'poki']) assert.match(A.AD_SDK.src[k], /^https:\/\//);
});
