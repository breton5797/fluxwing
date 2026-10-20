// The Android app (a Trusted Web Activity) opens swishby.com without a URL bar only when the site vouches for the
// app's signing certificates in /.well-known/assetlinks.json. The TWA config and this file must name the same package.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const PACKAGE = 'com.minimalkorea.swishby';
const SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

test('assetlinks.json is valid JSON that delegates handle_all_urls to the Android package', () => {
  const links = JSON.parse(read('.well-known/assetlinks.json'));
  assert.ok(Array.isArray(links) && links.length > 0, 'assetlinks.json must be a non-empty array');
  const entry = links.find(l => l.target && l.target.package_name === PACKAGE);
  assert.ok(entry, 'no statement for ' + PACKAGE);
  assert.deepEqual(entry.relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(entry.target.namespace, 'android_app');
});

test('every certificate fingerprint is a 32-byte upper-case colon-hex SHA-256, with no duplicates', () => {
  const links = JSON.parse(read('.well-known/assetlinks.json'));
  for (const l of links) {
    const fps = l.target.sha256_cert_fingerprints;
    assert.ok(Array.isArray(fps) && fps.length > 0, 'fingerprint list must not be empty');
    for (const fp of fps) assert.match(fp, SHA256);
    assert.equal(new Set(fps).size, fps.length, 'duplicate fingerprint');
  }
});

test('the TWA manifest points the same package at https://swishby.com/', () => {
  const twa = JSON.parse(read('android/twa-manifest.json'));
  assert.equal(twa.packageId, PACKAGE);
  assert.equal(twa.host, 'swishby.com');
  assert.equal(twa.startUrl, '/');
  assert.ok(!String(twa.signingKey && twa.signingKey.path).includes('fluxwing'), 'keystore must live outside the repo');
});

// Play re-signs what it ships with the Play App Signing key (Play Console → App integrity), so installs from Play carry that
// certificate, not the upload key's; without it the installed app falls back to a URL bar
test('the Play App Signing key is listed next to the upload key', () => {
  const fps = JSON.parse(read('.well-known/assetlinks.json')).find(l => l.target.package_name === PACKAGE).target.sha256_cert_fingerprints;
  assert.ok(fps.includes('70:84:8D:B0:C2:CB:6E:9C:24:95:D2:B1:D2:37:34:FA:B8:B3:F7:F3:9C:91:E1:A7:2E:12:45:0C:04:8E:EF:53'), 'Play App Signing key missing');
  assert.ok(fps.includes('BA:79:B4:CA:15:9C:3B:DD:CD:99:D3:EC:D3:81:AE:F7:84:05:5F:08:4A:BB:E8:B3:88:DA:F0:A4:A0:FE:1B:73'), 'upload key missing');
});
