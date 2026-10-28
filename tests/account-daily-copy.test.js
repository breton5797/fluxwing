// Owner decisions of 2026-10-28 (package account-daily-copy):
//  28 sign-in entry points: an account icon in the menu top bar, a one-time "save your progress" prompt after the first stage clear, a sign-in button on the versus guest note
//  14 daily streak: one missed UTC day is forgiven, and the fresh daily button says how many hours are left
//  27 copy: 4 power-ups (not 3), the stage mode is not called "Endless", versus RP is Elo (+20..+80), not +50/−50
//  33 legal pages: the English version prevails if the Korean and English texts differ
//   8 iPad: the bands beside the 560 px play column show a blurred, dimmed copy of the zone backdrop
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { loadI18NParts } from './helpers/i18n.js';
import { loadHitLoop } from './helpers/hitloop.js';
import { buildAbout } from '../scripts/about-build.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const P = loadI18NParts(), I = P.I18N;
const WORLD = ['zh_TW', 'nl', 'ru', 'ms', 'nb', 'ar', 'it', 'tr', 'pl', 'fi', 'he'];
const LANGS = ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'fr', 'de', 'id', 'vi', 'th', 'hi', ...WORLD];
const H = loadHitLoop();
const css = html.slice(0, html.indexOf('</head>'));

// ---------- 14: daily streak grace + hours left ----------
test('daily streak: one missed UTC day keeps the streak (ti - li <= 2), two missed days reset it', () => {
  const { dailyStreakNext } = H;
  assert.deepEqual(dailyStreakNext({ last: '2026-10-13', streak: 4 }, '2026-10-14'), { last: '2026-10-14', streak: 5, claimed: false });
  assert.deepEqual(dailyStreakNext({ last: '2026-10-13', streak: 4 }, '2026-10-15'), { last: '2026-10-15', streak: 5, claimed: false }, 'one day missed: kept');
  assert.deepEqual(dailyStreakNext({ last: '2026-10-13', streak: 4 }, '2026-10-16'), { last: '2026-10-16', streak: 1, claimed: false }, 'two days missed: reset');
  assert.deepEqual(dailyStreakNext({ last: '2026-10-15', streak: 4 }, '2026-10-13'), { last: '2026-10-13', streak: 1, claimed: false }, 'a clock that went back never grows it');
  assert.deepEqual(dailyStreakNext({ last: '2026-10-31', streak: 6 }, '2026-11-02'), { last: '2026-11-02', streak: 7, claimed: false }, 'across a month end');
});

test('daily hours left: whole hours rounded up, 1..24', () => {
  const { dailyLeftH } = H;
  assert.equal(dailyLeftH(23.2 * 36e5), 24);
  assert.equal(dailyLeftH(5 * 36e5), 5);
  assert.equal(dailyLeftH(5 * 36e5 + 1), 6);
  assert.equal(dailyLeftH(60e3), 1);
  assert.equal(dailyLeftH(0), 1);
  assert.equal(dailyLeftH(-5), 1);
  assert.equal(dailyLeftH(30 * 36e5), 24);
});

test('the fresh daily button prints the hours left until the UTC reset; the course stays on UTC', () => {
  const fn = html.slice(html.indexOf('function updateDaily(){'), html.indexOf('setInterval(updateDaily'));
  assert.match(fn, /t\('dailyFresh', \{[^}]*\}\) \+ ' · ' \+ t\('dailyLeft', \{n: dailyLeftH\(msToNextDay\(\)\)\}\)/);
  assert.match(html, /function msToNextDay\(\)\{ const n = new Date\(\); return Date\.UTC\(/, 'the reset is still UTC midnight');
});

// ---------- new strings, all 23 languages ----------
const NEW = ['signIn', 'later', 'savePr', 'dailyLeft'];
test('new strings exist in all 23 languages, own words, and the world tables carry them', () => {
  for (const l of LANGS) for (const k of NEW) assert.ok(typeof I[l][k] === 'string' && I[l][k].trim(), `${l}.${k}`);
  for (const l of WORLD) for (const k of NEW) assert.ok(typeof P.I18N_W[l][k] === 'string', `I18N_W.${l}.${k}`);
  for (const l of LANGS) assert.match(I[l].dailyLeft, /\{n\}/, l);
  for (const l of LANGS.filter(l => l !== 'en')) assert.notEqual(I[l].savePr, I.en.savePr, l + ' savePr translated');
  for (const l of LANGS.filter(l => l !== 'en')) assert.notEqual(I[l].signIn, I.en.signIn, l + ' signIn translated');
});

// ---------- 27: copy ----------
test('copy: four power-ups in every language (the game has shield, magnet, slow-mo and rush)', () => {
  assert.match(html, /const powKind = [^\n]*'potion'/);
  for (const l of LANGS){ assert.match(I[l].c4, /4/, l + ' c4'); assert.doesNotMatch(I[l].c4, /3/, l + ' c4'); }
});

test('copy: the stage mode is not called endless / infinite in any language', () => {
  const bad = /endless|infinit|infini|endlos|tanpa batas|tanpa henti|vô tận|ไม่รู้จบ|अंतहीन|無盡|无尽|エンドレス|무한|eindeloos|бесконеч|uendelig|بلا نهاية|sonsuz|bez końca|loputon|אינסופי/i;
  for (const l of LANGS) for (const k of ['endless', 'modeEndless']){
    assert.doesNotMatch(I[l][k], bad, `${l}.${k} = ${I[l][k]}`);
    assert.equal(I[l].endless, I[l].modeEndless, l + ' one name for the stage mode');
  }
  assert.equal(I.en.endless, 'Stage mode'); assert.equal(I.ko.endless, '스테이지 모드');
});

test('about page: 4 power-ups and Elo RP (+20..+80), never +50/−50 for a 1v1 win', () => {
  const page = buildAbout();
  assert.equal(read('about/index.html'), page, 'about/index.html rebuilt');
  const data = JSON.parse(page.match(/<script id="about-data" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  for (const [l, L] of Object.entries(data.langs)){
    assert.doesNotMatch(L.m_vs_d, /[+＋]50|−50|-50/, l + ' m_vs_d');
    assert.match(L.m_vs_d, /\+?20/, l + ' m_vs_d names the 20 floor'); assert.match(L.m_vs_d, /80/, l + ' m_vs_d names the 80 cap');
    assert.match(L.s4, /4|four|vier|quatre|cuatro|quatro/i, l + ' s4'); assert.doesNotMatch(L.s4, /3|three|trois|drei|tres|três/i, l + ' s4');
  }
});

test('about page: the versus card headline is Elo RP (+20~80), not the old +50 / −50', () => {
  const page = buildAbout();
  const at = page.indexOf('<article class="mode vs">');
  const card = page.slice(at, page.indexOf('</article>', at));
  const big = card.match(/<span class="big">([^<]*)<\/span>/)[1];
  assert.doesNotMatch(big, /50/, 'no +50 / −50 headline');
  assert.match(big, /20/); assert.match(big, /80/);
  assert.doesNotMatch(page, /[+＋]50 \/ [−-]50/, 'nowhere on the about page');
});

// ---------- CSS integrity: an unclosed comment once swallowed the sign-in sheet's rules ----------
test('CSS head: every /* comment is closed, no comment swallows a rule, and the sign-in sheet rules are live', () => {
  const styles = [...css.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
  assert.ok(styles.length >= 2);
  for (const s of styles){
    assert.equal(s.split('/*').length - 1, s.split('*/').length - 1, 'balanced comment markers');
    for (const c of s.match(/\/\*[\s\S]*?\*\//g) || []) assert.doesNotMatch(c, /[{}]/, 'a comment holds no rule: ' + c.slice(0, 80));
  }
  const live = styles.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const sel of ['.authcard{', '.ahero .aicon{width:44px;height:44px', '.abenefits{list-style:none', '.sbtn{display:flex', '.sbtn.google{', '.aform{', '.sstar{', '.testertag{', '.authcard #authAsk .ghost'])
    assert.ok(live.includes(sel), sel + ' is outside any comment');
});

// ---------- 28: sign-in entry points ----------
test('menu top bar: an account icon that opens the existing sign-in sheet (or the signed-in card)', () => {
  const bar = html.slice(html.indexOf('<div id="topBtns">'), html.indexOf('</div>', html.indexOf('<div id="topBtns">')));
  assert.match(bar, /<button class="ib" id="acctTop" aria-label="Account" hidden><svg/);
  assert.match(html, /\$\('acctTop'\)\.addEventListener\('click', e => \{ e\.stopPropagation\(\); audioInit\(\); acctOpen\(\); \}\);/);
  assert.match(html, /\$\('acctBtn'\)\.addEventListener\('click', e => \{ e\.stopPropagation\(\); audioInit\(\); acctOpen\(\); \}\);/, 'one path for both buttons');
  assert.match(html, /function acctOpen\(\)\{ authOpen\(authAnon\(\) \? \(authMail \? 'code' : 'pick'\) : 'out'\); \}/);
  const ra = html.slice(html.indexOf('function renderAcct(){'), html.indexOf('async function authOAuth'));
  assert.match(ra, /\$\('acctTop'\)\.hidden = !on;/); assert.match(ra, /\$\('acctTop'\)\.classList\.toggle\('in', !authAnon\(\)\)/);
  assert.match(html, /\['acctTop', 'acct'\]/, 'aria-label in the game language');
  // five buttons now fit: the wallet keeps clear of them
  assert.match(css, /max-width:calc\(100% - 252px\);z-index:3\}   \/\* never under #topBtns: 5 buttons/);
  assert.match(css, /\.wallet\{inset-inline-start:8px;gap:2px;max-width:calc\(100% - 200px\)\}/);
  assert.match(css, /\.wallet\{gap:1px;max-width:calc\(100% - 176px\)\}/);
});

test('result card: a one-time "save your progress" prompt after the first stage clear, for a guest only', () => {
  const { savePromptDue } = H;
  assert.equal(savePromptDue({ clear: true, guest: true, auth: true, seen: false }), true);
  assert.equal(savePromptDue({ clear: false, guest: true, auth: true, seen: false }), false, 'only after a clear');
  assert.equal(savePromptDue({ clear: true, guest: false, auth: true, seen: false }), false, 'signed in already');
  assert.equal(savePromptDue({ clear: true, guest: true, auth: false, seen: false }), false, 'no sign-in on this build');
  assert.equal(savePromptDue({ clear: true, guest: true, auth: true, seen: true }), false, 'once');
  const card = html.slice(html.indexOf('id="over"'), html.indexOf('id="stageScr"'));
  assert.match(card, /<div class="refnudge savepr" id="oSave" hidden><span data-i18n="savePr"><\/span><button class="ghost primary" id="oSaveGo" data-i18n="signIn"><\/button><button class="ghost" id="oSaveX" data-i18n="later"><\/button><\/div>/);
  assert.match(html, /function savePrompt\(\)\{/);
  const fn = html.slice(html.indexOf('function savePrompt(){'), html.indexOf('\n}', html.indexOf('function savePrompt(){')));
  assert.match(fn, /savePromptDue\(\{clear: mode === 'endless' && !!FX\.clearDone, guest: authAnon\(\), auth: acctOn\(\), seen: !!store\.get\('fw27_savepr', 0\)\}\)/);
  assert.match(fn, /store\.set\('fw27_savepr', 1\)/, 'shown once, then never again on this device');
  assert.match(html, /\$\('oSaveGo'\)\.addEventListener\('click', e => \{ e\.stopPropagation\(\); \$\('oSave'\)\.hidden = true; acctOpen\(\); \}\);/);
  assert.match(html, /\$\('oSaveX'\)\.addEventListener\('click', e => \{ e\.stopPropagation\(\); \$\('oSave'\)\.hidden = true; \}\);/);
  assert.match(html, /refNudge\([^\n]*\); savePrompt\(\);/, 'decided with the result card');
  const local = html.slice(html.indexOf('const FS_LOCAL'), html.indexOf(']);', html.indexOf('const FS_LOCAL')));
  assert.ok(local.includes("'fw27_savepr'"), 'the prompt flag stays on this device');
});

test('versus guest note: a sign-in button next to it, shown with it', () => {
  const vs = html.slice(html.indexOf('id="vsScr"'), html.indexOf('id="vsMain"'));
  assert.match(vs, /<div class="vsguest" id="vsGuestRow" hidden><span class="vsseason" id="vsGuest" data-i18n="vsGuest"><\/span><button class="ghost primary" id="vsGuestGo" data-i18n="signIn"><\/button><\/div>/);
  assert.doesNotMatch(html, /\$\('vsGuest'\)\.hidden/, 'the row hides, not the text');
  assert.match(html, /\$\('vsGuestRow'\)\.hidden = !vsGuest\(\);/);
  assert.match(html, /\$\('vsGuestGo'\)\.addEventListener\('click', e => \{ e\.stopPropagation\(\); audioInit\(\); acctOpen\(\); \}\);/);
  // the sheet opens on top of the versus sheet: same z-index as #vsScr and later in the DOM
  assert.match(css, /#authScr\{z-index:6\}/); assert.match(css, /#contScr,#vsScr,#stageScr,#helpScr,#dIntro\{z-index:6\}/);
  assert.ok(html.indexOf('id="authScr"') > html.indexOf('id="vsScr"'));
});

// ---------- 33: legal pages ----------
test('legal pages: the English version prevails if the versions differ (said in Korean and in English)', () => {
  for (const p of ['terms.html', 'privacy.html']){
    const h = read(p), ko = h.slice(h.indexOf('<section id="ko">'), h.indexOf('<section id="en"')), en = h.slice(h.indexOf('<section id="en"'));
    assert.match(ko, /한국어판과 영문판의 내용이 다를 경우 영문판이 우선합니다\./, p + ' ko');
    assert.match(en, /If the Korean and English versions differ, the English version prevails\./, p + ' en');
    assert.doesNotMatch(h, /Korean text above is the governing version/, p + ': no sentence that says the opposite');
  }
});

// ---------- 8: iPad side bands ----------
test('iPad: the side bands show a blurred, dimmed copy of the zone backdrop; the play column stays 560 px', () => {
  assert.match(css, /#stage\{position:relative;height:100%;width:100%;max-width:560px;margin:0 auto;overflow:hidden;background:#000\}/);
  assert.match(html, /<canvas id="sideBg" aria-hidden="true" width="48" height="64"><\/canvas>\n\n<div id="stage">/);
  assert.match(css, /#sideBg\{position:fixed;[^}]*filter:blur\(\d+px\) brightness\(\.\d+\)[^}]*pointer-events:none[^}]*display:none\}/);
  assert.match(css, /body\.wide #sideBg\{display:block\}/);
  const r = html.slice(html.indexOf('function render(){'), html.indexOf('skyEvent();', html.indexOf('function render(){')));
  assert.match(r, /\[bgGrove, bgCanyon, bgMagma, bgPalace\]\[zoneIdx\]\(\);[^\n]*\n  sideCopy\(\);/, 'copied right after the backdrop, before any gate or bird');
  const fn = html.slice(html.indexOf('function sideCopy(){'), html.indexOf('\n}', html.indexOf('function sideCopy(){')));
  assert.match(fn, /const now = performance\.now\(\); if \(!sideOn \|\| now - sideT < 250\) return;/, 'only with side bands, 4 times a second (wall clock: T restarts each run)');
  assert.match(html, /sideOn = innerWidth > \$\('stage'\)\.clientWidth \+ 8; document\.body\.classList\.toggle\('wide', sideOn\);/);
});
