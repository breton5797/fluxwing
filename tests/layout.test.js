// Layout guards for the CSS in index.html: safe-area insets applied once, overlays clear of the HUD chrome, touch targets, Korean line breaking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const rules = sel => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(m => m[1].trim() === sel).map(m => m[2]);

test('the :root rules never pad the page with the safe-area inset (the elements add it themselves)', () => {
  const root = rules(':root');
  assert.ok(root.length >= 2, 'both :root rules are found');
  for (const body of root) assert.doesNotMatch(body, /env\(safe-area-inset/);
});

test('the canvas keeps clear of the notch and the home indicator while #stage runs edge to edge', () => {
  const cv = rules('#c').join(';');
  assert.match(cv, /top:env\(safe-area-inset-top/);
  assert.match(cv, /safe-area-inset-bottom/);
});

test('the versus mode switch puts its 3 tabs on one row', () => {
  assert.match(css, /#vsScr \.vsmode\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(css, /\.vsmode\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/, 'the 2-tab season switch keeps 2 columns');
});

test('Korean keeps words whole when a line wraps', () => {
  assert.match(css, /:lang\(ko\) body\{[^}]*word-break:keep-all/);
});

test('the disabled continue-with-coins button looks disabled', () => {
  assert.match(css, /\.contcard \.ghost\[disabled\]\{opacity:\.5;cursor:default\}/);
});

test('card overlays start below the wallet row and the HUD chrome hides behind modals', () => {
  assert.match(rules('.overlay').join(';'), /padding:calc\(56px \+ env\(safe-area-inset-top,0px\)\) 16px calc\(24px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(css, /#menu\{padding-top:calc\(54px/, 'the menu keeps its own top padding');
  assert.match(css, /body:has\(\.overlay:not\(#menu\):not\(#pauseScr\):not\(\[hidden\]\)\) #topBtns/);
});

test('small icon buttons get a 44 px hit area', () => {
  // the ring is laid out from the padding box, inside the 1 px border: 30 + 2×7 = 44 tall; sideways it meets the neighbour in the 4 px gap
  assert.match(css, /#topBtns \.ib::after\{inset:-7px -3px\}#topBtns #pauseBtn::after\{inset:-7px\}/);
  assert.match(css, /\.row \.ghost,#langSel,\.lbhead \.ghost\{min-height:44px\}/);
  assert.match(css, /\.legal a\{[^}]*padding:12px 4px/);
});

test('during play the pause button sits on the physical right, off the RTL hearts', () => {
  assert.match(css, /body\.playing #topBtns\{inset-inline-end:auto;right:12px;left:auto\}/);
});

test('the skill name on the action button wraps to 2 lines instead of an ellipsis', () => {
  const s = rules('.abtn small').join(';');
  assert.match(s, /-webkit-line-clamp:2/);
  assert.match(s, /white-space:normal/);
  assert.match(s, /max-width:60px/);
});
