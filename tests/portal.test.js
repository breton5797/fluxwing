import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { portalHtml } from '../scripts/portal-build.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the portal build names its ad provider in FW_CONFIG and changes nothing else', () => {
  for (const prov of ['crazygames', 'poki']){
    const out = portalHtml(html, prov);
    assert.match(out, new RegExp(`window\\.FW_CONFIG = \\{ ads: '${prov}', supabaseUrl:`));
    assert.equal(out.length - html.length, `ads: '${prov}', `.length);
  }
});

test('the portal build refuses unknown providers and a page without exactly one FW_CONFIG', () => {
  assert.throws(() => portalHtml(html, 'stub'));
  assert.throws(() => portalHtml(html, "x'}; alert(1); //"));
  assert.throws(() => portalHtml('<html></html>', 'poki'));
  assert.throws(() => portalHtml(html + 'window.FW_CONFIG = { ', 'poki'));
});
