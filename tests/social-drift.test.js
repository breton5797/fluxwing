// Client constants and texts must agree with supabase/schema.sql (same pattern as vs-rules.test.js).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

test('friend code alphabet: client Crockford base32 matches the server column check', () => {
  assert.match(html, /const SOC_ALPH = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'/);
  assert.match(sql, /code ~ '\^\[0-9A-HJKMNP-TV-Z\]\{8\}\$'/);          // same set, as a range
  assert.match(sql, /c_alph constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ'/);
});

test('guild cost: GUILD_COST, the i18n button texts and the schema comment all say 300,000', () => {
  assert.match(html, /const GUILD_COST = 300000;/);
  const texts = [...html.matchAll(/gdCreateBtn:'([^']+)'/g)].map(m => m[1]);
  assert.equal(texts.length, 4);
  for (const x of texts) assert.ok(/300[,.]?000/.test(x), x);
  assert.match(sql, /Creation costs 300,000 coins/);
});

test('guild bounds: capacity 30 and name 2..14 on both sides', () => {
  assert.match(sql, /members between 0 and 30/);
  assert.match(sql, /g\.members >= 30/);
  assert.match(sql, /char_length\(name\) between 2 and 14/);
  assert.match(html, /maxlength="14"[^>]*spellcheck="false"/);
});

test('alert batching lives in fw_social_cfg and the poll stays polite', () => {
  assert.match(sql, /interval '15 minutes', interval '10 minutes', interval '3 days'/);   // hello_gap, best_gap, feed_keep
  assert.match(html, /document\.hidden \? 60000 : 30000/);
});

test('every new social i18n key exists in ko/en/ja/zh', () => {
  const langs = [...html.matchAll(/^(ko|en|ja|zh):\{fr:/gm)];
  assert.equal(langs.length, 4, 'I18N_S languages');
  const block = html.match(/const I18N_S = \{[\s\S]*?\}\};/)[0];
  const seg = {}; let cur = null;
  for (const line of block.split('\n')){
    const m = line.match(/^(ko|en|ja|zh):\{/); if (m) cur = m[1];
    if (cur) seg[cur] = (seg[cur] || '') + line + '\n';   // a language's lines run until the next language header
  }
  for (const k of ['fr', 'frCode', 'frWarn', 'push', 'ntOn', 'ntBest', 'ntKOn', 'ntKBest', 'vsM4', 'searching4', 'vsIn4', 'vs4Rules',
    'gd', 'gdCreateBtn', 'gdApply', 'gdUnmet', 'gdFull', 'gdOwner'])
    for (const l of ['ko', 'en', 'ja', 'zh'])
      assert.match(seg[l], new RegExp(`\\b${k}:'`), `${l}.${k}`);
});
