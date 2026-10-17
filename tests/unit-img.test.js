// drawUnitImg (illustrated premium units) must declare every outer value it reads:
// a review pass once added a glow shadow that read `glow` without taking it as a
// parameter, throwing ReferenceError every frame once the unit image loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function fnSource(name) {
  const m = html.match(new RegExp(`function ${name}\\(([^)]*)\\)\\{[\\s\\S]*?\\n}`));
  assert.ok(m, `${name} not found in index.html`);
  return { params: m[1].split(',').map(s => s.trim()), body: m[0] };
}

test('drawUnitImg declares glow when its body uses it', () => {
  const { params, body } = fnSource('drawUnitImg');
  if (/\bglow\b/.test(body.replace(/function drawUnitImg\([^)]*\)/, ''))) {
    assert.ok(params.includes('glow'), 'drawUnitImg reads glow but does not take it as a parameter');
  }
});

test('drawShape forwards glow into the image render path', () => {
  const { body } = fnSource('drawShape');
  const call = body.match(/drawUnitImg\(([^)]*)\)/);
  assert.ok(call, 'drawShape does not call drawUnitImg');
  assert.ok(call[1].split(',').map(s => s.trim()).includes('glow'),
    'drawShape calls drawUnitImg without passing glow');
});
