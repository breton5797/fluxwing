// Bot check (Cloudflare Turnstile) in front of the auth calls Supabase gates: anonymous sign-in and the email code.
// Pure helpers (config parsing, one challenge), the wiring into the sign-in paths, and the privacy disclosure.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadCaptcha } from './helpers/captcha.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const C = loadCaptcha();
const OFF = { on: false, siteKey: '' };

test('capCfg: off unless a Turnstile site key is configured', () => {
  assert.deepEqual(C.capCfg(undefined), OFF);
  assert.deepEqual(C.capCfg({}), OFF);
  assert.deepEqual(C.capCfg({ auth: { captcha: { provider: 'turnstile', siteKey: '' } } }), OFF, 'empty key = off');
  assert.deepEqual(C.capCfg({ auth: { captcha: { provider: 'hcaptcha', siteKey: '0x4AAAAAAAexample' } } }), OFF, 'only Turnstile is wired');
  assert.deepEqual(C.capCfg({ auth: { captcha: { provider: 'turnstile', siteKey: 'bad key!' } } }), OFF);
  assert.deepEqual(C.capCfg({ auth: { captcha: { provider: 'turnstile', siteKey: '1x00000000000000000000AA' } } }), { on: true, siteKey: '1x00000000000000000000AA' }, 'the always-pass test key');
  assert.equal(C.capCfg({ auth: { captcha: { provider: 'turnstile', siteKey: '0x4AAAAAAA_live-key01' } } }).on, true);
});

const fakeApi = () => { const a = { calls: [], render(el, opts){ a.opts = opts; a.calls.push(el); return 'w1'; } }; return a; };
const noTimer = () => {};

test('capAsk: the widget callback yields the token; the box shows only while the player must interact', async () => {
  const api = fakeApi(), shows = [], el = { id: 'capBox' };
  const p = C.capAsk(api, el, 'k', noTimer, on => shows.push(on));
  assert.equal(api.calls[0], el);
  assert.equal(api.opts.sitekey, 'k'); assert.equal(api.opts.appearance, 'interaction-only');
  api.opts['before-interactive-callback'](); api.opts['after-interactive-callback'](); api.opts.callback('tok-1');
  assert.deepEqual(await p, { token: 'tok-1', id: 'w1' });
  assert.deepEqual(shows, [true, false, false], 'interaction on, off, and off again when settled');
  api.opts.callback('tok-2');   // a late second answer changes nothing
  assert.deepEqual(await p, { token: 'tok-1', id: 'w1' });
});

test('capAsk: error, expiry, timeout and a throwing render all settle to a null token', async () => {
  for (const k of ['error-callback', 'expired-callback', 'timeout-callback']){
    const api = fakeApi(); const p = C.capAsk(api, {}, 'k', noTimer, () => {}); api.opts[k]();
    assert.deepEqual(await p, { token: null, id: 'w1' }, k);
  }
  const api = fakeApi(); const fired = [];
  const p = C.capAsk(api, {}, 'k', (fn, ms) => { fired.push(ms); fn(); }, () => {});
  assert.deepEqual(await p, { token: null, id: 'w1' }); assert.deepEqual(fired, [C.CAP_CFG.waitMs]);
  const boom = { render(){ throw new Error('no turnstile'); } };
  assert.deepEqual(await C.capAsk(boom, {}, 'k', noTimer, () => {}), { token: null, id: null });
  const junk = fakeApi(); const q = C.capAsk(junk, {}, 'k', noTimer, () => {}); junk.opts.callback(42);
  assert.equal((await q).token, null, 'a non-string answer is not a token');
});

test('wiring: every gated call carries the token, the script comes from Cloudflare, the box exists, the config switch is present', () => {
  assert.equal(html.split('signInAnonymously({ options: await capOpts() })').length - 1, 3, 'three anonymous sign-in sites');
  assert.equal(html.split('signInAnonymously()').length - 1, 0, 'no bare anonymous sign-in left');
  assert.ok(html.includes("sbC.auth.signInWithOtp({email, options: {...back, shouldCreateUser: false, ...(await capOpts())}})"), 'the email code request');
  assert.match(html, /CAP_CFG = Object\.freeze\(\{ src: 'https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit'/);
  assert.ok(html.includes('<div id="capBox" class="capbox" hidden></div>'));
  assert.match(html, /\.capbox\{position:absolute/);
  assert.match(html, /auth: \{ apple: false, captcha: \{ provider: 'turnstile', siteKey: '[0-9A-Za-z_x-]*' \} \}/, 'FW_CONFIG carries the switch');
  assert.ok(html.includes('cap: capOpts,'), 'exposed on the #dev debug object for QA');
});

test('privacy policy discloses the Cloudflare bot check in Korean and English', () => {
  const priv = read('privacy.html');
  assert.match(priv, /<td>Cloudflare, Inc\.<\/td><td>로봇/);
  assert.match(priv, /<td>Cloudflare, Inc\.<\/td><td>Bot/);
  assert.ok(priv.includes('Turnstile'));
});
