// Builds dist/fluxwing2.html: the body of v2.html as a head-less fragment, the shape
// claude.ai Artifacts expect. Publish it together with styles.css and src/*.js.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const html = await readFile(new URL('v2.html', root), 'utf8');
const body = html.match(/<body>([\s\S]*)<\/body>/);
const title = html.match(/<title>[\s\S]*?<\/title>/);
const links = html.match(/<link rel="(?:preconnect|stylesheet)"[^>]*>/g);
if (!body || !title || !links) throw new Error('v2.html is missing <body>, <title> or its stylesheet links');

const page = [title[0], ...links, body[1].trim(), ''].join('\n');
await mkdir(new URL('dist/', root), { recursive: true });
await writeFile(new URL('dist/fluxwing2.html', root), page);
process.stdout.write(`wrote ${fileURLToPath(new URL('dist/fluxwing2.html', root))} (${page.length} bytes)\n`);
