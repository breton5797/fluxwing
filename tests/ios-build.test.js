// iOS (Capacitor) web bundle: scripts/ios-build.mjs copies the live page into ios-www/ with the Supabase SDK served from the app
// (the same file the CDN serves, so the page's SRI hash still holds) and every file the page links. Native code lives in ios/App.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { iosHtml, IOS_ASSETS, SDK_LOCAL } from '../scripts/ios-build.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');

test('iosHtml swaps only the SDK address; config and everything else stay as on swishby.com', () => {
  const out = iosHtml(html);
  assert.equal(out.split(`const SDK_SRC = '${SDK_LOCAL}';`).length - 1, 1);
  assert.doesNotMatch(out, /cdn\.jsdelivr\.net\/npm\/@supabase/);
  assert.equal(out.length - html.length, SDK_LOCAL.length - html.match(/const SDK_SRC = '([^']+)'/)[1].length);
  assert.ok(out.includes("window.FW_CONFIG = { ads: 'none', "), 'no ads in the app');
  assert.throws(() => iosHtml('<html></html>'), /SDK_SRC/);
});

test('the bundled SDK is byte-identical to the file the page pins (SRI)', () => {
  const sri = html.match(/const SDK_SRI = '(sha384-[^']+)'/)[1];
  const local = readFileSync(new URL('node_modules/@supabase/supabase-js/dist/umd/supabase.js', root));
  assert.equal('sha384-' + createHash('sha384').update(local).digest('base64'), sri, 'npm i the exact version index.html pins');
  const pin = html.match(/supabase-js@([\d.]+)/)[1];
  assert.equal(JSON.parse(read('package.json')).devDependencies['@supabase/supabase-js'], pin);
});

test('every asset the bundle copies exists, and the page links nothing else local', () => {
  for (const f of IOS_ASSETS) assert.ok(existsSync(new URL(f, root)), f);
  const local = [...html.matchAll(/(?:src|href)="(?!https?:|data:|#|mailto:)([^"]+)"/g)].map(m => m[1].replace(/\/$/, '/index.html'));
  for (const f of local) assert.ok(IOS_ASSETS.includes(f), `${f} is linked but not bundled`);
});

test('Capacitor config: the App Store id, the bundle folder, https scheme for storage parity', () => {
  const c = JSON.parse(read('capacitor.config.json'));
  assert.equal(c.appId, 'com.minimalkorea.swishby');
  assert.equal(c.appName, 'SWISHBY');
  assert.equal(c.webDir, 'ios-www');
  assert.match(read('.gitignore'), /^ios-www\/$/m, 'the built bundle is not committed');
});
