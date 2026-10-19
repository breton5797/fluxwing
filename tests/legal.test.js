// Legal pages: privacy.html and terms.html (Korean first, English below), named operator and contact, linked from the
// sign-in sheet and the help card in every language, shipped with the portal builds, and free of third-party requests.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { loadI18N } from './helpers/i18n.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi'];
const OPERATOR = '미니멀코리아', EMAIL = 'minimalkorea@naver.com';

for (const page of ['privacy.html', 'terms.html']){
  test(`${page}: exists, names the operator and the contact, Korean then English`, () => {
    assert.ok(existsSync(new URL(page, root)), page + ' missing');
    const h = read(page);
    assert.match(h, /^<!doctype html>/i);
    assert.match(h, /<html lang="ko">/);
    assert.match(h, /<meta name="viewport"/);
    assert.ok(h.includes(OPERATOR), 'operator name');
    assert.ok(h.includes(EMAIL), 'contact email');
    assert.ok(h.includes('SWISHBY'), 'service name');
    assert.match(h, /<section id="ko"/, 'Korean section');
    assert.match(h, /<section id="en" lang="en"/, 'English section');
    assert.match(h, /시행일|Effective/, 'effective date');
  });
  test(`${page}: no third-party requests (no fonts, scripts or trackers)`, () => {
    const h = read(page);
    assert.ok(!/https?:\/\/(fonts\.|cdn\.|www\.googletagmanager|sdk\.)/.test(h), 'loads nothing from a third party');
    assert.ok(!/<script/i.test(h), 'no script');
  });
}

test('privacy.html states what the game actually does with data', () => {
  const h = read('privacy.html');
  for (const must of ['Supabase', 'Google', 'localStorage', '만 14세', 'GitHub Pages', 'fonts.googleapis.com', 'CrazyGames', 'Poki']) {
    assert.ok(h.includes(must), 'privacy policy must mention ' + must);
  }
});

test('terms.html covers the rules that the server enforces', () => {
  const h = read('terms.html');
  for (const must of ['RP', '시즌', '닉네임', '환불', 'MONARCH']) assert.ok(h.includes(must), 'terms must mention ' + must);
});

test('index.html links both pages from the sign-in sheet and the help card', () => {
  const h = read('index.html');
  const auth = h.slice(h.indexOf('id="authPick"'), h.indexOf('id="authCodeForm"'));
  const help = h.slice(h.indexOf('class="card helpcard"'), h.indexOf('id="vsScr"'));
  for (const part of [auth, help]){
    assert.match(part, /href="terms\.html"[^>]*data-i18n="legalTerms"/);
    assert.match(part, /href="privacy\.html"[^>]*data-i18n="legalPrivacy"/);
  }
  assert.match(auth, /data-i18n="legalAgree"/, 'the sign-in sheet says what signing in agrees to');
  assert.match(h, /\.legal a\{/, 'links are styled');
});

test('every language has its own legal strings', () => {
  const I = loadI18N();
  for (const l of LANGS){
    for (const k of ['legalTerms', 'legalPrivacy', 'legalAgree']){
      assert.ok(typeof I[l][k] === 'string' && I[l][k].length > 2, `${l}.${k}`);
      if (l !== 'en') assert.notEqual(I[l][k], I.en[k], `${l}.${k} still reads as the English`);
    }
  }
});

test('the portal builds ship the legal pages', () => {
  const s = read('scripts/portal-build.mjs');
  assert.match(s, /'privacy\.html'/); assert.match(s, /'terms\.html'/);
});
