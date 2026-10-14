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
// no messenger has seen with the old picture. The file must exist next to the page.
test('the share image has its own SWISHBY address and the file is there', () => {
  const html = read('../index.html');
  const m = html.match(/<meta property="og:image" content="https:\/\/breton5797\.github\.io\/fluxwing\/([^"]+)">/);
  assert.ok(m, 'og:image missing');
  assert.equal(m[1], 'og-swishby.png');
  assert.ok(readFileSync(new URL('../' + m[1], import.meta.url)).length > 10000);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/breton5797\.github\.io\/fluxwing\/og-swishby\.png">/);
});

test('the title, the share title and the install name say SWISHBY', () => {
  const html = read('../index.html'), man = JSON.parse(read('../manifest.webmanifest'));
  assert.match(html, /<title>SWISHBY 2027<\/title>/);
  assert.match(html, /<meta property="og:title" content="SWISHBY 2027">/);
  assert.equal(man.short_name, 'SWISHBY');
});
