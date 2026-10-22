import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadShareCard, shareCardBlock } from './helpers/sharecard.js';
import { loadI18N } from './helpers/i18n.js';

const { SHARE_URL, shareMsg, shareUrl, MSGR, messengerFor, messengerUrl, shareCardSpec } = loadShareCard();
const I = loadI18N();
const T = I.en;
const DAY = '2026-10-21';
const daily = { mode: 'daily', score: 1234, gates: 41, combo: 9, day: DAY, dayText: 'Oct 21', stage: 0, zone: 'DUSK ARC', unit: { id: 'volt', name: 'VOLT' }, place: 0 };
const stage = { ...daily, mode: 'endless', stage: 2, zone: 'SOLAR VEIN' };
const byK = (spec, k) => spec.lines.find(l => l.k === k);

test('one messenger per country, and none where the web cannot open it', () => {
  for (const cc of ['BR', 'ID', 'IN', 'MY', 'MX', 'AR', 'CO', 'ES', 'IT', 'DE', 'ZA', 'NG', 'TR', 'SA', 'AE']) assert.equal(messengerFor(cc), 'wa', cc);
  for (const cc of ['TW', 'TH', 'JP']) assert.equal(messengerFor(cc), 'line', cc);
  for (const cc of ['RU', 'UA', 'IR', 'UZ']) assert.equal(messengerFor(cc), 'tg', cc);
  // KakaoTalk needs the Kakao SDK + app key, Messenger a Facebook app id, Zalo has no web share link: the native sheet covers them
  for (const cc of ['KR', 'PH', 'US', 'CA', 'VN', 'FR', 'GB', '', undefined, null, 'XX']) assert.equal(messengerFor(cc), null, String(cc));
  assert.equal(messengerFor('br'), 'wa');
  assert.deepEqual([MSGR.wa.name, MSGR.line.name, MSGR.tg.name], ['WhatsApp', 'LINE', 'Telegram']);
});

test('a messenger link carries the same line as the share sheet', () => {
  const msg = shareMsg(T, daily), link = shareUrl(daily);
  assert.ok(msg.endsWith(' ' + link));
  assert.equal(messengerUrl('wa', msg, link), 'https://wa.me/?text=' + encodeURIComponent(msg));
  assert.equal(messengerUrl('line', msg, link), 'https://line.me/R/share?text=' + encodeURIComponent(msg));
  // Telegram takes the link apart from the text, so the text must not repeat it
  assert.equal(messengerUrl('tg', msg, link), 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(msg.slice(0, -link.length - 1)));
  assert.equal(messengerUrl('tg', 'hi', link), 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=hi');
  assert.equal(messengerUrl('kakao', msg, link), '');
  assert.equal(messengerUrl(null, msg, link), '');
});

test('a daily card: 9:16, the name, the day, the score, gates and combo, the unit, the challenge and the address', () => {
  const s = shareCardSpec(T, daily);
  assert.equal(s.w, 1080); assert.equal(s.h, 1920); assert.equal(s.w / s.h, 9 / 16);
  assert.equal(byK(s, 'brand').text, 'SWISHBY');
  assert.equal(byK(s, 'mode').text, 'Daily Challenge · Oct 21');
  assert.equal(byK(s, 'score').text, '1234');
  assert.equal(byK(s, 'unit').text, 'VOLT');
  assert.equal(s.unit.id, 'volt');
  assert.deepEqual(s.stats, [{ label: 'Gates', value: '41' }, { label: 'Max combo', value: '9' }]);
  assert.equal(byK(s, 'cta').text, 'Can you beat 1234?');
  assert.equal(byK(s, 'url').text, 'swishby.com');
  assert.equal(byK(s, 'place'), undefined, 'no rank line without a rank');
  assert.equal(s.file, 'swishby-daily-2026-10-21-1234.png');
  assert.equal(SHARE_URL, 'https://swishby.com/');
});

test('a daily card names the leaderboard place when the game already has it', () => {
  assert.equal(byK(shareCardSpec(T, { ...daily, place: 7 }), 'place').text, 'Your rank: #7');
  assert.equal(byK(shareCardSpec(T, { ...daily, place: -1 }), 'place'), undefined);
  // the all-time board is about a best that may be another run: a stage card never carries a place
  assert.equal(byK(shareCardSpec(T, { ...stage, place: 3 }), 'place'), undefined);
});

test('a stage card names the stage and its zone, and the day falls back to the key', () => {
  const s = shareCardSpec(T, stage);
  assert.equal(byK(s, 'mode').text, 'STAGE 3 · SOLAR VEIN');
  assert.equal(s.file, 'swishby-1234.png');
  assert.equal(byK(shareCardSpec(T, { ...daily, dayText: '' }), 'mode').text, 'Daily Challenge · 2026-10-21');
});

test('every line sits inside the card, top to bottom, and a missing unit still draws a card', () => {
  for (const r of [daily, { ...daily, place: 2 }, stage, { ...stage, unit: null, score: 0, gates: 0, combo: 0 }]){
    const s = shareCardSpec(T, r);
    let y = 0;
    for (const l of s.lines){
      assert.ok(l.y > y && l.y < s.h, `${l.k} at ${l.y}`); y = l.y;
      assert.ok(l.size > 0 && typeof l.text === 'string' && l.text.length, l.k);
    }
    assert.ok(s.unitY > byK(s, 'mode').y && s.unitY < byK(s, 'score').y);
  }
  assert.equal(shareCardSpec(T, { ...stage, unit: null }).unit, null);
  assert.equal(byK(shareCardSpec(T, { ...stage, unit: null }), 'unit'), undefined);
});

test('the card speaks the player\'s language', () => {
  const s = shareCardSpec(I.ko, { ...daily, place: 4 });
  assert.equal(byK(s, 'cta').text, I.ko.scCta.replace('{n}', '1234'));
  assert.equal(byK(s, 'place').text, '내 순위 4위');
  assert.deepEqual(s.stats.map(x => x.label), [I.ko.gates, I.ko.maxCombo]);
});

test('sharing pays nothing: no wallet, XP or reward inside the share rules (store policy)', () => {
  assert.doesNotMatch(shareCardBlock(), /W\.(coins|gems|dia|xp)|grantXP|saveW|reward/i);
});

test('the new share strings exist in every language', () => {
  const LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi', 'zh_TW', 'nl', 'ru', 'ms', 'nb', 'ar', 'it', 'tr', 'pl', 'fi', 'he'];
  for (const k of ['scCta', 'sendOn', 'saveImg', 'scSaved']){
    for (const l of LANGS){
      assert.equal(typeof I[l][k], 'string', `${l}.${k}`);
      if (l !== 'en') assert.notEqual(I[l][k], I.en[k], `${l}.${k} is still English`);
    }
  }
  for (const l of LANGS){ assert.match(I[l].sendOn, /\{m\}/, l); assert.match(I[l].scCta, /\{n\}/, l); }
});
