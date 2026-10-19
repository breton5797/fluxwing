// scripts/apple-client-secret.mjs signs the JWT Supabase wants as Apple's "Secret Key (for OAuth)".
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, verify } from 'node:crypto';
import { appleClientSecret } from '../scripts/apple-client-secret.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const p8 = privateKey.export({ type: 'pkcs8', format: 'pem' });
const dec = s => JSON.parse(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));

test('the JWT carries Apple\'s claims, lasts 6 months and verifies against the key', () => {
  const now = 1_760_000_000;
  const { jwt, exp } = appleClientSecret({ teamId: 'ABCDE12345', keyId: 'KEYID12345', clientId: 'com.swishby.web', p8, now });
  const [h, p, s] = jwt.split('.');
  assert.deepEqual(dec(h), { alg: 'ES256', kid: 'KEYID12345', typ: 'JWT' });
  assert.deepEqual(dec(p), { iss: 'ABCDE12345', iat: now, exp: now + 15777000, aud: 'https://appleid.apple.com', sub: 'com.swishby.web' });
  assert.equal(exp, now + 15777000);
  const ok = verify('sha256', Buffer.from(h + '.' + p), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
  assert.equal(ok, true);
  assert.ok(!jwt.includes('='), 'base64url, no padding');
});

test('refuses obviously wrong input instead of signing garbage', () => {
  assert.throws(() => appleClientSecret({ teamId: '', keyId: 'K', clientId: 'c', p8 }), /teamId/);
  assert.throws(() => appleClientSecret({ teamId: 'ABCDE12345', keyId: 'KEYID12345', clientId: 'com.swishby.web', p8: 'not a key' }), /p8/);
});
