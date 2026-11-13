// Assembles the combined deploy output: dist/index.html (hub), dist/order/, dist/bill/.
// Run after both apps are built (apps/*/dist). Both apps share one origin (Req 1.7, 2.1).
import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');

const apps = [
  { dir: 'order-awaaz', route: 'order' },
  { dir: 'bill-awaaz', route: 'bill' },
];

const hubHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="theme-color" content="#0f766e" />
<title>Awaaz Kit</title>
<style>
  :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: #f4f7f6; color: #12302c; display: flex; flex-direction: column; align-items: center; padding: 3rem 1.25rem; }
  main { width: 100%; max-width: 44rem; }
  h1 { font-size: 2.25rem; margin: 0 0 .5rem; }
  .lead { font-size: 1.1rem; line-height: 1.5; margin: 0 0 2rem; color: #365a54; }
  .cards { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); }
  a.card { display: block; padding: 1.5rem; background: #fff; border: 2px solid #cfe3de; border-radius: 1rem; text-decoration: none; color: inherit; }
  a.card:hover { border-color: #0f766e; }
  a.card:focus-visible { outline: 3px solid #0f766e; outline-offset: 2px; }
  .card h2 { margin: 0 0 .5rem; font-size: 1.4rem; color: #0f766e; }
  .card p { margin: 0 0 1rem; line-height: 1.45; }
  .go { font-weight: 600; color: #0f766e; }
  footer { margin-top: 2.5rem; font-size: .9rem; color: #4d6b66; }
</style>
</head>
<body>
<main>
  <h1>Awaaz Kit</h1>
  <p class="lead">Speak in Hindi or Hinglish. Your shop's orders and bills are captured on this device, even offline.</p>
  <nav class="cards" aria-label="Apps">
    <a class="card" href="/order/">
      <h2>Order Awaaz</h2>
      <p>Speak a customer's order, check it, and save it.</p>
      <span class="go">Open Order Awaaz &rarr;</span>
    </a>
    <a class="card" href="/bill/">
      <h2>Bill Awaaz</h2>
      <p>Speak the items, get an exact total and a printable receipt.</p>
      <span class="go">Open Bill Awaaz &rarr;</span>
    </a>
  </nav>
  <footer>Both apps share one catalog and one speech model on this device.</footer>
</main>
</body>
</html>
`;

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const { dir, route } of apps) {
  const src = path.join(root, 'apps', dir, 'dist');
  try {
    await access(src);
  } catch {
    console.error(`Missing ${path.relative(root, src)}. Build the apps first (pnpm build).`);
    process.exit(1);
  }
  await cp(src, path.join(out, route), { recursive: true });
}

await writeFile(path.join(out, 'index.html'), hubHtml, 'utf8');
console.log('Combined build written to dist/ (index.html, order/, bill/)');
