import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadI18NParts } from './helpers/i18n.js';

const P = loadI18NParts(), I = P.I18N;
const en = I.en;
const KEYS = Object.keys(en).filter(k => typeof en[k] === 'string');
const WORLD = ['zh_TW', 'nl', 'ru', 'ms', 'nb', 'ar', 'it', 'tr', 'pl', 'fi', 'he'];
const LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi', ...WORLD];
const ph = s => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(' ') + ' |' + (String(s).split('\n').length - 1);
// strings that are the same in every language on purpose: game terms, unit names, symbols
const SAME_OK = 40;
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the game offers every supported language', () => {
  assert.deepEqual(LANGS.filter(l => !I[l]), []);
  assert.deepEqual(Object.keys(I).sort(), [...LANGS].sort(), 'no language the tests do not know about');
  for (const l of LANGS) assert.ok(I[l]._n && I[l]._n !== en._n || l === 'en', l + ' needs its own name in the menu');
  assert.deepEqual(WORLD.map(l => I[l]._n), ['繁體中文', 'Nederlands', 'Русский', 'Bahasa Melayu', 'Norsk bokmål', 'العربية', 'Italiano', 'Türkçe', 'Polski', 'Suomi', 'עברית']);
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

for (const l of WORLD){
  test(`${l}: the world-launch table has every key itself (no English fallback), none empty`, () => {
    const own = P.I18N_W[l];
    assert.deepEqual(KEYS.filter(k => typeof own[k] !== 'string' || !own[k].trim()), []);
    assert.deepEqual(Object.keys(own).filter(k => !(k in en)), [], 'no stray keys');
  });
  test(`${l}: the effects menu (FXTXT) is translated too`, () => {
    const m = html.match(new RegExp(`\\n    ${l}: \\{ (fxT: .+) \\}`));
    assert.ok(m, l + ' missing in FXTXT');
    for (const k of ['fxT', 'fxAuto', 'fxLow', 'fxMid', 'fxHigh', 'fxShake', 'fxFlash', 'fxRm']) assert.match(m[1], new RegExp(`\\b${k}: "[^"]+"`), `${l}.${k}`);
  });
}
test('no Japanese kana in the Chinese tables', () => {
  for (const l of ['zh', 'zh_TW']) assert.deepEqual(KEYS.filter(k => /[぀-ヿ]/.test(I[l][k])), [], l);
});
test('Western digits everywhere, also in Arabic and Hebrew', () => {
  for (const l of LANGS) assert.deepEqual(KEYS.filter(k => /[٠-٩۰-۹]/.test(I[l][k])), [], l);
});

test('langOf: browser tags map to the game codes', () => {
  const cases = {
    'zh-TW': 'zh_TW', 'zh-HK': 'zh_TW', 'zh-MO': 'zh_TW', 'zh-Hant': 'zh_TW', 'zh-Hant-TW': 'zh_TW', 'zh-Hant-CN': 'zh_TW', zh_TW: 'zh_TW',
    zh: 'zh', 'zh-CN': 'zh', 'zh-SG': 'zh', 'zh-Hans': 'zh', 'zh-Hans-HK': 'zh',
    no: 'nb', 'nb-NO': 'nb', 'nn-NO': 'nb', nb: 'nb', iw: 'he', 'he-IL': 'he', in: 'id', 'id-ID': 'id', 'ms-MY': 'ms', ms: 'ms',
    'ar-SA': 'ar', 'ru-RU': 'ru', 'pt-BR': 'pt', 'en-US': 'en', 'FR-ca': 'fr', '': '',
  };
  for (const [tag, want] of Object.entries(cases)) assert.equal(P.langOf(tag), want, tag);
  for (const l of LANGS) assert.equal(P.langOf(l), l, 'a game code maps to itself: ' + l);
});

test('detectLang: a saved language wins, then the first browser language the game speaks, else English', () => {
  const src = html.match(/function detectLang\(\)\{[\s\S]*?\n\}/)[0];
  const run = (saved, languages) => new Function('store', 'navigator', 'I18N', 'langOf', src + '\nreturn detectLang();')(
    { get: () => saved }, { languages, language: languages[0] }, I, P.langOf);
  assert.equal(run(null, ['zh-HK', 'en']), 'zh_TW');
  assert.equal(run(null, ['zh-Hans-CN']), 'zh');
  assert.equal(run(null, ['nn-NO']), 'nb');
  assert.equal(run(null, ['iw-IL']), 'he');
  assert.equal(run(null, ['xx-YY', 'ms-MY']), 'ms');
  assert.equal(run(null, ['sw-KE']), 'en');
  assert.equal(run('zh_TW', ['ko-KR']), 'zh_TW', 'saved language kept');
  assert.equal(run('xx', ['ar-EG']), 'ar', 'an unknown saved code is ignored');
});

test('RTL: Arabic and Hebrew turn the page right to left, everything else left to right', () => {
  assert.deepEqual([...P.RTL_LANGS], ['ar', 'he']);
  const ap = html.match(/function applyI18n\(\)\{[\s\S]*?\n\}/)[0];
  assert.match(ap, /document\.documentElement\.lang = bcp47\(lang\);/);
  assert.match(ap, /document\.documentElement\.dir = RTL_LANGS\.includes\(lang\) \? 'rtl' : 'ltr';/);
  // run the two lines against a fake root for every language
  for (const l of LANGS){
    const root = {};
    new Function('document', 'lang', 'bcp47', 'RTL_LANGS', ap.split('\n').slice(1, 3).join('\n'))({ documentElement: root }, l, P.bcp47, P.RTL_LANGS);
    assert.equal(root.dir, ['ar', 'he'].includes(l) ? 'rtl' : 'ltr', l);
    assert.equal(root.lang, l === 'zh_TW' ? 'zh-TW' : l, l);
  }
  assert.match(html, /c\.direction = RTL_LANGS\.includes\(lang\) \? 'rtl' : 'ltr';/, 'the share card (a detached canvas) draws in the reading direction');
});

test('Intl gets valid BCP-47 tags with Western digits', () => {
  assert.equal(P.bcp47('zh_TW'), 'zh-TW');
  assert.equal(P.bcp47('nb'), 'nb');
  for (const l of LANGS){
    assert.doesNotThrow(() => new Intl.NumberFormat(P.numLoc(l)), l);
    assert.match(new Intl.NumberFormat(P.numLoc(l)).format(1234567), /^[0-9.,\s  '’]+$/, l);
    assert.match(new Intl.DateTimeFormat(P.numLoc(l), { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date('2026-10-22T00:00:00Z')), /22/, l);
  }
  assert.doesNotMatch(html, /toLocaleString\(\)/, 'numbers follow the game language, not the browser default');
  assert.match(html, /new Intl\.DateTimeFormat\(numLoc\(lang\)/);
});

test('fonts: scripts the Latin faces lack fall back to readable system faces', () => {
  assert.match(html, /--cjk:[^;]*system-ui,sans-serif;/);
  assert.match(html, /:root:lang\(zh-TW\)\{--cjk:"PingFang TC"[^}]*sans-serif\}/);
  assert.match(html, /:root:lang\(ru\),:root:lang\(ar\),:root:lang\(he\)\{--cjk:system-ui[^}]*sans-serif\}/);
  assert.match(html, /:lang\(ar\) \*\{letter-spacing:0!important\}/, 'cursive Arabic is never letter-spaced');
});

test('Korean rarity names: mythic is 신화, never the food word', () => {
  const ko = I.ko; assert.equal(ko.r_mythic, '신화');
  for (const v of Object.values(ko)) assert.doesNotMatch(String(v), /미식/);
});
