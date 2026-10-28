// Builds dist/<portal>/: index.html with FW_CONFIG.ads set to the portal, plus the files the page links. `npm run build:portal -- poki`
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ART_FILES } from './art-files.mjs';

// The live page ships with ads: 'none' (no provider on swishby.com); the portal build swaps that value for the portal's name
const PORTALS = ['crazygames', 'poki'], HEAD = "window.FW_CONFIG = { ads: 'none', ";
export const ASSETS = ['manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'privacy.html', 'terms.html', ...ART_FILES];

export function portalHtml(html, prov){
  if (!PORTALS.includes(prov)) throw new Error(`portal must be one of ${PORTALS.join(', ')}`);
  const n = html.split(HEAD).length - 1;
  if (n !== 1) throw new Error(`expected one "${HEAD}" in index.html, found ${n}`);
  return html.replace(HEAD, `window.FW_CONFIG = { ads: '${prov}', `);
}

if (process.argv[1] === fileURLToPath(import.meta.url)){
  const prov = process.argv[2], root = new URL('..', import.meta.url), out = new URL(`dist/${prov}/`, root);
  const page = portalHtml(await readFile(new URL('index.html', root), 'utf8'), prov);
  await mkdir(out, { recursive: true });
  await writeFile(new URL('index.html', out), page);
  for (const f of ASSETS){ await mkdir(dirname(fileURLToPath(new URL(f, out))), { recursive: true }); await copyFile(new URL(f, root), new URL(f, out)); }
  process.stdout.write(`wrote ${fileURLToPath(out)}\n`);
}
