// Vercel deploy (production = main → swishby.com): .vercelignore keeps the repo's non-site folders off the public site
// and never drops a file the pages load.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const ignore = readFileSync(new URL('.vercelignore', root), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const ignored = path => ignore.some(p => path === p.replace(/^\//, '').replace(/\/$/, '') || path.startsWith(p.replace(/^\//, '').replace(/\/$/, '') + '/'));

test('repo-only folders stay off the public site', () => {
  for (const p of ['tests', 'scripts', 'supabase', 'docs', 'marketing', 'ios', 'android', 'node_modules', 'package.json', 'package-lock.json'])
    assert.ok(ignored(p), `${p} should be ignored`);
});

test('every page and file the site serves is still deployed', () => {
  for (const p of ['index.html', 'admin.html', 'about/index.html', 'privacy.html', 'terms.html', 'delete-account.html', 'manifest.webmanifest',
    'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'logo-swishby.png', 'og-swishby.png', 'fx-config.json', 'sw.js',
    '.well-known/assetlinks.json', 'styles.css', 'guide/index.html', 'guide/img/combo.jpg']){
    assert.ok(existsSync(new URL(p, root)), `${p} exists`);
    assert.ok(!ignored(p), `${p} must be deployed`);
  }
});

// The old 'Flux Wing 2' prototype (v2.html + src/*.js) stays in the repo but off the public site; no live page loads from src/.
test('the legacy prototype is not deployed, and no live page needs it', () => {
  for (const p of ['v2.html', 'src', 'src/main.js']) assert.ok(ignored(p), `${p} should be ignored`);
  for (const p of ['index.html', 'admin.html', 'about/index.html', 'guide/index.html', 'privacy.html', 'terms.html', 'delete-account.html', 'sw.js']){
    const s = readFileSync(new URL(p, root), 'utf8');
    assert.doesNotMatch(s, /(?:src|href)\s*=\s*["']\.?\/?(?:src\/|v2\.html)|import\s*\(?\s*["']\.?\/?src\/|(?:fetch|register)\(\s*["']\.?\/?(?:src\/|v2\.html)/, `${p} loads nothing from src/ or v2.html`);
  }
});

// Headers (vercel.json): the admin page cannot be framed and sends no referrer; every page sends nosniff and a referrer
// policy; the game carries a report-only CSP (the enforcing one comes later); the service worker is never cached.
const vj = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
const hdrs = src => { const r = (vj.headers || []).find(h => h.source === src); assert.ok(r, `a headers rule for ${src}`); return Object.fromEntries(r.headers.map(h => [h.key.toLowerCase(), h.value])); };

test('vercel.json: headers only, the static deploy is unchanged', () => {
  assert.deepEqual(Object.keys(vj).filter(k => k !== '$schema').sort(), ['headers']);
});

test('vercel.json: the admin page cannot be framed and sends no referrer', () => {
  const a = hdrs('/admin.html');
  assert.equal(a['x-frame-options'], 'DENY');
  assert.match(a['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(a['referrer-policy'], 'no-referrer');
});

test('vercel.json: every route sends nosniff and a referrer policy; the game a report-only CSP', () => {
  const all = hdrs('/(.*)');
  assert.equal(all['x-content-type-options'], 'nosniff');
  assert.equal(all['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.ok(!all['content-security-policy'], 'nothing enforced on the game yet');
  const csp = all['content-security-policy-report-only'];
  for (const h of ["'self'", 'https://cdn.jsdelivr.net', 'https://challenges.cloudflare.com', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com', 'https://*.supabase.co', 'wss://*.supabase.co', "frame-ancestors 'self'"])
    assert.ok(csp.includes(h), `report-only CSP lists ${h}`);
  // the rules apply in order and a later one wins: the admin rule must come after the catch-all
  const i = src => vj.headers.findIndex(h => h.source === src);
  assert.ok(i('/admin.html') > i('/(.*)'), 'admin headers override the catch-all');
});

test('vercel.json: the service worker is revalidated on every load', () => {
  assert.equal(hdrs('/sw.js')['cache-control'], 'no-cache');
});
