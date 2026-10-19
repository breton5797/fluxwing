// Builds dist/<portal>/: index.html with FW_CONFIG.ads set to the portal, plus the files the page links. `npm run build:portal -- poki`
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PORTALS = ['crazygames', 'poki'], HEAD = 'window.FW_CONFIG = { ';
export const ASSETS = ['manifest.webmanifest', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'privacy.html', 'terms.html'];

export function portalHtml(html, prov){
  if (!PORTALS.includes(prov)) throw new Error(`portal must be one of ${PORTALS.join(', ')}`);
  const n = html.split(HEAD).length - 1;
  if (n !== 1) throw new Error(`expected one "${HEAD}" in index.html, found ${n}`);
  return html.replace(HEAD, `${HEAD}ads: '${prov}', `);
}

if (process.argv[1] === fileURLToPath(import.meta.url)){
  const prov = process.argv[2], root = new URL('..', import.meta.url), out = new URL(`dist/${prov}/`, root);
  const page = portalHtml(await readFile(new URL('index.html', root), 'utf8'), prov);
  await mkdir(out, { recursive: true });
  await writeFile(new URL('index.html', out), page);
  for (const f of ASSETS) await copyFile(new URL(f, root), new URL(f, out));
  process.stdout.write(`wrote ${fileURLToPath(out)}\n`);
}
