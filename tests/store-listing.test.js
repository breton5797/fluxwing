// Store listing copy (docs/launch/store-listing.json): every launch language is filled and fits the Google Play / App Store field limits
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const L = JSON.parse(readFileSync(new URL('../docs/launch/store-listing.json', import.meta.url), 'utf8'));
const LANGS = ['en', 'ko', 'ja', 'es', 'pt', 'id', 'fr', 'de', 'vi', 'th', 'hi', 'zh', 'es_ES', 'pt_PT'];
// Limits in characters as both consoles count them (code points)
const LIMITS = { play: { title: 30, short: 80, full: 4000, notes: 500 }, apple: { name: 30, subtitle: 30, keywords: 100, promo: 170, description: 4000 } };
const len = s => [...s].length;

test('every launch language has both store listings', () => {
  for (const l of LANGS) for (const s of Object.keys(LIMITS)) assert.ok(L[l] && L[l][s], `${l}.${s} missing`);
});

test('every field is filled and within its limit', () => {
  for (const l of LANGS) for (const [s, f] of Object.entries(LIMITS)) for (const [k, max] of Object.entries(f)) {
    const v = L[l][s][k];
    assert.equal(typeof v, 'string', `${l}.${s}.${k}`);
    assert.ok(v.trim().length > 0, `${l}.${s}.${k} empty`);
    assert.ok(len(v) <= max, `${l}.${s}.${k} is ${len(v)} > ${max}`);
  }
});

test('names carry the brand and Apple keywords are comma lists without spaces after commas', () => {
  for (const l of LANGS){
    assert.match(L[l].play.title, /SWISHBY/);
    assert.match(L[l].apple.name, /SWISHBY/);
    assert.doesNotMatch(L[l].apple.keywords, /,\s/, `${l} keywords waste characters on spaces`);
    assert.doesNotMatch(L[l].apple.keywords, /swishby/i, `${l} keywords repeat the app name`);
  }
});

test('no copy promises a reward for installing, reviewing or sharing (store policy)', () => {
  const bad = /download (and|to) (get|earn)|rate us|review.*(reward|gem)|share.*(reward|gem)|다운로드하면|리뷰.*보상/i;
  for (const l of LANGS) for (const s of Object.keys(LIMITS)) for (const v of Object.values(L[l][s])) assert.doesNotMatch(v, bad);
});

test('release notes (Play What is new, 1.0.0) promise nothing the game does not have', () => {
  for (const l of LANGS){
    const n = L[l].play.notes;
    assert.doesNotMatch(n, /https?:|reward|bonus|gift/i, `${l} notes: no links or pre-registration rewards (there are none)`);
  }
  assert.match(L.en.play.notes, /50 stages/);
  assert.match(L.en.play.notes, /daily/i);
});
