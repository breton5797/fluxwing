// The game's public address is swishby.com, served by Vercel from main; GitHub Pages serves the dev branch at its own
// github.io address with no custom domain, so there is no CNAME file. The Open Graph tags and the share link must say
// swishby.com, and nothing may still point at the old project-site address.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const SITE = 'https://swishby.com/';

test('no CNAME file: GitHub Pages (dev) must not claim swishby.com, which Vercel serves', () => {
  assert.ok(!existsSync(new URL('CNAME', root)), 'CNAME would make GitHub Pages claim swishby.com again');
});

test('index.html: og:url, og:image, twitter:image and SHARE_URL sit on the custom domain', () => {
  const h = read('index.html');
  assert.match(h, new RegExp('<meta property="og:url" content="' + SITE + '">'));
  assert.match(h, new RegExp('<meta property="og:image" content="' + SITE + 'og-swishby\\.png">'));
  assert.match(h, new RegExp('<meta name="twitter:image" content="' + SITE + 'og-swishby\\.png">'));
  assert.match(h, new RegExp("const SHARE_URL = '" + SITE + "';"));
  assert.ok(!h.includes('breton5797.github.io'), 'index.html must not keep the old address');
});

test('the legal pages name the custom domain as the service address', () => {
  for (const p of ['privacy.html', 'terms.html']) assert.ok(!/현재 <code>breton5797/.test(read(p)), p + ' still calls the old address current');
  assert.ok(read('privacy.html').includes('<code>swishby.com</code>'));
});
