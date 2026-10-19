// Sign in with Apple: Supabase's Apple provider wants a "Secret Key (for OAuth)", which is a JWT you sign with the
// .p8 key from the Apple Developer portal (valid up to 6 months, then run this again). The key never leaves this
// machine and the JWT is written to a file, not printed, so nothing secret lands in a chat or a terminal scrollback.
//   node scripts/apple-client-secret.mjs --team <Team ID> --key-id <Key ID> --client <Services ID> --p8 <path/to/AuthKey_XXXX.p8> [--out apple-secret.txt]
// Then paste the file's one line into Supabase -> Authentication -> Providers -> Apple -> "Secret Key (for OAuth)".
import { readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const MAX_SECONDS = 15777000;   // Apple's ceiling: 6 months

const b64url = b => Buffer.from(b).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');

/** Builds the client secret JWT. p8: the key file's PEM text. now: seconds since the epoch (defaults to the clock). */
export function appleClientSecret({ teamId, keyId, clientId, p8, now = Math.floor(Date.now() / 1000) }) {
  for (const [k, v] of Object.entries({ teamId, keyId, clientId })) if (typeof v !== 'string' || !/^[A-Za-z0-9._-]{3,}$/.test(v)) throw new Error(k + ' looks wrong');
  if (typeof p8 !== 'string' || !p8.includes('PRIVATE KEY')) throw new Error('p8 must be the text of the .p8 key file');
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: teamId, iat: now, exp: now + MAX_SECONDS, aud: 'https://appleid.apple.com', sub: clientId };
  const signingInput = b64url(JSON.stringify(header)) + '.' + b64url(JSON.stringify(payload));
  const key = createPrivateKey({ key: p8, format: 'pem' });
  const sig = sign('sha256', Buffer.from(signingInput), { key, dsaEncoding: 'ieee-p1363' });
  return { jwt: signingInput + '.' + b64url(sig), exp: payload.exp };
}

function arg(name) { const i = process.argv.indexOf('--' + name); return i > 0 ? process.argv[i + 1] : undefined; }

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const teamId = arg('team'), keyId = arg('key-id'), clientId = arg('client'), p8Path = arg('p8'), out = arg('out') || 'apple-secret.txt';
  if (!teamId || !keyId || !clientId || !p8Path) {
    console.error('usage: node scripts/apple-client-secret.mjs --team <Team ID> --key-id <Key ID> --client <Services ID> --p8 <AuthKey.p8> [--out apple-secret.txt]');
    process.exit(2);
  }
  const { jwt, exp } = appleClientSecret({ teamId, keyId, clientId, p8: readFileSync(p8Path, 'utf8') });
  writeFileSync(out, jwt + '\n', { mode: 0o600 });
  console.log(`written: ${out} (one line; paste it into Supabase -> Apple -> Secret Key). Expires ${new Date(exp * 1000).toISOString().slice(0, 10)}; run again before then.`);
}
