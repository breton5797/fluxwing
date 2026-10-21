// iOS app (Capacitor) support inside index.html: the pure native block (shell detection, the sign-in return address, tokens from the
// return URL, outside links, haptic strength) and the wiring that uses it. On the web every one of these paths is inert.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = html.match(/\/\* native:start[\s\S]*?\/\* native:end \*\//);
const N = block ? new Function(`${block[0]}\nreturn {NAT_AUTH, NAT_SITE, natIs, natIsAuth, natTokens, natExternal, natHapticStyle};`)() : {};

test('natIs: only a Capacitor shell that says it is native', () => {
  assert.ok(block, 'native block exists');
  assert.equal(N.natIs({ Capacitor: { isNativePlatform: () => true } }), true);
  assert.equal(N.natIs({ Capacitor: { isNativePlatform: () => false } }), false, 'Capacitor web build');
  assert.equal(N.natIs({}), false);
  assert.equal(N.natIs(null), false);
  assert.equal(N.natIs({ Capacitor: { isNativePlatform: () => { throw new Error('x'); } } }), false);
});

test('the sign-in return address is the app URL scheme registered in Info.plist', () => {
  assert.equal(N.NAT_AUTH, 'com.minimalkorea.swishby://auth');
  const plist = readFileSync(new URL('../ios/App/App/Info.plist', import.meta.url), 'utf8');
  assert.match(plist, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>com\.minimalkorea\.swishby<\/string>/);
  assert.equal(N.natIsAuth('com.minimalkorea.swishby://auth#access_token=a'), true);
  assert.equal(N.natIsAuth('com.minimalkorea.swishby://other'), false);
  assert.equal(N.natIsAuth('https://swishby.com/auth'), false);
  assert.equal(N.natIsAuth(null), false);
});

test('natTokens: both tokens from the hash, or nothing', () => {
  assert.deepEqual(N.natTokens('com.minimalkorea.swishby://auth#access_token=AA&expires_in=3600&refresh_token=RR&token_type=bearer'),
    { access_token: 'AA', refresh_token: 'RR' });
  assert.equal(N.natTokens('com.minimalkorea.swishby://auth#access_token=AA'), null, 'no refresh token');
  assert.equal(N.natTokens('com.minimalkorea.swishby://auth?error=access_denied'), null);
  assert.equal(N.natTokens(''), null);
});

test('natExternal: page links open on swishby.com in the system browser; nothing else leaves', () => {
  assert.equal(N.natExternal('terms.html'), 'https://swishby.com/terms.html');
  assert.equal(N.natExternal('about/'), 'https://swishby.com/about/');
  assert.equal(N.natExternal('https://play.google.com/store/apps/details?id=x'), 'https://play.google.com/store/apps/details?id=x');
  assert.equal(N.natExternal('javascript:alert(1)'), null);
  assert.equal(N.natExternal(''), null);
});

test('natHapticStyle: the web vibration pattern picks a native strength', () => {
  assert.equal(N.natHapticStyle(6), 'LIGHT');
  assert.equal(N.natHapticStyle(14), 'MEDIUM');
  assert.equal(N.natHapticStyle(40), 'HEAVY');
  assert.equal(N.natHapticStyle([20, 30, 40]), 'HEAVY');
  assert.equal(N.natHapticStyle(undefined), null);
});

test('wiring: haptics, sign-in, outside links and the Play link know about the app', () => {
  assert.match(html, /const NAT = natIs\(window\);/);
  const hap = html.match(/function haptic\(k\)\{[^\n]*/)[0];
  assert.match(hap, /NAT/, 'haptic() routes to the native plugin in the app');
  assert.match(html, /const authBack = \(\) => NAT \? NAT_AUTH :/);
  const oauth = html.match(/async function authOAuth\(p\)\{[\s\S]*?\n\}/)[0];
  assert.match(oauth, /skipBrowserRedirect: NAT/);
  assert.match(oauth, /natPlug\('Browser'\)[\s\S]*\.open\(\{url: r\.data\.url/, 'the provider page opens in the system browser');
  assert.match(html, /addListener\('appUrlOpen'/);
  assert.match(html, /setSession\(/);
  assert.match(html, /natExternal\(/);
  assert.match(html, /native: NAT/, 'the Play link knows it is inside the app');
});
