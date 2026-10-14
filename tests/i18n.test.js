import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadI18N } from './helpers/i18n.js';

const I = loadI18N();
const en = I.en;
const KEYS = Object.keys(en).filter(k => typeof en[k] === 'string');
const LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi'];
const ph = s => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(' ') + ' |' + (String(s).split('\n').length - 1);
// strings that are the same in every language on purpose: game terms, unit names, symbols
const SAME_OK = 40;

test('the game offers every supported language', () => {
  assert.deepEqual(LANGS.filter(l => !I[l]), []);
  for (const l of LANGS) assert.ok(I[l]._n && I[l]._n !== en._n || l === 'en', l + ' needs its own name in the menu');
});

for (const l of LANGS.filter(l => l !== 'en')){
  test(`${l}: translated, not English`, () => {
    const same = KEYS.filter(k => I[l][k] === en[k] && /[A-Za-z]{3}/.test(en[k]));
    assert.ok(same.length <= SAME_OK, `${same.length} strings still read exactly as the English (allowed ${SAME_OK}): ${same.slice(0, 12).join(', ')}`);
  });
  test(`${l}: placeholders and line breaks match the English`, () => {
    const bad = KEYS.filter(k => I[l][k] !== undefined && ph(I[l][k]) !== ph(en[k]));
    assert.deepEqual(bad, []);
  });
  if (l !== 'ko') test(`${l}: no Korean left in the text`, () => {
    assert.deepEqual(KEYS.filter(k => /[가-힣]/.test(I[l][k] || '')), []);
  });
}
