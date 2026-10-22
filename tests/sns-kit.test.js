// Official SNS profiles (docs/launch/sns-kit.json): one handle everywhere, every bio language filled and within each platform's limit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const K = JSON.parse(readFileSync(new URL('../docs/launch/sns-kit.json', import.meta.url), 'utf8'));
const LANGS = ['en', 'ko', 'ja', 'es', 'pt'];
// Bio limits in characters (code points) as each app counts them
const LIMITS = { tiktok: 80, instagram: 150, x: 160, youtube: 1000 };
const len = s => [...s].length;

test('one handle on every platform, profile links point at swishby.com', () => {
  assert.equal(K.handle, 'swishbygame');
  assert.deepEqual(Object.keys(K.platforms), Object.keys(LIMITS));
  for (const [p, v] of Object.entries(K.platforms)){
    assert.equal(v.handle, K.handle, `${p} handle`);
    assert.match(v.url, new RegExp(`${K.handle}/?$`), `${p} url`);
  }
  assert.equal(K.link, 'https://swishby.com');
  assert.equal(K.name, 'SWISHBY');
});

test('every language has a bio for every platform, filled and within its limit', () => {
  assert.deepEqual(Object.keys(K.bio), LANGS);
  for (const l of LANGS) for (const [p, max] of Object.entries(LIMITS)){
    const v = K.bio[l][p];
    assert.equal(typeof v, 'string', `${l}.${p}`);
    assert.ok(v.trim().length > 0, `${l}.${p} empty`);
    assert.ok(len(v) <= max, `${l}.${p} is ${len(v)} > ${max}`);
  }
});

test('translations are their own text and the long bios carry the site link and the brand', () => {
  for (const l of LANGS.filter(l => l !== 'en')) for (const p of Object.keys(LIMITS))
    assert.notEqual(K.bio[l][p], K.bio.en[p], `${l}.${p} is translated`);
  for (const l of LANGS){
    assert.match(K.bio[l].youtube, /SWISHBY/, `${l}.youtube brand`);
    assert.match(K.bio[l].youtube, /https:\/\/swishby\.com/, `${l}.youtube link`);
  }
});

test('image specs match each platform size', () => {
  assert.deepEqual(K.images.profile, [1080, 1080]);
  assert.deepEqual(K.images.youtubeBanner, [2560, 1440]);
  assert.deepEqual(K.images.xHeader, [1500, 500]);
});
