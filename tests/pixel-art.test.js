import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// PIXEL is a winged pixel-art piggy bank (a coin unit), not a yellow pixel bird: the old 8x7 yellow bird with a white eye and an orange beak
// read as the Flappy Bird character. These checks keep the sprite and its colours away from that look.
const html = readIndex();
const rows = name => JSON.parse(html.match(new RegExp(`const ${name} = (\\[[^\\]]*\\]);`))[1].replace(/'/g, '"'));
const row = html.match(/\{ id:'pixel'.*$/m)[0];
const hue = key => Number(row.match(new RegExp(`${key}:\\[(\\d+)`))[1]);

test('both frames are a well-formed grid of the same size', () => {
  const a = rows('PIX_A'), b = rows('PIX_B');
  assert.equal(a.length, b.length);
  for (const r of [...a, ...b]) assert.equal(r.length, a[0].length);
});

test('the sprite is a pig: snout and nostril, ear, coin slot with a coin, legs; no beak', () => {
  for (const f of [rows('PIX_A'), rows('PIX_B')]){
    const s = f.join('');
    for (const ch of 'SNECGLK') assert.ok(s.includes(ch), `frame has ${ch}`);
    assert.ok(!s.includes('O'), 'no orange beak');
  }
  const pal = html.slice(html.indexOf('function drawPixel('), html.indexOf('function drawPixel(') + 900);
  for (const ch of 'PSNECGLKWT') assert.match(pal, new RegExp(`\\b${ch}:`), `palette has ${ch}`);
});

test('the body is pink, not the yellow of the old bird', () => {
  const h = hue('col');
  assert.ok(h >= 320 || h <= 15, `body hue ${h} is pink/red`);
});
