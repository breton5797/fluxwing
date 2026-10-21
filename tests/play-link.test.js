// Google Play pre-registration link on the web menu: the pure rule (who sees it) from the playlink block of index.html,
// the address it opens, and the wiring. Inside the Android app (TWA / installed PWA), on iOS and in the artifact it stays hidden.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadI18N } from './helpers/i18n.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const block = html.match(/\/\* playlink:start[\s\S]*?\/\* playlink:end \*\//);
const P = block ? new Function(`${block[0]}\nreturn {PLAY_URL, playLinkShow};`)() : {};

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

test('the link opens the Play listing of com.minimalkorea.swishby with a web referrer', () => {
  assert.ok(block, 'playlink block exists');
  const u = new URL(P.PLAY_URL);
  assert.equal(u.origin + u.pathname, 'https://play.google.com/store/apps/details');
  assert.equal(u.searchParams.get('id'), 'com.minimalkorea.swishby');
  assert.equal(u.searchParams.get('referrer'), 'utm_source=swishby_web&utm_medium=menu');
});

test('playLinkShow: Android browsers and desktops see it; the app itself, iOS and the artifact do not', () => {
  const base = { ua: ANDROID, standalone: false, referrer: '', art: false, touch: 5 };
  assert.equal(P.playLinkShow(base), true, 'Android Chrome');
  assert.equal(P.playLinkShow({ ...base, ua: DESKTOP, touch: 0 }), true, 'desktop');
  assert.equal(P.playLinkShow({ ...base, standalone: true }), false, 'TWA / installed app');
  assert.equal(P.playLinkShow({ ...base, referrer: 'android-app://com.minimalkorea.swishby/' }), false, 'first TWA load');
  assert.equal(P.playLinkShow({ ...base, ua: IPHONE }), false, 'iPhone');
  assert.equal(P.playLinkShow({ ...base, ua: IPAD_DESKTOP_UA, touch: 5 }), false, 'iPad asking for the desktop site');
  assert.equal(P.playLinkShow({ ...base, ua: IPAD_DESKTOP_UA, touch: 0 }), true, 'a Mac');
  assert.equal(P.playLinkShow({ ...base, art: true }), false, 'artifact');
  assert.equal(P.playLinkShow(null), false);
});

test('index.html: a hidden link in the menu, opened in a new tab, shown by the rule', () => {
  assert.match(html, /<a class="[^"]*playpre[^"]*" id="playPre"[^>]*target="_blank"[^>]*rel="noopener"[^>]*hidden/);
  assert.match(html, /\$\('playPre'\)\.href = PLAY_URL/);
  assert.match(html, /\$\('playPre'\)\.hidden = !playLinkShow\(/);
});

test('the copy exists in every language and says pre-register, not download', () => {
  const I = loadI18N();
  for (const l of ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi'])
    assert.ok(I[l].playPre && (l === 'en' || I[l].playPre !== I.en.playPre), l);
  assert.match(I.en.playPre, /pre-register/i);
  assert.doesNotMatch(I.en.playPre, /download|install/i);
});
