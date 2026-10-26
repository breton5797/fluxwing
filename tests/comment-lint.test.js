import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readIndex } from './helpers/hitloop.js';

// A trailing `// comment` added in the middle of a long one-line statement silently turns the rest of the line into comment.
// It happened twice (the stage-clear celebration, the hangar's rank badge). This flags a statement sitting after a line comment:
// an if (…) {, a const, or an assignment to a member (a.b = …;).
const CODE_AFTER = /\s(if \([^)]*\)\s*\{|const \w+ = |[\w$]+(\.[\w$]+)+ = )[^\n]*;/;

test('no code hides behind a line comment in index.html', () => {
  const hits = [];
  readIndex().split('\n').forEach((line, i) => {
    const j = line.search(/(^|[^:/'"])\/\/ /); if (j < 0) return;
    const c = line.slice(j + 1);
    if (CODE_AFTER.test(c)) hits.push(`${i + 1}: ${c.slice(0, 120)}`);
  });
  assert.deepEqual(hits, []);
});

test('the hangar shows the rank badge: text and colour are set', () => {
  const html = readIndex(), fn = html.slice(html.indexOf('function renderHangar('), html.indexOf('function fitMenu('));
  const line = fn.split('\n').find(l => l.includes('rar.textContent = t(rarKey(B))'));
  assert.ok(line, 'renderHangar sets the badge text');
  assert.ok(!line.slice(0, line.indexOf('rar.textContent')).includes('//'), 'not behind a comment');
});
