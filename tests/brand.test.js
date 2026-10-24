import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

// The game is SWISHBY. The old name may stay only where changing it would cost players something:
// the page address (share links, og tags) and the daily course seed.
const KEPT = [/breton5797\.github\.io\/fluxwing/g, /hashStr\('fluxwing27:'/g];
const OLD = /flux[\s\-_]*wing|플럭스|フラックス/gi;

for (const file of ['../index.html', '../manifest.webmanifest']){
  test(`${file.slice(3)} carries no old name where a player can read it`, () => {
    const text = KEPT.reduce((s, rx) => s.replace(rx, ''), read(file));
    const found = [...text.matchAll(OLD)].map(m => text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 20).replace(/\s+/g, ' '));
    assert.deepEqual(found, []);
  });
}

// Messengers keep a link preview's image by its address, so the renamed game's picture lives at an address
// no messenger has seen with the old picture, on the custom domain. The file must exist next to the page.
test('the share image has its own SWISHBY address and the file is there', () => {
  const html = read('../index.html');
  const m = html.match(/<meta property="og:image" content="https:\/\/swishby\.com\/([^"]+)">/);
  assert.ok(m, 'og:image missing');
  assert.equal(m[1], 'og-swishby.png');
  assert.ok(readFileSync(new URL('../' + m[1], import.meta.url)).length > 10000);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/swishby\.com\/og-swishby\.png">/);
});

// Browsers read the install manifest only from <head>, and link-preview crawlers may stop at </head>.
test('page metadata sits in <head>, and the page starts dark', () => {
  const html = read('../index.html');
  const head = html.slice(html.indexOf('<head>'), html.indexOf('</head>'));
  for (const tag of ['<title>SWISHBY 2027</title>', '<meta name="description"', '<link rel="manifest"', '<meta name="theme-color"',
    '<meta name="color-scheme" content="dark">',   // opts out of forced browser darkening (Samsung Internet dark mode dimmed the menu)
    '<link rel="icon"', '<link rel="apple-touch-icon"', '<meta property="og:image"', '<meta property="og:title"', '<meta name="twitter:image"'])
    assert.ok(head.includes(tag), tag + ' is not inside <head>');
  assert.equal(html.split('</head>').length, 2);
  assert.doesNotMatch(head, /#faf9f5|color-scheme:light/, 'the first paint must not be the light page shell');
});

// The old game's worker (registered by src/main.js for v2.html) answered offline navigations with v2.html.
// Browsers re-fetch sw.js on navigation; this version must only clear its caches and unregister itself.
test('sw.js retires itself instead of serving the old game', () => {
  const sw = read('../sw.js');
  assert.match(sw, /registration\.unregister\(\)/);
  assert.match(sw, /caches\.delete/);
  assert.doesNotMatch(sw, /addEventListener\('fetch'|cache\.addAll|caches\.match|clients\.claim/);   // serves nothing, caches nothing
  assert.doesNotMatch(read('../index.html'), /serviceWorker\.register/);
});

test('the title, the share title and the install name say SWISHBY', () => {
  const html = read('../index.html'), man = JSON.parse(read('../manifest.webmanifest'));
  assert.match(html, /<title>SWISHBY 2027<\/title>/);
  assert.match(html, /<meta property="og:title" content="SWISHBY 2027">/);
  assert.equal(man.short_name, 'SWISHBY');
});

test('the menu shows the SWISHBY logo image and the file ships with the page', () => {
  const html = read('../index.html');
  const m = html.match(/<img class="logoimg" src="(logo-swishby\.png)" alt="SWISHBY 2027"/);
  assert.ok(m, 'menu logo image tag');
  assert.ok(readFileSync(new URL('../' + m[1], import.meta.url)).length > 10000, 'logo file is there');
});

test('CJK text wraps at word boundaries', () => {
  const css = read('../styles.css');
  assert.match(css, /:lang\(ko\)[^{]*\{[^}]*word-break:\s*keep-all[^}]*overflow-wrap:\s*anywhere/);
  assert.match(css, /:lang\(ja\)[^{]*\{[^}]*word-break:\s*auto-phrase/);
  assert.match(css, /:lang\(ja\) \.btn[^{]*\{[^}]*white-space:\s*nowrap/);
});
