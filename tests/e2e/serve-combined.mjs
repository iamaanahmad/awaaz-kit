// Serves both built apps on one origin: /order/ and /bill/ (mirrors production hosting).
// Usage: node tests/e2e/serve-combined.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const port = Number(process.argv[2] ?? process.env.E2E_PORT ?? 4173);

const mounts = {
  '/order/': join(root, 'apps', 'order-awaaz', 'dist'),
  '/bill/': join(root, 'apps', 'bill-awaaz', 'dist'),
};

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function resolveFile(pathname) {
  for (const [prefix, dir] of Object.entries(mounts)) {
    const bare = prefix.slice(0, -1);
    if (pathname !== bare && !pathname.startsWith(prefix)) continue;
    const rel = normalize(decodeURIComponent(pathname.slice(prefix.length)));
    const candidate = join(dir, rel);
    if (!candidate.startsWith(dir + sep) && candidate !== dir) return null;
    if (rel !== '.' && rel !== '' && (await isFile(candidate))) return candidate;
    // SPA fallback: unknown paths without an extension get the app shell.
    if (!extname(rel)) return join(dir, 'index.html');
    return null;
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/') {
      res.writeHead(302, { location: '/order/' }).end();
      return;
    }
    const file = await resolveFile(pathname);
    if (!file || !(await isFile(file))) {
      res.writeHead(404).end('Not found');
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': types[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(500).end('Server error');
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`E2E combined preview on http://127.0.0.1:${port}`);
});
