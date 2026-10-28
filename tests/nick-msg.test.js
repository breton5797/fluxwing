// The name form's answers (nick-msg block of index.html) and the long-press guard on the play surface.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18NParts } from './helpers/i18n.js';

const html = readIndex();
const block = () => {
  const m = html.match(/\/\* nick-msg:start[\s\S]*?\/\* nick-msg:end \*\//);
  if (!m) throw new Error('nick-msg block not found in index.html');
  return new Function(`${m[0]}\nreturn {nickReply, nickShort};`)();
};
const P = loadI18NParts(), I = P.I18N;

test('nickShort: under 2 code points after cleaning is too short, as the server counts it', () => {
  const { nickShort } = block();
  for (const v of ['', 'a', '가', '😀']) assert.equal(nickShort(v), true, JSON.stringify(v));
  for (const v of ['ab', '가나', '😀😀', 'Pilot']) assert.equal(nickShort(v), false, JSON.stringify(v));
});

test('nickReply: the rate limit has its own message, a lost answer stays seaFail', () => {
  const { nickReply } = block();
  const rate = { error: { message: 'fw_rate_limited: too many name changes, try later', code: 'P0001', details: null, hint: null } };
  assert.deepEqual(nickReply('Ace', rate), { nick: null, key: 'nickRate' });
  assert.deepEqual(nickReply('Ace', { error: { message: 'TypeError: Failed to fetch' } }), { nick: null, key: 'seaFail' });
  assert.deepEqual(nickReply('Ace', { error: {} }), { nick: null, key: 'seaFail' });
  assert.deepEqual(nickReply('Ace', { error: { message: 'fw_bad_input: no name' } }), { nick: null, key: 'seaFail' });
  assert.deepEqual(nickReply('Ace', { data: null }), { nick: null, key: 'seaFail' });
  assert.deepEqual(nickReply('Ace', { data: '' }), { nick: null, key: 'seaFail' });
  assert.deepEqual(nickReply('Ace', {}), { nick: null, key: 'seaFail' });
});

test('nickReply: a name the server filter turned into Pilot is answered as refused, the server name is kept', () => {
  const { nickReply } = block();
  assert.deepEqual(nickReply('Badword', { data: 'Pilot' }), { nick: 'Pilot', key: 'nickNo' });
  assert.deepEqual(nickReply('Pilot', { data: 'Pilot' }), { nick: 'Pilot', key: 'saved' }, 'a player who typed Pilot gets Pilot');
  assert.deepEqual(nickReply('Ace', { data: 'Ace' }), { nick: 'Ace', key: 'saved' });
});

test('the name form uses the answers: too short, server reply, rate limit', () => {
  const h = html.match(/\$\('nickForm'\)\.addEventListener\('submit'[\s\S]*?\n\}\);/);
  assert.ok(h, 'nick form handler not found');
  assert.match(h[0], /nickShort\(v\)[^\n]*t\('nickShort'\)/, 'a too-short name says so');
  assert.match(h[0], /nickReply\(v, r\)/, 'the server answer goes through nickReply');
  assert.doesNotMatch(h[0], /statusMsg = t\('seaFail'\)/, 'seaFail is no longer the answer to every error');
});

test('offline save: the board shows the save together with the offline notice', () => {
  const r = html.match(/function renderLB\(\)\{[\s\S]*?\n\}/)[0];
  assert.match(r, /statusMsg === t\('saved'\) \? t\('saved'\) \+ ' · ' \+ t\('offline'\) : t\('offline'\)/);
});

test('new name-form strings exist in all 23 languages, each its own', () => {
  const langs = Object.keys(I);
  assert.equal(langs.length, 23);
  for (const k of ['nickRate', 'nickShort']) {
    assert.ok(typeof I.en[k] === 'string' && I.en[k].trim(), 'en.' + k);
    for (const l of langs) {
      assert.ok(typeof I[l][k] === 'string' && I[l][k].trim(), `${l}.${k}`);
      if (l !== 'en') assert.notEqual(I[l][k], I.en[k], `${l}.${k} is still English`);
    }
    for (const l of Object.keys(P.I18N_W)) assert.ok(typeof P.I18N_W[l][k] === 'string', `I18N_W.${l}.${k}`);
  }
  assert.equal(I.ko.nickShort, '이름은 2자 이상이어야 해요');
});

test('Android long-press: no context menu on the canvas and the in-game buttons, menus keep theirs', () => {
  const m = html.match(/\[([^\]]*)\]\.forEach\(el => el\.addEventListener\('contextmenu', e => e\.preventDefault\(\)\)\);/);
  assert.ok(m, 'contextmenu guard not found');
  for (const el of ['cv', "$('dashBtn')", "$('skillBtn')", "$('ultBtn')", "$('pauseBtn')"]) assert.ok(m[1].includes(el), el);
  assert.equal((html.match(/'contextmenu'/g) || []).length, 1, 'one guard only: never on document / window (text fields keep copy and paste)');
  assert.match(html, /const cv = document\.getElementById\('c'\)/, 'cv is the game canvas (also the glide hold area)');
});
