// Zero-dependency static server for local play: `npm run dev` → http://localhost:5173
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.PORT) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

// Resolve a request path inside ROOT, refusing anything that escapes it.
function resolvePath(url) {
  const pathname = decodeURIComponent(new URL(url, 'http://localhost').pathname);
  if (pathname.split(/[\\/]/).some(part => part.startsWith('.'))) return null; // no dotfiles, no '..'
  const file = resolve(join(ROOT, normalize(pathname)));
  return file === ROOT || file.startsWith(ROOT + sep) ? file : null;
}

async function locate(url) {
  const file = resolvePath(url);
  if (!file) return null;
  const info = await stat(file).catch(() => null);
  if (info && info.isDirectory()) {
    const index = join(file, 'index.html');
    return (await stat(index).catch(() => null)) ? index : null;
  }
  return info ? file : null;
}

const server = createServer(async (req, res) => {
  try {
    const file = await locate(req.url || '/');
    if (!file) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    createReadStream(file).on('error', () => res.destroy()).pipe(res);
  } catch (err) {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Bad request');
  }
});

// Loopback only: this is a local play server, not something to expose to the network.
server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`Flux Wing 2 → http://localhost:${PORT}\n`);
});
