// The sign-in sheet (Google / Apple / email code), the provider switches, and the tester flag that unlocks every
// released unit for QA accounts: server table + rpc, client gate, strings in 12 languages.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadI18N } from './helpers/i18n.js';
import { loadCloud } from './helpers/cloud.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html'), sql = read('supabase/schema.sql');
const LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi'];

test('sign-in sheet: brand buttons with logos, an email-code flow with a way back, guest note, signed-in card', () => {
  const sheet = html.slice(html.indexOf('id="authScr"'), html.indexOf('id="lbScr"'));
  assert.match(sheet, /<button class="sbtn google" type="button" id="authGoogle"><svg/);
  assert.match(sheet, /<button class="sbtn apple" type="button" id="authApple" hidden><svg/);
  assert.ok(!/id="authGoogle"[^>]*data-i18n/.test(sheet) && !/id="authApple"[^>]*data-i18n/.test(sheet), 'the label sits in a span, so the logo survives translation');
  for (const id of ['authEmailForm', 'authEmailIn', 'authCodeForm', 'authCodeIn', 'authBackBtn', 'authTakenGo', 'cloudMerge', 'cloudPullBtn', 'authOutBtn', 'authWho', 'authAvatar', 'authLegal']) assert.ok(sheet.includes('id="' + id + '"'), id);
  for (const k of ['authHead', 'authB1', 'authB2', 'authB3', 'authOr', 'authGuest', 'authBack', 'authCloudOn']) assert.ok(sheet.includes('data-i18n="' + k + '"'), k);
  assert.match(html, /\.sbtn\.google\{/); assert.match(html, /\.sbtn\.apple\{/); assert.match(html, /\.acode input\{/);
});

test('authUi: a provider switched on in the dashboard shows up; Apple stays off until then', () => {
  const C = loadCloud();
  const on = { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k' }, ua = 'Mozilla/5.0 (iPhone) Safari';
  assert.equal(C.authUi(on, ua).apple, false);
  assert.equal(C.authUi(on, ua, { apple: true }).apple, true);
  assert.equal(C.authUi(on, ua, { apple: false }).apple, false);
  assert.equal(C.authUi({ ...on, auth: { apple: true } }, ua, { apple: false }).apple, true, 'the config switch still wins');
  assert.equal(C.authUi(on, ua, { google: false }).google, false, 'Google switched off in the dashboard hides the button');
  assert.equal(C.authUi(on, ua, { google: true }).google, true);
  assert.equal(C.authUi(on, ua, null).google, true);
  assert.match(html, /\/auth\/v1\/settings/, 'the client reads the public auth settings');
});

test('every language has the new sign-in strings and the tester notice', () => {
  const I = loadI18N();
  for (const l of LANGS) for (const k of ['authHead', 'authB1', 'authB2', 'authB3', 'authOr', 'authGuest', 'authBack', 'authCloudOn', 'testerOn']) {
    assert.ok(typeof I[l][k] === 'string' && I[l][k].length > 2, `${l}.${k}`);
    if (l !== 'en') assert.notEqual(I[l][k], I.en[k], `${l}.${k} still reads as the English`);
  }
});

test('account deletion: a danger button on the signed-in card, a confirm, one rpc that drops the auth.users row (everything cascades)', () => {
  const sheet = html.slice(html.indexOf('id="authScr"'), html.indexOf('id="lbScr"'));
  assert.match(sheet, /id="authOutBox"[\s\S]*<button class="ghost danger" id="authDelBtn" data-i18n="authDel"><\/button>/, 'the delete button sits on the signed-in card, after sign-out');
  assert.match(html, /\.ghost\.danger\{/);
  assert.match(html, /\$\('authDelBtn'\)\.addEventListener\('click'[^\n]*confirmDlg\(t\('authDelQ'\), authDelete\)/, 'the in-game confirm, never window.confirm');
  assert.ok(html.includes("sbC.rpc('delete_me')"), 'one server call');
  assert.ok(!/window\.confirm\(/.test(html.slice(html.indexOf('async function authDelete'), html.indexOf('async function authDelete') + 800)));
  const I = loadI18N();
  for (const l of LANGS) for (const k of ['authDel', 'authDelQ', 'authDelGo', 'authDelDone', 'authDelFail']) {
    assert.ok(typeof I[l][k] === 'string' && I[l][k].length > 2, `${l}.${k}`);
    if (l !== 'en') assert.notEqual(I[l][k], I.en[k], `${l}.${k} still reads as the English`);
  }
  assert.match(sql, /create or replace function private\.fw_delete_me\(\) returns boolean/);
  assert.match(sql, /delete from auth\.users u where u\.id = v_uid/);
  assert.match(sql, /create or replace function public\.delete_me\(\) returns boolean/);
  assert.match(sql, /revoke all on function public\.delete_me\(\)\s+from public, anon/);
  assert.match(sql, /grant execute on function public\.delete_me\(\) to authenticated/);
  assert.match(sql, /revoke all on function private\.fw_delete_me\(\)\s+from public, anon, authenticated/);
  const priv = read('privacy.html');
  assert.ok(priv.includes('계정 삭제') && /Delete account/.test(priv), 'the privacy policy tells players about the in-game deletion');
});

test('testers: a server-side flag (never the nickname), asked by the client, unlocking every released unit', () => {
  assert.match(sql, /create table if not exists private\.fw_testers \(/);
  assert.match(sql, /create or replace function private\.fw_tester_me\(\) returns boolean/);
  assert.match(sql, /create or replace function public\.tester_me\(\) returns boolean/);
  assert.match(sql, /revoke all on function public\.tester_me\(\)\s+from public, anon/);
  assert.match(sql, /grant execute on function public\.tester_me\(\) to authenticated/);
  assert.match(sql, /revoke all on function private\.fw_tester_me\(\)\s+from public, anon, authenticated/);
  assert.ok(html.includes("sbC.rpc('tester_me')"), 'client asks the server');
  assert.ok(html.includes('const isOwned = b => tester || !b.rarity || owned.has(b.id);'), 'tester flag gates ownership');
  assert.ok(html.includes('id="testerTag"'), 'a visible badge');
  assert.ok(!/nick\s*===\s*'민황'|nick\s*===\s*'브레통'/.test(html), 'no nickname check in the client');
});
