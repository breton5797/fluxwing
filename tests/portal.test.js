import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ASSETS, portalHtml } from '../scripts/portal-build.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('the live page names no ad provider; the portal build swaps in its own and changes nothing else', () => {
  assert.match(html, /window\.FW_CONFIG = \{ ads: 'none', supabaseUrl:/, 'swishby.com ships without ads (no test-build stub for players)');
  for (const prov of ['crazygames', 'poki']){
    const out = portalHtml(html, prov);
    assert.match(out, new RegExp(`window\\.FW_CONFIG = \\{ ads: '${prov}', supabaseUrl:`));
    assert.equal(out.length - html.length, prov.length - 'none'.length);
    assert.equal(out.split("ads: '").length, 2, 'exactly one ads key');
  }
});

test('the portal build refuses unknown providers and a page without exactly one FW_CONFIG', () => {
  assert.throws(() => portalHtml(html, 'stub'));
  assert.throws(() => portalHtml(html, "x'}; alert(1); //"));
  assert.throws(() => portalHtml('<html></html>', 'poki'));
  assert.throws(() => portalHtml(html + "window.FW_CONFIG = { ads: 'none', ", 'poki'));
});

test('the portal build copies every icon the manifest references', () => {
  const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  for (const icon of manifest.icons || []) assert.ok(ASSETS.includes(icon.src), icon.src);
});
