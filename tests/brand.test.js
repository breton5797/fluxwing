import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
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
// sw.js now serves the live game offline (tests/sw.test.js); it must never fall back to the old page.
test('sw.js never serves the old game', () => {
  assert.doesNotMatch(read('../sw.js'), /v2\.html/);
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

test('first paint shows a boot indicator and nothing blocks it', () => {
  const html = read('../index.html');
  const body = html.indexOf('<body'), boot = html.indexOf('id="boot"'), script = html.indexOf('<script', body);
  assert.ok(boot > body && boot < script, 'boot indicator is in the body before the first script');
  assert.match(html, /<link rel="preload" as="style" href="https:\/\/fonts\.googleapis\.com\/css2[^"]*">/);
  assert.match(html, /<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2[^"]*" media="print" onload="this\.media='all'">/);
  assert.match(html, /<picture><source srcset="logo-swishby\.webp" type="image\/webp"><img class="logoimg" src="logo-swishby\.png"/);
  assert.ok(statSync(new URL('../logo-swishby.webp', import.meta.url)).size < 60 * 1024, 'webp logo under 60 KB');
  assert.match(html, /\$\('boot'\)\.remove\(\)/);
  assert.match(html, /#boot\{[^}]*z-index:\s*9\d/, 'the spinner sits above the stage and the menu overlay');
});

test('the effects button does nothing during a live ranked match (it used to pause, which versus now ignores)', () => {
  const html = read('../index.html');
  assert.match(html, /\$\('fxBtn'\)\.addEventListener\('click', e => \{[^\n]*if \(mode === 'versus' && state === 'play'\) return;/);
});

test('short screens push the game-over card below the HUD and tighten it', () => {
  const html = read('../index.html');
  assert.match(html, /@media \(max-height:700px\)\{#over\{justify-content:flex-start;padding-top:calc\(64px \+ env\(safe-area-inset-top,0px\)\)\}#over \.card\{gap:8px;padding:14px 16px\}/);
  assert.match(html, /@media \(max-height:700px\)\{[^\n]*#over \.stats\{grid-template-columns:repeat\(4,1fr\)/, 'stats go to one row on short screens');
});

test('only the pause button stays on screen while a run is live', () => {
  const html = read('../index.html');
  assert.match(html, /body\.playing #topBtns \.ib:not\(#pauseBtn\)\{display:none\}/);
  assert.match(html, /document\.body\.classList\.toggle\('playing', state === 'play'\)/);
});

test('landscape phones get a rotate prompt instead of a squashed stage', () => {
  const html = read('../index.html');
  assert.match(html, /#rotate\{display:none\}/);
  assert.match(html, /@media \(orientation:landscape\) and \(max-height:500px\) and \(pointer:coarse\)\{#rotate\{display:grid[^}]*z-index:98[^}]*\}\}/);
  assert.match(html, /<div id="rotate" role="alert"><b data-i18n="rotate"><\/b><\/div>/);
});

test('the public build declares no ads, matching the Play listing', () => {
  assert.match(read('../index.html'), /window\.FW_CONFIG = \{ ads: 'none'/);
});

test('Escape closes the daily intro card itself, not just the keyboard lock', () => {
  const html = read('../index.html');
  assert.match(html, /else if \(!\$\('dIntro'\)\.hidden\) dIntroClose\(\);/);
  assert.match(html, /function dIntroClose\(\)\{ \$\('dIntro'\)\.hidden = true; lbOpen = false; \}/);
});

test('turning a phone sideways mid-run pauses the run behind the rotate prompt', () => {
  const html = read('../index.html');
  const css = html.match(/@media (\(orientation:landscape\) and \(max-height:500px\) and \(pointer:coarse\))\{#rotate/)[1];
  assert.ok(html.includes(`const ROTATE_MQ = matchMedia('${css}');`), 'the pause listens to the same query as the CSS');
  assert.match(html, /ROTATE_MQ\.addEventListener\('change', \(\) => \{ if \(ROTATE_MQ\.matches && state === 'play'\) togglePause\('hidden'\); \}\);/);
  assert.match(html, /<div id="rotate" role="alert"><b data-i18n="rotate"><\/b><\/div>/);
});
