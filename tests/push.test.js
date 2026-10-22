// Push notifications for the iOS app: the device-token table and RPCs (supabase/schema.sql PUSH), the feed trigger that wakes the
// push-send edge function, the function's pure helpers (supabase/functions/push-send/lib.js: alert text, APNs JWT, which tokens get
// which alert) and the page wiring. The alert copy is the game's own (I18N ntOn / ntBest).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadI18N } from './helpers/i18n.js';
import { alertFor, wants, apnsJwt, apnsHost, LANGS } from '../supabase/functions/push-send/lib.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const sql = read('supabase/schema.sql'), html = read('index.html');
const TEXTS = JSON.parse(read('supabase/functions/push-send/texts.json'));

test('the push copy is the game copy, in every language', () => {
  const I = loadI18N();
  assert.deepEqual(LANGS, ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi',
    'zh_TW', 'nl', 'ru', 'ms', 'nb', 'ar', 'it', 'tr', 'pl', 'fi', 'he']);
  assert.deepEqual(Object.keys(TEXTS), LANGS);
  for (const l of Object.keys(I)) assert.ok(LANGS.includes(l), `${l}: the game speaks it, push-send must too`);
  for (const l of LANGS) {
    assert.ok(TEXTS[l].on.includes('{n}') && TEXTS[l].best.includes('{n}') && TEXTS[l].best.includes('{s}'), l);
    if (I[l]) assert.deepEqual(TEXTS[l], { on: I[l].ntOn, best: I[l].ntBest }, l);
  }
});

test('alertFor: the sender name and score filled in, the language falls back to English, unknown kinds send nothing', () => {
  assert.deepEqual(alertFor(TEXTS, 'ko', 'on', 'Mina', 0), { title: 'SWISHBY', body: 'Mina님이 접속했어요' });
  assert.deepEqual(alertFor(TEXTS, 'en', 'best', 'Joon', 87), { title: 'SWISHBY', body: 'Joon set a new best: 87!' });
  assert.equal(alertFor(TEXTS, 'xx', 'on', 'A', 0).body, 'A is online');
  assert.equal(alertFor(TEXTS, 'zh_TW', 'on', 'A', 0).body, 'A上線了');
  assert.equal(alertFor(TEXTS, 'he', 'best', 'A', 9).body, 'שיא חדש ל-A: 9!');
  assert.equal(alertFor(TEXTS, 'en', 'other', 'A', 0), null);
  assert.equal(alertFor(TEXTS, 'en', 'on', '', 0).body, 'Pilot is online');
  assert.equal(alertFor(TEXTS, 'en', 'on', 'x'.repeat(40), 0).body.length <= 14 + ' is online'.length, true);
});

test('wants: a token gets an alert only for the kinds its player kept on', () => {
  assert.equal(wants({ kinds: { on: true, best: false } }, 'on'), true);
  assert.equal(wants({ kinds: { on: true, best: false } }, 'best'), false);
  assert.equal(wants({ kinds: null }, 'best'), true, 'no preference stored: everything');
  assert.equal(wants({ kinds: { on: true } }, 'shop'), false);
});

test('apnsJwt: an ES256 token for the key id and team that Apple verifies with the public key', async () => {
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
  const p8 = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
  const jwt = await apnsJwt(p8, 'ABC123DEFG', '6SGPPQF3VQ', 1792500000);
  const [h, p, s] = jwt.split('.');
  const dec = x => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepEqual(dec(h), { alg: 'ES256', kid: 'ABC123DEFG' });
  assert.deepEqual(dec(p), { iss: '6SGPPQF3VQ', iat: 1792500000 });
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${p}`));
  assert.equal(ok, true);
  assert.equal(apnsHost(true), 'https://api.sandbox.push.apple.com');
  assert.equal(apnsHost(false), 'https://api.push.apple.com');
});

test('schema: tokens are private, written only through the caller-scoped RPCs, and leave with the account', () => {
  assert.match(sql, /create table if not exists private\.fw_push \(/);
  const tbl = sql.match(/create table if not exists private\.fw_push \(([\s\S]*?)\n\);/)[1];
  assert.match(tbl, /player_id\s+uuid\s+not null references auth\.users \(id\) on delete cascade/);
  assert.match(tbl, /token\s+text\s+primary key/);
  assert.match(sql, /alter table private\.fw_push enable row level security;/);
  assert.match(sql, /revoke all on table private\.fw_push from public, anon, authenticated;/);
  for (const [p, w, a] of [['fw_push_register', 'push_register', 'text, jsonb, text'], ['fw_push_unregister', 'push_unregister', 'text']]) {
    assert.match(sql, new RegExp(`function private\\.${p}\\([^)]*\\)[\\s\\S]*?security definer set search_path = ''`), p);
    assert.match(sql, new RegExp(`revoke all on function private\\.${p}\\(${a}\\)\\s+from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function private\\.${p}\\(${a}\\)\\s+to authenticated, service_role;`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${w}\\(${a}\\)\\s+from public, anon;`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${w}\\(${a}\\)\\s+to authenticated;`));
  }
  assert.match(sql, /fw_reports, fw_push\)/, 'the delete_me comment lists it');
});

test('schema: the feed trigger calls push-send only where pg_net and the vault secret exist, and never blocks the feed', () => {
  const fn = sql.match(/function private\.fw_push_hook\(\)[\s\S]*?\$\$;/)[0];
  assert.match(fn, /to_regproc\('net\.http_post'\)/);
  assert.match(fn, /vault\.decrypted_secrets/);
  assert.match(fn, /execute /, 'dynamic SQL: the function compiles without pg_net');
  assert.match(fn, /exception when others then/);
  assert.match(fn, /exists \(select 1 from private\.fw_push/, 'no call for players without a device');
  assert.match(sql, /create trigger fw_push_hook after insert on private\.fw_social_feed/);
  const rh = read('supabase/rehearsal/push.sql');
  assert.match(rh, /set role authenticated;/);
  for (const s of ['push_register', 'push_unregister', 'fw_bad_input', 'delete_me', 'social_hello']) assert.ok(rh.includes(s), s);
});

test('the function: verify_jwt off, the hook secret checked, dead tokens removed', () => {
  const fn = read('supabase/functions/push-send/index.ts');
  assert.doesNotMatch(fn, /PUSH_HOOK_SECRET/, 'no copy of the secret outside the vault');
  assert.match(fn, /x-push-secret/);
  assert.match(fn, /rpc\('push_hook_ok'/, 'the database checks the secret it holds');
  const ok = sql.match(/function private\.fw_push_hook_ok\(p_secret text\)[\s\S]*?\$\$;/)[0];
  assert.match(ok, /vault\.decrypted_secrets/);
  assert.match(ok, /execute /, 'compiles without the vault');
  assert.match(sql, /grant execute on function public\.push_hook_ok\(text\)\s+to service_role;/);
  assert.match(sql, /revoke all on function public\.push_hook_ok\(text\)\s+from public, anon, authenticated;/);
  assert.match(sql, /gen_random_bytes\(32\)/, 'the documented setup makes the secret inside the database');
  assert.match(fn, /410/);
  assert.match(fn, /BadDeviceToken/);
  assert.match(fn, /rpc\('push_drop'/);
  assert.match(sql, /grant execute on function public\.push_drop\(text\[\]\)\s+to service_role;/, 'only the function may drop tokens');
  assert.match(sql, /revoke all on function public\.push_drop\(text\[\]\)\s+from public, anon, authenticated;/);
  assert.match(read('supabase/config.toml'), /\[functions\.push-send\]\s*\nverify_jwt = false/);
});

test('page wiring: the app registers its token while alerts are on, drops it when they go off; foreground pushes stay silent', () => {
  assert.match(html, /natPlug\('PushNotifications'\)/);
  assert.match(html, /'push_register'/);
  assert.match(html, /'push_unregister'/);
  assert.match(html, /'fw27_ptok'/, 'the token is device-only (FS_LOCAL)');
  const I = loadI18N();
  for (const l of LANGS.filter(l => I[l])) assert.ok(I[l].ntOffApp && (l === 'en' || I[l].ntOffApp !== I.en.ntOffApp), l + '.ntOffApp');
  assert.doesNotMatch(I.en.ntOffApp, /browser/i);
  const cap = JSON.parse(read('capacitor.config.json'));
  assert.deepEqual(cap.plugins.PushNotifications.presentationOptions, [], 'the page shows its own toasts while open');
});
