// The effects screen's own string table (FXTXT in index.html): every game language has its own full entry.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18N } from './helpers/i18n.js';

const html = readIndex();
const I18N = loadI18N();
const a = html.indexOf('const FXTXT = '), b = html.indexOf('};\n  for (const l in I18N)', a);
assert.ok(a > 0 && b > a, 'FXTXT block');
const FXTXT = new Function(`return ${html.slice(a + 'const FXTXT = '.length, b + 1)};`)();
const KEYS = ['fxT', 'fxAuto', 'fxLow', 'fxMid', 'fxHigh', 'fxShake', 'fxFlash', 'fxRm', 'fxOn', 'fxOff', 'fxMusic', 'fxSfx'];

test('FXTXT covers all 23 game languages, nothing extra', () => {
  assert.equal(Object.keys(I18N).length, 23);
  assert.deepEqual(Object.keys(FXTXT).sort(), Object.keys(I18N).sort());
});

test('every FXTXT entry has every key, none empty', () => {
  assert.deepEqual(Object.keys(FXTXT.en).sort(), [...KEYS].sort());
  for (const l in FXTXT) for (const k of KEYS) assert.ok(typeof FXTXT[l][k] === 'string' && FXTXT[l][k].trim(), `${l}.${k}`);
});

test('the ten launch languages are translated, not English copies', () => {
  for (const l of ['de', 'fr', 'es', 'pt', 'ja', 'zh', 'id', 'vi', 'th', 'hi'])
    for (const k of ['fxT', 'fxShake', 'fxFlash', 'fxRm', 'fxMusic', 'fxSfx']) assert.notEqual(FXTXT[l][k], FXTXT.en[k], `${l}.${k}`);
});

test('the effects screen prints ON/OFF through the table', () => {
  const i = html.indexOf('function renderFxScr('), body = html.slice(i, html.indexOf('\n}', i));
  assert.doesNotMatch(body, /'ON'|'OFF'/);
  assert.match(body, /t\('fxOn'\)/); assert.match(body, /t\('fxOff'\)/);
  assert.match(body, /t\('fxMusic'\)/); assert.match(body, /t\('fxSfx'\)/);
});
