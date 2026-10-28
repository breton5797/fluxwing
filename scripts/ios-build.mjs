// Builds ios-www/ for the iOS app (Capacitor, ios/App): the live index.html with the Supabase SDK served from the app bundle instead
// of the CDN (the identical file: the page's SRI hash still holds), plus every local file the page links. `npm run build:ios`
// then `npx cap sync ios`. The page detects the native shell at run time (native block in index.html); nothing else differs.
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_FILES } from './art-files.mjs';

export const SDK_LOCAL = 'vendor/supabase.js';
export const IOS_ASSETS = ['manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'logo-swishby.png', 'logo-swishby.webp',
  'privacy.html', 'terms.html', 'delete-account.html', 'about/index.html',
  'guide/index.html', ...['title-annotated', 'tut-1', 'tut-3', 'hud-annotated', 'combo', 'dash', 'stages', 'versus-menu', 'versus', 'roster',
    'result-annotated', 'help'].map(n => `guide/img/${n}.jpg`), ...ART_FILES];

export function iosHtml(html){
  const m = html.match(/const SDK_SRC = '([^']+)';/g) || [];
  if (m.length !== 1) throw new Error(`expected one "const SDK_SRC = '…';" in index.html, found ${m.length}`);
  return html.replace(/const SDK_SRC = '[^']+';/, `const SDK_SRC = '${SDK_LOCAL}';`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)){
  const root = new URL('..', import.meta.url), out = new URL('ios-www/', root);
  await rm(out, { recursive: true, force: true });
  await mkdir(new URL('vendor/', out), { recursive: true });
  await writeFile(new URL('index.html', out), iosHtml(await readFile(new URL('index.html', root), 'utf8')));
  await copyFile(new URL('node_modules/@supabase/supabase-js/dist/umd/supabase.js', root), new URL(SDK_LOCAL, out));
  for (const f of IOS_ASSETS){
    const to = new URL(f, out);
    await mkdir(dirname(fileURLToPath(to)), { recursive: true });
    await copyFile(new URL(f, root), to);
  }
  process.stdout.write(`wrote ${fileURLToPath(out)}\n`);
}
