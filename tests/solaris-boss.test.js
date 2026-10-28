import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';
import { loadI18N } from './helpers/i18n.js';

// Owner's decision 4 (2026-10-28): after the stage retune SOLARIS at form I still scored more than 2x ZERO on the boss stages (10/25/40/50),
// so its ultimate (Genesis) gives 2 s of invincibility on a boss stage instead of 3.5 s. Every other stage, and COMET's Tail of Fire, are unchanged.
const html = readIndex();
const ultSrc = html.slice(html.indexOf('const ULT = {'), html.indexOf('};', html.indexOf('const ULT = {')) + 2);
const ULT = new Function(`${ultSrc}\nreturn ULT;`)();
const godLine = html.match(/^const ultGod = [^\n]+/m);

test('SOLARIS: 3.5 s of Genesis invincibility, 2 s on a boss stage; no other ultimate has a boss value', () => {
  assert.equal(ULT.solaris.god, 3.5);
  assert.equal(ULT.solaris.bossGod, 2);
  for (const id of Object.keys(ULT)) if (id !== 'solaris' && ULT[id] && typeof ULT[id] === 'object') assert.equal(ULT[id].bossGod, undefined, id);
});

test('ultGod picks the boss value only on a boss stage, and only for a row that has one', () => {
  assert.ok(godLine, 'const ultGod = ...');
  const ultGod = new Function(`${godLine[0]}\nreturn ultGod;`)();
  assert.equal(ultGod(ULT.solaris, true), 2);
  assert.equal(ultGod(ULT.solaris, false), 3.5);
  assert.equal(ultGod(ULT.comet, true), ULT.comet.god, 'COMET keeps its 5 s');
  assert.equal(ultGod({...ULT.solaris, god: 4.2}, false), 4.2, 'a lengthened row (ultRow) keeps its own god off boss stages');
});

test('Genesis applies ultGod with the boss flag of the stage being flown (stage mode only)', () => {
  const uu = html.slice(html.indexOf('function useUlt('), html.indexOf('\n}\n', html.indexOf('function useUlt(')));
  assert.match(uu, /case 'solaris': case 'comet':[\s\S]*?setGod\(ultGod\(u, mode === 'endless' && STAGES\[curStage\]\.boss\)\)/);
  assert.doesNotMatch(uu, /setGod\(u\.god\)/);
});

test('every language tells both durations: 3.5 s, and 2 s on the boss stages (marked ♛ on the stage map)', () => {
  const I = loadI18N(), langs = Object.keys(I);
  assert.equal(langs.length, 23);
  for (const l of langs){
    const s = I[l].ud_solaris;
    assert.ok(s.includes('{n}'), l + ': the coin rain still reads {n}');
    assert.match(s, /3[.,]5/, l + ': 3.5 s');
    assert.match(s, /♛/, l + ': the boss mark');
    assert.match(s, /(^|[^\d.,])2(?![\d.,])/, l + ': 2 s on boss stages');
    if (l !== 'en') assert.notEqual(s, I.en.ud_solaris, l + ' is translated');
  }
});
