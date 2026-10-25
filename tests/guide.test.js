// Player guide at https://swishby.com/guide/ (Korean): a static page with real game screenshots, linked from the game's
// help card for Korean players only, bundled into the iOS app like the other pages the game links.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { IOS_ASSETS } from '../scripts/ios-build.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const page = () => read('guide/index.html');

test('the guide is a Korean page with its own address and ten sections', () => {
  const h = page();
  assert.match(h, /<html lang="ko">/);
  assert.match(h, /<title>SWISHBY 가이드[^<]*<\/title>/);
  assert.match(h, /<link rel="canonical" href="https:\/\/swishby\.com\/guide\/">/);
  assert.equal((h.match(/<h2 id="s\d+">/g) || []).length, 10, 'ten sections');
  assert.match(h, /href="\.\.\/"/, 'a way back to the game');
});

test('every screenshot exists, lives under guide/img/, has alt text and ships in the iOS bundle', () => {
  const h = page();
  const imgs = [...h.matchAll(/<img [^>]*>/g)].map(m => m[0]);
  assert.ok(imgs.length >= 12, 'at least 12 screenshots');
  for (const tag of imgs){
    const src = tag.match(/src="([^"]+)"/)[1];
    assert.match(src, /^img\/[a-z0-9-]+\.jpg$/, src);
    assert.ok(existsSync(new URL('guide/' + src, root)), src + ' exists');
    assert.ok(IOS_ASSETS.includes('guide/' + src), src + ' is bundled for iOS');
    assert.match(tag, /alt="[^"]{4,}"/, src + ' has alt text');
    assert.match(tag, /loading="lazy"/, src + ' loads lazily');
  }
  assert.ok(IOS_ASSETS.includes('guide/index.html'));
});

test('no third-party requests and no backend', () => {
  const h = page();
  const hosts = [...h.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map(x => x[1].toLowerCase());
  assert.deepEqual([...new Set(hosts.filter(x => x !== 'swishby.com'))], []);
  assert.ok(!/supabase|<script/i.test(h), 'a plain page: no scripts');
});

test('the numbers on the page match the game', () => {
  const h = page();
  for (const fact of ['+34%', '+8%', '+5%', '콤보 10', '09:00', '40,000', '150,000', '8,000', '200코인'])
    assert.ok(h.includes(fact), fact);
});

test('the game links the guide from its help card, shown only in Korean', () => {
  const h = read('index.html');
  const help = h.slice(h.indexOf('class="card helpcard"'), h.indexOf('id="vsScr"'));
  assert.match(help, /<span data-lang-only="ko"><a href="guide\/" target="_blank" rel="noopener">가이드<\/a> · <\/span>/);
  assert.match(h, /querySelectorAll\('\[data-lang-only\]'\)\.forEach\(el => \{ el\.hidden = el\.dataset\.langOnly !== lang; \}\)/);
});
