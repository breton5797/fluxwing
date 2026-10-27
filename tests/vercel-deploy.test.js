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
    '.well-known/assetlinks.json', 'v2.html', 'src/main.js', 'styles.css', 'guide/index.html', 'guide/img/combo.jpg']){
    assert.ok(existsSync(new URL(p, root)), `${p} exists`);
    assert.ok(!ignored(p), `${p} must be deployed`);
  }
});
